/**
 * Map drafting: a field becomes a two-level tree.
 *
 *   M1  one call → the outline (title, blurb, 8–14 branches in reading order)
 *   M2  one call per branch → 2–6 children, told what the other branches
 *       already cover so nothing lands in two places
 *   code → dedupe by normalized title, trim to MAX_NODES, assign positions,
 *       insert in one transaction, flip the map row to ready/failed
 *
 * One call for the whole tree would be faster; the per-branch pass is where
 * "beats the bookstore book" quality comes from.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { atlasMaps, atlasNodes, type AtlasNodeKind } from "../../db/schema";
import { atlasModels, cliLlm, type AtlasLlm } from "./llm";
import { normalizeTitle } from "./verify";

export const MAX_NODES = 50;
export const MIN_BRANCHES = 6;
export const MAX_BRANCHES = 16;
export const MIN_CHILDREN = 1;
export const MAX_CHILDREN = 6;

const Title = z.string().trim().min(2).max(90);
const Blurb = z.string().trim().min(8).max(260);

export const MapOutlineSchema = z.object({
  title: Title,
  blurb: Blurb,
  branches: z.array(z.object({ title: Title, blurb: Blurb })).min(MIN_BRANCHES).max(MAX_BRANCHES),
});
export type MapOutline = z.infer<typeof MapOutlineSchema>;

export const childKinds = ["school", "thinker", "concept", "text"] as const;

export const BranchChildrenSchema = z.object({
  children: z
    .array(z.object({ title: Title, blurb: Blurb, kind: z.enum(childKinds) }))
    .min(MIN_CHILDREN)
    .max(MAX_CHILDREN),
});
export type BranchChildren = z.infer<typeof BranchChildrenSchema>;

export type DraftChild = { title: string; blurb: string; kind: AtlasNodeKind; position: number };
export type DraftBranch = {
  title: string;
  blurb: string;
  position: number;
  children: DraftChild[];
};
export type MapDraft = { title: string; blurb: string; branches: DraftBranch[] };

export const buildOutlinePrompt = (input: { title: string; brief: string | null }): string => `You are drafting the outline of one map in a personal atlas of ideas kept by a single curious adult. A map is a field; its branches are the regions a reader should meet, in the order they should meet them.

MAP: ${input.title}
BRIEF:
${input.brief?.trim() || "(none — use your best judgment of how a great history of this field is organized)"}

Return JSON only:
{ "title": string, "blurb": string, "branches": [ { "title": string, "blurb": string } ] }

Rules:
- 8 to 14 branches, in reading order (history first when the field has one).
- "blurb" on the map is one line (under 200 characters) saying what the map covers.
- A branch blurb is the live question that region of the field is still arguing about, in one sentence — not a definition.
- Titles are short and specific ("The Hellenistic schools", not "Later Greek thought (various)").
- No two branches overlap: each thinker, school, or idea belongs in exactly one branch.
- Plain text in every string: no markdown, no quotation marks around titles.`;

export const buildChildrenPrompt = (input: {
  mapTitle: string;
  mapBlurb: string;
  branch: { title: string; blurb: string };
  otherBranches: string[];
}): string => `You are filling in one branch of a map in a personal atlas of ideas kept by a single curious adult.

MAP: ${input.mapTitle} — ${input.mapBlurb}
THIS BRANCH: ${input.branch.title} — ${input.branch.blurb}
THE OTHER BRANCHES (already covered elsewhere — do NOT place their schools, thinkers, or texts here):
${input.otherBranches.map((b) => `- ${b}`).join("\n")}

Return JSON only:
{ "children": [ { "title": string, "blurb": string, "kind": "school" | "thinker" | "concept" | "text" } ] }

Rules:
- 2 to 6 children, ordered by importance: the first is the one a newcomer must meet.
- Each child is a school, a thinker, a concept, or a text — pick the kind that best names it.
- A blurb is the live question the child answers, in one sentence ("Can a life be good if it ends badly?"), never a definition.
- Titles are the names a good index would use.
- Plain text in every string: no markdown, no quotation marks around titles.`;

/**
 * Dedupe titles across the whole map (first occurrence wins), trim to
 * MAX_NODES by dropping the lowest-ranked children of the largest branches,
 * and assign positions.
 */
export const normalizeMapDraft = (
  outline: MapOutline,
  childrenByBranch: Array<BranchChildren["children"]>,
): MapDraft => {
  // Branch titles are reserved first so a child can never pre-empt a branch
  // that appears later in the outline.
  const seen = new Set<string>();
  const kept: Array<{ branch: MapOutline["branches"][number]; index: number }> = [];
  outline.branches.forEach((branch, index) => {
    const key = normalizeTitle(branch.title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    kept.push({ branch, index });
  });
  const branches: DraftBranch[] = kept.map(({ branch, index }) => {
    const children: DraftChild[] = [];
    for (const c of childrenByBranch[index] ?? []) {
      const ck = normalizeTitle(c.title);
      if (!ck || seen.has(ck)) continue;
      seen.add(ck);
      children.push({ title: c.title.trim(), blurb: c.blurb.trim(), kind: c.kind, position: 0 });
    }
    return { title: branch.title.trim(), blurb: branch.blurb.trim(), position: 0, children };
  });

  const total = () => branches.reduce((n, b) => n + 1 + b.children.length, 0);
  while (total() > MAX_NODES) {
    const largest = branches.reduce((a, b) => (b.children.length > a.children.length ? b : a));
    if (largest.children.length === 0) break;
    largest.children.pop();
  }

  branches.forEach((b, i) => {
    b.position = i;
    b.children.forEach((c, j) => {
      c.position = j;
    });
  });
  return { title: outline.title.trim(), blurb: outline.blurb.trim(), branches };
};

export type DraftMapDeps = {
  llm?: AtlasLlm;
  log?: (msg: string) => void;
};

export type DraftMapResult =
  | { ok: true; mapId: number; nodeCount: number }
  | { ok: false; mapId: number; error: string };

/** Replace a map's nodes with a fresh draft (safe to re-run on a failed map). */
export const storeMapDraft = (db: DB, mapId: number, draft: MapDraft): number => {
  let count = 0;
  db.transaction((tx) => {
    tx.delete(atlasNodes).where(eq(atlasNodes.mapId, mapId)).run();
    for (const b of draft.branches) {
      const branch = tx
        .insert(atlasNodes)
        .values({
          mapId,
          parentId: null,
          position: b.position,
          title: b.title,
          blurb: b.blurb,
          kind: "branch",
        })
        .returning({ id: atlasNodes.id })
        .get();
      count += 1;
      for (const c of b.children) {
        tx.insert(atlasNodes)
          .values({
            mapId,
            parentId: branch.id,
            position: c.position,
            title: c.title,
            blurb: c.blurb,
            kind: c.kind,
          })
          .run();
        count += 1;
      }
    }
  });
  return count;
};

export const draftMap = (db: DB, mapId: number, deps: DraftMapDeps = {}): DraftMapResult => {
  const llm = deps.llm ?? cliLlm;
  const log = deps.log ?? console.log;
  const models = atlasModels();
  const map = db.select().from(atlasMaps).where(eq(atlasMaps.id, mapId)).get();
  if (!map) return { ok: false, mapId, error: `map #${mapId} not found` };

  db.update(atlasMaps)
    .set({ status: "drafting", error: null, model: models.writer })
    .where(eq(atlasMaps.id, mapId))
    .run();

  try {
    log(`M1: outlining "${map.title}" model=${models.writer}`);
    const outline = llm(
      buildOutlinePrompt({ title: map.title, brief: map.brief }),
      MapOutlineSchema,
      { model: models.writer, label: "map outline" },
    );
    log(`outline: ${outline.branches.length} branches`);

    const childrenByBranch: Array<BranchChildren["children"]> = [];
    outline.branches.forEach((branch, i) => {
      const otherBranches = outline.branches.filter((_, j) => j !== i).map((b) => b.title);
      try {
        const res = llm(
          buildChildrenPrompt({
            mapTitle: outline.title,
            mapBlurb: outline.blurb,
            branch,
            otherBranches,
          }),
          BranchChildrenSchema,
          { model: models.writer, label: `children of "${branch.title}"` },
        );
        childrenByBranch[i] = res.children;
        log(`M2 ${i + 1}/${outline.branches.length}: "${branch.title}" → ${res.children.length}`);
      } catch (err) {
        // One bad branch must not sink the map: it lands with no children and
        // can be re-drafted later.
        log(`M2 ${i + 1}: "${branch.title}" failed (${err instanceof Error ? err.message : err})`);
        childrenByBranch[i] = [];
      }
    });

    const draft = normalizeMapDraft(outline, childrenByBranch);
    const nodeCount = storeMapDraft(db, mapId, draft);
    db.update(atlasMaps)
      .set({ blurb: draft.blurb, status: "ready", readyAt: new Date(), error: null })
      .where(eq(atlasMaps.id, mapId))
      .run();
    log(`map #${mapId} ready: ${nodeCount} nodes`);
    return { ok: true, mapId, nodeCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(atlasMaps)
      .set({ status: "failed", error: message.slice(0, 2000) })
      .where(eq(atlasMaps.id, mapId))
      .run();
    log(`map #${mapId} failed: ${message}`);
    return { ok: false, mapId, error: message };
  }
};
