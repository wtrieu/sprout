/**
 * Capture: the "Add to Atlas" box. A seed is something the owner brought — a
 * title, a link, a half-formed idea — and the next draft (the weekly note, or
 * a fresh map's draft) places it: one model call per seed, shown the map's
 * outline, answering attach / new_map / dismiss.
 *
 * Select, don't generate: an attach must name one of the offered branch ids;
 * anything else is an invalid placement and the seed stays pending for the
 * next run. A link seed also proposes a `web` reading, which goes through the
 * same machine verification as every other reading.
 */
import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../../db/client";
import { atlasMaps, atlasNodes, atlasSeeds, type AtlasNodeKind, type AtlasSeedKind } from "../../db/schema";
import { atlasModels, cliLlm, type AtlasLlm } from "./llm";
import { storeReadings } from "./rungs";
import { normalizeTitle, verifyReadings, type FetchLike } from "./verify";

export type SeedRow = typeof atlasSeeds.$inferSelect;

// --- kind detection ------------------------------------------------------------

const HTTP_URL_RE = /https?:\/\/[^\s<>"']+/i;
const BARE_DOMAIN_RE = /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/?#]\S*)?$/i;

/** The absolute URL a seed carries, or null. A bare domain path gets https://. */
export const extractSeedUrl = (text: string): string | null => {
  const t = text.trim();
  const found = HTTP_URL_RE.exec(t);
  if (found) {
    const candidate = found[0].replace(/[.,;:!?)\]]+$/, "");
    try {
      const u = new URL(candidate);
      if (u.protocol === "http:" || u.protocol === "https:") return candidate;
    } catch {
      // not a URL after all — fall through to the other readings
    }
  }
  if (!/\s/.test(t) && BARE_DOMAIN_RE.test(t)) {
    try {
      return new URL(`https://${t}`).toString();
    } catch {
      return null;
    }
  }
  return null;
};

// Words a title may leave lowercase ("Thinking, Fast and Slow by Daniel Kahneman").
const TITLE_SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "of", "on", "or", "the", "to", "vs", "with",
]);
const QUOTE_PAIRS = /^(["'“‘«])(.+)(["'”’»])$/s;

export const detectSeedKind = (text: string): AtlasSeedKind => {
  const t = text.trim();
  if (extractSeedUrl(t)) return "url";
  const quoted = QUOTE_PAIRS.exec(t);
  const words = (quoted ? quoted[2] : t).trim().split(/\s+/).filter(Boolean);
  if (quoted && words.length <= 12) return "title";
  if (words.length === 0 || words.length > 10 || /[?!.]$/.test(t)) return "idea";
  const titleish = words.every((w, i) => {
    const bare = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!bare) return true;
    if (i > 0 && TITLE_SMALL_WORDS.has(bare.toLowerCase())) return true;
    return /^[\p{Lu}\p{N}]/u.test(bare);
  });
  return titleish ? "title" : "idea";
};

// --- placement -----------------------------------------------------------------

const PlacementSchema = z.object({
  action: z.enum(["attach", "new_map", "dismiss"]),
  parentId: z.number().int().nullish(),
  title: z.string().trim().min(1).max(120).nullish(),
  blurb: z.string().trim().min(1).max(300).nullish(),
  kind: z.enum(["school", "thinker", "concept", "text"]).nullish(),
  reason: z.string().trim().min(1).max(500),
});
type Placement = z.infer<typeof PlacementSchema>;

type NodeRow = typeof atlasNodes.$inferSelect;

const outlineFor = (nodes: readonly NodeRow[]): string => {
  const branches = nodes.filter((n) => n.parentId === null).sort((a, b) => a.position - b.position || a.id - b.id);
  return branches
    .map((b) => {
      const kids = nodes
        .filter((n) => n.parentId === b.id)
        .sort((x, y) => x.position - y.position || x.id - y.id)
        .map((c) => `    - ${c.title}`)
        .join("\n");
      return `[${b.id}] ${b.title} — ${b.blurb}${kids ? `\n${kids}` : ""}`;
    })
    .join("\n");
};

export const buildPlacementPrompt = (input: {
  mapTitle: string;
  mapBlurb: string | null;
  outline: string;
  seed: Pick<SeedRow, "text" | "kind" | "url">;
}): string => `You are placing one item the map's owner added to their personal curiosity atlas.

THE MAP: ${input.mapTitle}${input.mapBlurb ? ` — ${input.mapBlurb}` : ""}
Its branches, as [id] title — question, with the nodes already under each:
${input.outline}

THE ITEM (${input.seed.kind}): ${input.seed.text}
${input.seed.kind === "url" ? "It is a link; you cannot open it, so judge from the address and any words the owner wrote.\n" : ""}
Choose exactly one action:
- "attach": it belongs under one branch above. Set parentId to that branch's id (a number from the list, never a new one), and write title (the node's name, 2-6 words, plain text), blurb (one line: the live question it answers) and kind (one of school, thinker, concept, text).
- "new_map": it is a different field from this map. Set title to a name for a map that would hold it.
- "dismiss": it is not a learnable topic, or it is already on the map. Say which.
Always give a one-sentence reason.

Return JSON only, no prose: { "action": "attach", "parentId": 12, "title": "...", "blurb": "...", "kind": "concept", "reason": "..." }`;

export type SeedDeps = {
  llm?: AtlasLlm;
  fetchImpl?: FetchLike;
  log?: (msg: string) => void;
};

export type PlaceResult = {
  /** Seeds attached this run, with the node each created. */
  attached: Array<{ seedId: number; nodeId: number }>;
  newMap: number;
  dismissed: number;
  /** Left pending: an invalid placement or a failed call. */
  pending: number;
};

/** The seed text minus its link ("Radiolab on Stoicism https://…"), or null when nothing is left. */
const proposalTitle = (seed: SeedRow): string | null => {
  const rest = seed.text.replace(HTTP_URL_RE, "").replace(/\s+/g, " ").trim();
  return rest.length >= 2 && !BARE_DOMAIN_RE.test(rest) ? rest : null;
};

export const placePendingSeeds = async (
  db: DB,
  mapId: number,
  deps: SeedDeps = {},
): Promise<PlaceResult> => {
  const llm = deps.llm ?? cliLlm;
  const fetchImpl = deps.fetchImpl ?? (fetch as FetchLike);
  const log = deps.log ?? console.log;
  const result: PlaceResult = { attached: [], newMap: 0, dismissed: 0, pending: 0 };

  const pending = db
    .select()
    .from(atlasSeeds)
    .where(eq(atlasSeeds.status, "pending"))
    .orderBy(asc(atlasSeeds.id))
    .all();
  if (pending.length === 0) return result;

  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, mapId)).get();
  if (!map) {
    log(`seeds: map #${mapId} not found — ${pending.length} seed(s) stay pending`);
    result.pending = pending.length;
    return result;
  }
  const model = atlasModels().writer;

  for (const seed of pending) {
    // Re-read each time: an earlier seed's node is part of the outline now.
    const nodes = db.select().from(atlasNodes).where(eq(atlasNodes.mapId, mapId)).all();
    const branchIds = new Set(nodes.filter((n) => n.parentId === null).map((n) => n.id));
    let placement: Placement;
    try {
      placement = llm(
        buildPlacementPrompt({
          mapTitle: map.title,
          mapBlurb: map.blurb,
          outline: outlineFor(nodes),
          seed,
        }),
        PlacementSchema,
        { model, label: `place seed #${seed.id}` },
      );
    } catch (err) {
      log(`seed #${seed.id}: placement call failed (${err instanceof Error ? err.message : err}) — stays pending`);
      result.pending += 1;
      continue;
    }

    // Every resolution is conditional on the seed still being pending: the
    // model call above is slow (spawnSync), and a concurrent note/draft-map
    // run may have resolved this seed in the meantime. A write that lands on
    // 0 rows lost the race — skip, never double-resolve.
    const resolvedAt = new Date();
    const stillPending = and(eq(atlasSeeds.id, seed.id), eq(atlasSeeds.status, "pending"));
    if (placement.action === "dismiss") {
      const r = db
        .update(atlasSeeds)
        .set({ status: "dismissed", resolution: placement.reason, resolvedAt })
        .where(stillPending)
        .run();
      if (r.changes === 0) {
        log(`seed #${seed.id}: already resolved by another run — skipped`);
        continue;
      }
      result.dismissed += 1;
      log(`seed #${seed.id}: dismissed — ${placement.reason}`);
      continue;
    }

    if (placement.action === "new_map") {
      const r = db
        .update(atlasSeeds)
        .set({ status: "new_map", resolution: placement.title ?? placement.reason, resolvedAt })
        .where(stillPending)
        .run();
      if (r.changes === 0) {
        log(`seed #${seed.id}: already resolved by another run — skipped`);
        continue;
      }
      result.newMap += 1;
      log(`seed #${seed.id}: suggests a new map "${placement.title ?? placement.reason}"`);
      continue;
    }

    // attach — select, don't generate: the parent must be a branch we offered
    const { parentId, title, blurb } = placement;
    if (parentId == null || !branchIds.has(parentId) || !title || !blurb) {
      log(
        `seed #${seed.id}: invalid placement (parentId ${String(parentId)} is not an offered branch, or title/blurb missing) — stays pending`,
      );
      result.pending += 1;
      continue;
    }
    const dupe = nodes.find((n) => normalizeTitle(n.title) === normalizeTitle(title));
    if (dupe) {
      const reason = `Already on the map as "${dupe.title}".`;
      const r = db
        .update(atlasSeeds)
        .set({ status: "dismissed", resolution: reason, resolvedAt })
        .where(stillPending)
        .run();
      if (r.changes === 0) {
        log(`seed #${seed.id}: already resolved by another run — skipped`);
        continue;
      }
      result.dismissed += 1;
      log(`seed #${seed.id}: dismissed — ${reason}`);
      continue;
    }

    // A link seed's reading is verified before anything is written, so the
    // node, its readings and the seed's resolution land in one transaction.
    const url = seed.kind === "url" ? (seed.url ?? extractSeedUrl(seed.text)) : null;
    const outcome = url
      ? await verifyReadings(
          [{ kind: "web", url, title: proposalTitle(seed) ?? title, why: "The link you added." }],
          fetchImpl,
          { gapMs: 0 },
        )
      : { verified: [], rejected: [] };

    const nodeId = db.transaction((tx) => {
      const t = tx as unknown as DB;
      // Claim the seed first: if it is no longer pending another run attached
      // (or dismissed) it while our model call ran, and inserting the node
      // would duplicate it. 0 changes = lost the race, insert nothing.
      const claim = t
        .update(atlasSeeds)
        .set({
          status: "attached",
          mapId,
          resolution: placement.reason,
          resolvedAt,
          url: seed.url ?? url,
        })
        .where(stillPending)
        .run();
      if (claim.changes === 0) return null;
      const top = t
        .select({ p: max(atlasNodes.position) })
        .from(atlasNodes)
        .where(and(eq(atlasNodes.mapId, mapId), eq(atlasNodes.parentId, parentId)))
        .get();
      const node = t
        .insert(atlasNodes)
        .values({
          mapId,
          parentId,
          position: (top?.p ?? -1) + 1,
          title,
          blurb,
          kind: (placement.kind ?? "concept") satisfies AtlasNodeKind,
          discipline: null,
          seedId: seed.id,
        })
        .returning()
        .get();
      storeReadings(t, node.id, "seed", outcome.verified, outcome.rejected, 0);
      t.update(atlasSeeds).set({ nodeId: node.id }).where(eq(atlasSeeds.id, seed.id)).run();
      return node.id;
    });
    if (nodeId == null) {
      log(`seed #${seed.id}: already resolved by another run — skipped`);
      continue;
    }
    result.attached.push({ seedId: seed.id, nodeId });
    log(
      `seed #${seed.id}: attached as node #${nodeId} "${title}"${url ? ` (${outcome.verified.length} verified, ${outcome.rejected.length} rejected link reading)` : ""}`,
    );
  }
  return result;
};
