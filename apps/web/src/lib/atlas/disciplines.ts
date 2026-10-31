/**
 * Disciplines — the account-wide spine's tagging.
 *
 * Every node is tagged to one of five cross-field skills. New maps are
 * tagged at draft time (draftMap.ts asks for the tag in the outline and
 * children calls); maps drafted before PR-C are backfilled here, one cheap
 * classification call per branch — select, don't generate: the model only
 * picks a label per existing title, and an assignment whose title matches
 * no node is ignored, never invented into one.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "../../db/client";
import { atlasDisciplines, atlasNodes, type AtlasDiscipline } from "../../db/schema";
import { atlasModels, cliLlm, type AtlasLlm } from "./llm";
import { normalizeTitle } from "./verify";

export const DISCIPLINE_DEFS: Record<AtlasDiscipline, string> = {
  reasoning: "logic, argument, inference, proof — how one claim follows from another",
  evidence: "observation, sources, experiment, testimony — how we come to know what is so",
  language: "meaning, interpretation, rhetoric, translation — how words carry thought",
  systems: "structures, institutions, causes at scale — how parts make wholes",
  creativity: "making, imagining, aesthetics, design — how new things come to be",
};

export const DISCIPLINE_LABELS: Record<AtlasDiscipline, string> = {
  reasoning: "Reasoning",
  evidence: "Evidence",
  language: "Language",
  systems: "Systems",
  creativity: "Creativity",
};

/** The rules block shared by the draft prompts and the backfill prompt. */
export const disciplineRules = (): string =>
  `DISCIPLINE: tag each entry with the ONE cross-field skill it most trains in the reader:\n${atlasDisciplines
    .map((d) => `- "${d}": ${DISCIPLINE_DEFS[d]}`)
    .join("\n")}`;

export const DisciplineAssignmentsSchema = z.object({
  assignments: z.array(
    z.object({
      title: z.string().trim().min(1).max(200),
      discipline: z.enum(atlasDisciplines),
    }),
  ),
});
export type DisciplineAssignments = z.infer<typeof DisciplineAssignmentsSchema>;

export const buildDisciplinePrompt = (input: {
  mapTitle: string;
  branch: { title: string; blurb: string };
  nodes: Array<{ title: string; blurb: string }>;
}): string => `You are tagging entries of a personal atlas of ideas. For each entry below, pick the one discipline it most trains.

MAP: ${input.mapTitle}
BRANCH: ${input.branch.title} — ${input.branch.blurb}

ENTRIES (tag every one, by its exact title):
${input.nodes.map((n) => `- ${n.title} — ${n.blurb}`).join("\n")}

${disciplineRules()}

Return JSON only: { "assignments": [ { "title": string (exactly as listed), "discipline": "reasoning" | "evidence" | "language" | "systems" | "creativity" } ] }`;

export type AssignDeps = {
  llm?: AtlasLlm;
  log?: (msg: string) => void;
  /** Re-tag nodes that already have a discipline. */
  force?: boolean;
};

export type AssignResult = { tagged: number; skipped: number; unknownTitles: string[] };

/**
 * Backfill one map's discipline tags, one call per branch (the branch node
 * is tagged in its own batch). Assignments for titles that match no node in
 * the batch are reported, not applied.
 */
export const assignDisciplines = (db: DB, mapId: number, deps: AssignDeps = {}): AssignResult => {
  const llm = deps.llm ?? cliLlm;
  const log = deps.log ?? console.log;
  const model = atlasModels().onepager;
  const nodes = db.select().from(atlasNodes).where(eq(atlasNodes.mapId, mapId)).all();
  const branches = nodes.filter((n) => n.parentId === null);
  const result: AssignResult = { tagged: 0, skipped: 0, unknownTitles: [] };

  const mapTitle = `map #${mapId}`;
  for (const branch of branches) {
    const batch = [branch, ...nodes.filter((n) => n.parentId === branch.id)].filter(
      (n) => deps.force || n.discipline === null,
    );
    if (batch.length === 0) {
      result.skipped += 1;
      continue;
    }
    const byTitle = new Map(batch.map((n) => [normalizeTitle(n.title), n]));
    const res = llm(
      buildDisciplinePrompt({
        mapTitle,
        branch: { title: branch.title, blurb: branch.blurb },
        nodes: batch.map((n) => ({ title: n.title, blurb: n.blurb })),
      }),
      DisciplineAssignmentsSchema,
      { model, label: `disciplines of "${branch.title}"` },
    );
    for (const a of res.assignments) {
      const node = byTitle.get(normalizeTitle(a.title));
      if (!node) {
        result.unknownTitles.push(a.title);
        continue;
      }
      db.update(atlasNodes)
        .set({ discipline: a.discipline })
        .where(eq(atlasNodes.id, node.id))
        .run();
      result.tagged += 1;
    }
    log(`disciplines: "${branch.title}" tagged ${res.assignments.length} entries`);
  }
  const untagged = db
    .select({ id: atlasNodes.id })
    .from(atlasNodes)
    .where(and(eq(atlasNodes.mapId, mapId), isNull(atlasNodes.discipline)))
    .all().length;
  log(
    `disciplines: map #${mapId} — ${result.tagged} tagged, ${untagged} still untagged` +
      (result.unknownTitles.length ? `, unknown titles: ${result.unknownTitles.join("; ")}` : ""),
  );
  return result;
};
