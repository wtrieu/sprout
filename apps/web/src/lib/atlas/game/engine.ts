/**
 * The nightly engine pass — the system noticing.
 *
 * Window = since the last `ready` run (default 7 days). For each player:
 * sweep the base rules, render the window's events as compact lines, and ask
 * the writer model (headless `claude -p` through lib/atlas/llm.ts, never
 * qwen3) for at most two one-off hidden achievements. The model proposes;
 * code disposes. A grant whose basis ids are not real events of THIS player
 * inside the window, or whose slug is taken, is dropped — never repaired
 * into something acceptable. Accepted grants store and roll loot exactly
 * like base ones. The run row is the job status (drafting → ready/failed).
 *
 * Run by hand through `runEngine(db, deps)`; scripts/atlas.ts wraps it.
 */
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../../../db/client";
import {
  atlasAchievements,
  atlasEngineRuns,
  atlasNodes,
  atlasPlayers,
  type AtlasPersona,
} from "../../../db/schema";
import { eventData, eventsForPlayer, type EventRow } from "../events";
import { atlasModels, cliLlm, type AtlasLlm } from "../llm";
import { PERSONA_LABELS } from "../persona";
import { BASE_SLUGS, checkBaseAchievements, grantAchievement, slugsOf } from "./achievements";
import { maybeCreateOffer } from "./classes";
import { loadNodes, type PlayerNode } from "./data";
import { seededRng } from "./loot";

export const DEFAULT_WINDOW_DAYS = 7;
export const MAX_GRANTS_PER_RUN = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Verbs that are the engine's own bookkeeping, not learner behavior. */
const BOOKKEEPING = new Set([
  "grant_achievement",
  "reveal_loot",
  "offer_class",
  "accept_class",
  "use_item",
  "reveal_node",
  "equip",
  "create_character",
  "choose_persona",
  // The weekly note writes itself into every player's log (PR2); receiving
  // it is not something the player did.
  "frontier_note",
]);

export const GrantsSchema = z.object({
  grants: z
    .array(
      z.object({
        slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case slug").max(48),
        title: z.string().min(2).max(60),
        flavor: z.string().min(2).max(240),
        why: z.string().min(2).max(300),
        basisEventIds: z.array(z.number().int()).min(1).max(20),
      }),
    )
    .max(MAX_GRANTS_PER_RUN),
});
export type ModelGrant = z.infer<typeof GrantsSchema>["grants"][number];

const pad = (n: number) => String(n).padStart(2, "0");
const localTime = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** One compact line per event: id, verb, node, branch, local time, key payload. */
export const eventLine = (e: EventRow, nodes: Map<number, PlayerNode>): string => {
  const node = e.nodeId === null ? undefined : nodes.get(e.nodeId);
  const branch = node ? nodes.get(node.parentId ?? node.id) : undefined;
  const d = eventData(e);
  const detail =
    typeof d.level === "string" ? ` ${d.level}` : typeof d.score === "number" ? ` score=${d.score}` : "";
  return `#${e.id} ${e.verb}${detail} "${node?.title ?? "-"}" [${branch?.title ?? "-"}] ${localTime(e.createdAt)}`;
};

export const buildPrompt = (input: {
  name: string;
  persona: AtlasPersona;
  lines: string[];
  existingSlugs: string[];
}): string => `You are the achievement judge for Atlas, a family learning game. ${input.name} has been exploring a map of ideas. Below is their recent activity, one event per line (id, verb, node title, [branch], local time).

Voice: ${PERSONA_LABELS[input.persona].pitch}
Rules: family-friendly, always. Humor points at the material and the persona's own quirks, never at the learner. Warm, specific, short.

Notice a real pattern in the activity (a streak, a habit, an odd detour, a comeback, a favorite corner of the map) and grant AT MOST ${MAX_GRANTS_PER_RUN} one-off hidden achievements. Grant fewer, or none, if nothing stands out. Every grant must cite the event ids that prove it.

Existing achievement slugs (do not reuse): ${input.existingSlugs.join(", ") || "(none)"}
Reserved slugs (never use, they belong to built-in rules): ${[...BASE_SLUGS].join(", ")}

Activity:
${input.lines.join("\n")}

Return JSON only: {"grants": [{"slug": "kebab-case-id", "title": "short title", "flavor": "one line in the persona's voice, addressed to ${input.name}", "why": "one sentence naming the pattern", "basisEventIds": [event ids from above]}]}`;

/** Code-side validation: the only gate between the model and the database. */
export const validateGrants = (
  grants: readonly ModelGrant[],
  windowEventIds: ReadonlySet<number>,
  takenSlugs: ReadonlySet<string>,
): ModelGrant[] => {
  const kept: ModelGrant[] = [];
  const used = new Set(takenSlugs);
  for (const g of grants) {
    if (used.has(g.slug) || BASE_SLUGS.has(g.slug)) continue;
    if (!g.basisEventIds.every((id) => windowEventIds.has(id))) continue;
    used.add(g.slug);
    kept.push(g);
    if (kept.length === MAX_GRANTS_PER_RUN) break;
  }
  return kept;
};

/**
 * First-run backfill: on every map with no rare node, mark one seeded child
 * per branch. (Drafted maps will mark their own rares later; this keeps
 * rare_node_key meaningful until then.) Returns how many nodes were marked.
 */
export const backfillRareNodes = (db: DB): number => {
  const nodes = loadNodes(db);
  const maps = new Set(nodes.map((n) => n.mapId));
  let marked = 0;
  for (const mapId of maps) {
    const inMap = nodes.filter((n) => n.mapId === mapId);
    if (inMap.some((n) => n.rare)) continue;
    for (const branch of inMap.filter((n) => n.parentId === null)) {
      const kids = inMap
        .filter((n) => n.parentId === branch.id)
        .sort((a, b) => a.position - b.position || a.id - b.id);
      if (kids.length === 0) continue;
      const pick = kids[Math.floor(seededRng(`rare:${mapId}:${branch.id}`)() * kids.length)]!;
      db.update(atlasNodes).set({ rare: true }).where(eq(atlasNodes.id, pick.id)).run();
      marked += 1;
    }
  }
  return marked;
};

/**
 * Data-driven double-grant guard: a player who already holds a model
 * achievement granted inside this window was reached by an earlier run that
 * never advanced the watermark (failed, killed, or ad hoc). The last ready
 * nightly run is exempt — its grants land just after its own window end,
 * which is exactly where this window starts.
 */
const alreadyReached = (
  db: DB,
  playerId: number,
  windowStart: Date,
  exemptRunId: number | null,
): boolean =>
  db
    .select({ data: atlasAchievements.data })
    .from(atlasAchievements)
    .where(
      and(
        eq(atlasAchievements.playerId, playerId),
        eq(atlasAchievements.source, "model"),
        gte(atlasAchievements.grantedAt, windowStart),
      ),
    )
    .all()
    .some((r) => {
      try {
        const runId = (JSON.parse(r.data ?? "{}") as { runId?: unknown }).runId;
        return exemptRunId === null || runId !== exemptRunId;
      } catch {
        return true;
      }
    });

/** A drafting run older than this was killed mid-pass. */
export const ENGINE_STALE_MS = 15 * 60 * 1000;

/** Flip engine runs stuck `drafting` past the deadline to `failed`. */
export const reapStaleEngineRuns = (db: DB, now = new Date()): number =>
  db
    .update(atlasEngineRuns)
    .set({ status: "failed", error: "No result came back in time — the run may have died." })
    .where(
      and(
        eq(atlasEngineRuns.status, "drafting"),
        lt(atlasEngineRuns.createdAt, new Date(now.getTime() - ENGINE_STALE_MS)),
      ),
    )
    .returning({ id: atlasEngineRuns.id })
    .all().length;

export type EngineDeps = {
  llm?: AtlasLlm;
  model?: string;
  now?: Date;
  windowDays?: number;
  /** Limit the pass to one player. */
  playerId?: number;
  log?: (msg: string) => void;
};

export type EngineResult = {
  runId: number;
  status: "ready" | "failed";
  grants: number;
  windowStart: Date;
  windowEnd: Date;
  error: string | null;
};

export const runEngine = (db: DB, deps: EngineDeps = {}): EngineResult => {
  const llm = deps.llm ?? cliLlm;
  const model = deps.model ?? atlasModels().writer;
  const log = deps.log ?? (() => {});
  // Event timestamps are whole seconds; keep the window on the same grid.
  const windowEnd = new Date(Math.floor((deps.now ?? new Date()).getTime() / 1000) * 1000);
  reapStaleEngineRuns(db, deps.now ?? new Date());
  // By-hand runs (--player, --window-days) are ad hoc: their own window, and
  // their row never moves the nightly watermark.
  const adhoc = deps.playerId !== undefined || deps.windowDays !== undefined;
  const lastReady = db
    .select()
    .from(atlasEngineRuns)
    .where(and(eq(atlasEngineRuns.kind, "nightly"), eq(atlasEngineRuns.status, "ready")))
    .orderBy(desc(atlasEngineRuns.id))
    .get();
  const windowStart =
    adhoc || !lastReady
      ? new Date(windowEnd.getTime() - (deps.windowDays ?? DEFAULT_WINDOW_DAYS) * DAY_MS)
      : lastReady.windowEnd;
  const run = db
    .insert(atlasEngineRuns)
    .values({ kind: adhoc ? "adhoc" : "nightly", status: "drafting", windowStart, windowEnd })
    .returning()
    .get();

  const errors: string[] = [];
  let grants = 0;
  try {
    if (!lastReady) log(`first run: marked ${backfillRareNodes(db)} rare node(s)`);
    const nodeMap = new Map(loadNodes(db).map((n) => [n.id, n]));
    const players = db
      .select()
      .from(atlasPlayers)
      .all()
      .filter((p) => deps.playerId === undefined || p.id === deps.playerId);

    for (const player of players) {
      try {
        // Sweep the base rules and any gate the log has since crossed.
        checkBaseAchievements(db, player.id);
        maybeCreateOffer(db, player.id);

        const inWindow = eventsForPlayer(db, player.id).filter(
          (e) =>
            e.createdAt.getTime() > windowStart.getTime() &&
            e.createdAt.getTime() <= windowEnd.getTime(),
        );
        const activity = inWindow.filter((e) => !BOOKKEEPING.has(e.verb));
        if (activity.length === 0) continue;
        // Don't double-grant to someone an earlier unfinished or ad hoc run reached.
        if (alreadyReached(db, player.id, windowStart, adhoc ? null : (lastReady?.id ?? null))) continue;

        const taken = slugsOf(db, player.id);
        const result = llm(
          buildPrompt({
            name: player.name,
            persona: player.persona,
            lines: activity.map((e) => eventLine(e, nodeMap)),
            existingSlugs: [...taken],
          }),
          GrantsSchema,
          { model, label: `atlas engine (${player.name})` },
        );
        const kept = validateGrants(
          result.grants,
          new Set(inWindow.map((e) => e.id)),
          taken,
        );
        for (const g of kept) {
          const stored = grantAchievement(db, player.id, {
            slug: g.slug,
            title: g.title,
            flavor: g.flavor,
            source: "model",
            hidden: true,
            data: { basisEventIds: g.basisEventIds, why: g.why, runId: run.id },
          });
          if (stored) grants += 1;
        }
        log(`player ${player.id}: ${kept.length} grant(s) of ${result.grants.length} proposed`);
      } catch (err) {
        errors.push(`player ${player.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const failed = errors.length > 0;
  const error = failed ? errors.join("; ").slice(0, 1000) : null;
  db.update(atlasEngineRuns)
    .set({ status: failed ? "failed" : "ready", error, grantsCount: grants })
    .where(eq(atlasEngineRuns.id, run.id))
    .run();
  return {
    runId: run.id,
    status: failed ? "failed" : "ready",
    grants,
    windowStart,
    windowEnd,
    error,
  };
};
