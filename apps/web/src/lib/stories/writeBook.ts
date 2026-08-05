/**
 * Stages B + C of the story engine: write one book from a greenlit/auto-picked
 * premise, then have a smaller independent model judge it against a rubric,
 * allow at most one revision, and import (or reject with the verdict stored).
 *
 * All model I/O goes through an injectable `call` so the whole pipeline is
 * unit-testable with a fake CLI.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../../db/client";
import { children, premises } from "../../db/schema";
import { formatAge } from "../age";
import { resolveStoryAgeMonths } from "../settings";
import {
  ageBand,
  clampPageCount,
  storyForms,
  validatePages,
  type AgeBand,
} from "../skills/storyText";
import { pickArtPack } from "../skills/storyArt";
import { CandidateSchema, importCandidate, type Candidate } from "./importCandidate";
import { laneContract, storyLanes } from "./lanes";
import { imageryOverlapNote } from "./overlap";
import { recentBookRows } from "./premises";
import { ENGINE_VERSION } from "./engine";
import { getSeed, seedBlock, vocabBlock, vocabBlockFor } from "./seeds";
import { defaultWorld, getWorld, worldBlock } from "./worlds";
import {
  callClaude,
  callClaudeForJson,
  storyModels,
  type CallClaude,
} from "./claudeCli";

type PremiseRow = typeof premises.$inferSelect;

export const JudgeVerdictSchema = z.object({
  verdict: z.enum(["approve", "revise", "reject"]),
  coherence: z.string(),
  freshness: z.string(),
  readAloud: z.string(),
  ageFit: z.string(),
  lessonSubtlety: z.string().optional(),
  fixes: z.array(z.string()).default([]),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export type WriteBookResult =
  | { ok: true; storyId: number; title: string }
  | { ok: false; reason: string };

export type BookPipelineDeps = {
  call?: CallClaude;
  log?: (msg: string) => void;
};

/** Extra material resolved from the premise's seedRef/worldRef (see resolveMaterial). */
export type BookMaterial = {
  /** Seed bones + adaptation notes, already formatted as a prompt block. */
  seedBlock?: string;
  /** World-bible block for fantasy-world books. */
  worldBlock?: string;
  /** Vocabulary stretch-word block (romanization only). */
  vocabBlock?: string;
};

// Name + a snippet of the appearance block so the writer avoids repeating the
// species too, not just the name. Includes tonight's fresh imports.
const recentCharacters = (db: DB): string[] =>
  db
    .all<{ name: string; desc: string | null }>(
      sql`SELECT character_name as name, character_desc as desc FROM stories
          WHERE character_name IS NOT NULL AND status != 'rejected'
          ORDER BY id DESC LIMIT 6`,
    )
    .map((r) => (r.desc ? `${r.name} (${r.desc.split(/\s+/).slice(0, 6).join(" ")}…)` : r.name));

export const buildBookPrompt = (opts: {
  childName: string;
  ageText: string;
  band: AgeBand;
  pageCount: number;
  premise: Pick<PremiseRow, "title" | "lane" | "pitch" | "lesson" | "lessonNote" | "form">;
  material: BookMaterial;
  avoidCharacters: string[];
}): string => {
  const { premise, band } = opts;
  const form = premise.form ? storyForms[premise.form] : null;
  const sections: string[] = [];

  sections.push(`You write picture books in the tradition of the great read-aloud classics. Write a ${opts.pageCount}-page book for ${opts.childName}, ${opts.ageText} old, from this commissioned premise:

TITLE (working): ${premise.title}
PREMISE: ${premise.pitch}`);

  sections.push(laneContract(premise.lane));

  if (premise.lesson && premise.lesson !== "none") {
    sections.push(`THE LESSON (${premise.lesson}): ${premise.lessonNote ?? "as the premise implies"}.
It lives in what characters DO and what the pictures show — never name it, never state a moral, no summing-up line at the end.`);
  } else {
    sections.push(`NO LESSON. This book is commissioned as pure story — if a moral sneaks in, cut it.`);
  }

  if (opts.material.seedBlock) sections.push(opts.material.seedBlock);
  if (opts.material.worldBlock) sections.push(opts.material.worldBlock);
  if (opts.material.vocabBlock) sections.push(opts.material.vocabBlock);

  sections.push(`THE PROTAGONIST: the premise decides who leads (child, animal, moon rabbit, sailor…). Invent them fully.${
    opts.avoidCharacters.length > 0
      ? ` Recent books already starred these characters — pick a clearly different lead and a different name: ${opts.avoidCharacters.join("; ")}.`
      : ""
  }
- "characterName": the character's short friendly name.
- "characterDesc": a canonical appearance block of AT MOST 40 words (species/kind, colors, size, one distinctive clothing item or accessory). It will be pasted verbatim into every illustration prompt, so it must fully describe the character on its own.`);

  if (form) {
    sections.push(`THE FORM — this book uses the ${form.name} form:
${form.spec}

${form.exemplar}
(Shape and craft only — never reuse the example's characters, refrain, objects, or wording.)`);
  }

  sections.push(`READING LEVEL:
${band.language}
Hard limit: at most ${band.maxWordsPerPage} words of story text per page.`);

  sections.push(`CRAFT:
- Work in one pass as outline → draft → self-edit: before returning, reread for SENSE (does every beat follow?) and for read-aloud rhythm (would a tired parent enjoy saying these words?). Fix what stumbles.
- Each page needs a "scene": a self-contained visual description of THAT page's moment (setting, what the character is doing, time of day, mood, lighting). Do NOT describe the character's appearance (characterDesc covers it) and do NOT name an art style. Never include text or words in the scene. Compose simply: the character alone or with ONE companion, full-body or distant views, no crowds, no mirrors, nothing hand-intricate.
- Never render Chinese or other non-Latin script — if a foreign word appears, romanization only.`);

  sections.push(`Return ONLY a JSON object, no prose before or after, exactly this shape:
{ "title": string, "characterName": string, "characterDesc": string, "pages": [ { "text": string, "scene": string } ] }
Exactly ${opts.pageCount} pages.`);

  return sections.join("\n\n");
};

const buildJudgePrompt = (opts: {
  candidate: Candidate;
  premise: Pick<PremiseRow, "lane" | "lesson" | "lessonNote" | "pitch">;
  band: AgeBand;
  recentSummaries: string[];
  overlapNote: string;
}): string => {
  const lane = storyLanes[opts.premise.lane]?.name ?? opts.premise.lane;
  return `You are the in-house editor of a tiny home press that publishes picture books for one child. Judge this draft strictly — the writer gets at most ONE revision pass, so be specific.

THE DRAFT (JSON):
${JSON.stringify(opts.candidate)}

CONTEXT:
- Lane: ${lane}. ${laneContract(opts.premise.lane)}
- Commissioned premise: ${opts.premise.pitch}
- Lesson dial: ${opts.premise.lesson === "none" || !opts.premise.lesson ? "commissioned with NO lesson — flag any moralizing." : `carries a ${opts.premise.lesson} lesson (${opts.premise.lessonNote ?? ""}) — it must be SHOWN through action, never preached or named.`}
- Reading level: ${opts.band.language} (max ${opts.band.maxWordsPerPage} words/page)
${opts.recentSummaries.length > 0 ? `- Recent books in the library: ${opts.recentSummaries.join("; ")}` : ""}
${opts.overlapNote ? `- ${opts.overlapNote}` : ""}

RUBRIC — judge each:
1. coherence: does anything not make sense? (objects from nowhere, broken cause and effect, geography that jumps, a premise the pages abandon)
2. freshness: does it feel distinct from the recent books above, or is it the same story in new fur?
3. readAloud: mouth-feel and rhythm read aloud — do any sentences stumble?
4. ageFit: right for this reading level — not babyish, not over their head?
5. lessonSubtlety: per the lesson dial above.

Return ONLY JSON:
{ "verdict": "approve" | "revise" | "reject", "coherence": string, "freshness": string, "readAloud": string, "ageFit": string, "lessonSubtlety": string, "fixes": [string] }
- "approve": publishable as-is (small nits are fine).
- "revise": specific fixes would rescue it — list them concretely in "fixes".
- "reject": the execution is unsalvageable; a revision would be a rewrite.`;
};

/** Zod-parse + mechanical craft checks. Returns candidate or readable problems. */
const parseAndValidate = (
  raw: unknown,
  formKey: string | null,
  band: AgeBand,
  pageCount: number,
): { candidate: Candidate | null; problems: string[] } => {
  const parsed = CandidateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      candidate: null,
      problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const problems = validatePages(parsed.data, formKey, band);
  if (parsed.data.pages.length !== pageCount) {
    problems.push(
      `the book has ${parsed.data.pages.length} pages — it was commissioned at exactly ${pageCount}`,
    );
  }
  return { candidate: parsed.data, problems };
};

/** Page-count drift alone doesn't kill a book that stayed inside its age band. */
const blockingProblems = (problems: string[], pages: number, band: AgeBand): string[] =>
  pages >= band.minPages && pages <= band.maxPages
    ? problems.filter((p) => !p.includes("commissioned at exactly"))
    : problems;

/**
 * The full B→C pipeline for one premise. The caller is responsible for having
 * set the premise's status to greenlit/auto_picked; this function transitions
 * it to written (with storyId) or rejected (with the judge verdict stored).
 */
export const writeBookForPremise = (
  db: DB,
  premiseRow: PremiseRow,
  deps: BookPipelineDeps = {},
): WriteBookResult => {
  const call = deps.call ?? callClaude;
  const log = deps.log ?? console.log;
  const models = storyModels();

  const child = db.select().from(children).where(eq(children.id, premiseRow.childId)).get();
  if (!child) return { ok: false, reason: "no child profile" };

  const targetMonths = resolveStoryAgeMonths(db);
  const band = ageBand(targetMonths);
  const pageCount = clampPageCount(band, premiseRow.lengthPages);
  const formKey = premiseRow.form ?? null;
  const artPackKey = pickArtPack(db);
  const material = resolveMaterial(premiseRow);

  const reject = (verdict: unknown, reason: string): WriteBookResult => {
    db.update(premises)
      .set({ status: "rejected", judgeVerdict: JSON.stringify(verdict), decidedAt: new Date() })
      .where(eq(premises.id, premiseRow.id))
      .run();
    return { ok: false, reason };
  };

  const prompt = buildBookPrompt({
    childName: child.name,
    ageText: formatAge(targetMonths),
    band,
    pageCount,
    premise: premiseRow,
    material,
    avoidCharacters: recentCharacters(db),
  });

  log(
    `stage B: writing "${premiseRow.title}" [${premiseRow.lane}] ${pageCount}p model=${models.writer}`,
  );
  let raw = callClaudeForJson(prompt, { model: models.writer }, call);
  let { candidate, problems } = parseAndValidate(raw, formKey, band, pageCount);

  if (!candidate || problems.length > 0) {
    log(`draft flagged, one repair pass: ${problems.join("; ")}`);
    const repairPrompt = `${prompt}

You already wrote a draft, but an editor flagged problems. Fix ONLY these, keeping everything that works:
${problems.map((p) => `- ${p}`).join("\n")}

YOUR PREVIOUS DRAFT:
${JSON.stringify(raw)}

Return the corrected JSON object only, same shape, exactly ${pageCount} pages.`;
    raw = callClaudeForJson(repairPrompt, { model: models.writer }, call);
    ({ candidate, problems } = parseAndValidate(raw, formKey, band, pageCount));
  }
  if (candidate) problems = blockingProblems(problems, candidate.pages.length, band);
  if (!candidate || problems.length > 0) {
    log(`mechanical reject after repair: ${problems.join("; ")}`);
    return reject({ stage: "mechanical", problems }, `craft checks failed: ${problems.join("; ")}`);
  }

  // Stage C — a different, cheaper model judges against the rubric.
  let verdict: JudgeVerdict;
  try {
    const verdictRaw = callClaudeForJson(
      buildJudgePrompt({
        candidate,
        premise: premiseRow,
        band,
        recentSummaries: recentBookRows(db).map(
          (b) => `"${b.title ?? "untitled"}" [${b.lane ?? "bedtime"}]`,
        ),
        overlapNote: imageryOverlapNote(db, candidate.pages),
      }),
      { model: models.judge },
      call,
    );
    verdict = JudgeVerdictSchema.parse(verdictRaw);
  } catch (err) {
    // The judge is a quality gate, not a point of failure — on judge
    // breakage, publish the mechanically-valid draft rather than lose it.
    log(`judge errored (${err instanceof Error ? err.message : err}) — importing unjudged`);
    verdict = {
      verdict: "approve",
      coherence: "judge unavailable",
      freshness: "",
      readAloud: "",
      ageFit: "",
      fixes: [],
    };
  }
  log(`stage C: verdict=${verdict.verdict} model=${models.judge}`);

  if (verdict.verdict === "reject") {
    return reject(verdict, `editor-judge rejected: ${verdict.coherence}`);
  }

  if (verdict.verdict === "revise" && verdict.fixes.length > 0) {
    const revisePrompt = `${prompt}

You already wrote the draft below. An independent editor asked for exactly these revisions — apply them, keeping everything else that works:
${verdict.fixes.map((f) => `- ${f}`).join("\n")}

YOUR PREVIOUS DRAFT:
${JSON.stringify(candidate)}

Return the revised JSON object only, same shape, exactly ${pageCount} pages.`;
    const revisedRaw = callClaudeForJson(revisePrompt, { model: models.writer }, call);
    const revised = parseAndValidate(revisedRaw, formKey, band, pageCount);
    const revisedBlocking = revised.candidate
      ? blockingProblems(revised.problems, revised.candidate.pages.length, band)
      : ["unparseable revision"];
    if (revised.candidate && revisedBlocking.length === 0) {
      candidate = revised.candidate;
    } else {
      log(`revision came back broken (${revisedBlocking.join("; ")}) — keeping first draft`);
    }
  }

  const result = importCandidate(db, candidate, {
    childId: child.id,
    ageMonths: targetMonths,
    formKey,
    artPackKey,
    theme: premiseRow.pitch,
    lane: premiseRow.lane,
    tags: premiseRow.tags ?? [],
    lesson: premiseRow.lesson,
    premiseId: premiseRow.id,
    engineVersion: ENGINE_VERSION,
  });
  if (!result.ok) {
    return reject(
      { stage: "import", problems: result.problems, judge: verdict },
      `import failed: ${result.problems.join("; ")}`,
    );
  }

  db.update(premises)
    .set({
      status: "written",
      storyId: result.storyId,
      judgeVerdict: JSON.stringify(verdict),
      decidedAt: premiseRow.decidedAt ?? new Date(),
    })
    .where(eq(premises.id, premiseRow.id))
    .run();
  log(`created draft #${result.storyId}: "${result.title}"`);
  return { ok: true, storyId: result.storyId, title: result.title };
};

/**
 * Resolve premise material references into prompt blocks: the seed entry, the
 * world bible (fantasy-world premises always land in the default world, even
 * if stage A forgot the worldRef), and at most one stretch-word block — a
 * seed's vocabulary wins over the world's when a book somehow has both.
 */
const resolveMaterial = (premise: PremiseRow): BookMaterial => {
  const seed = getSeed(premise.seedRef);
  const world =
    getWorld(premise.worldRef) ?? (premise.lane === "fantasy-world" ? defaultWorld : null);
  return {
    seedBlock: seed ? seedBlock(seed) : undefined,
    worldBlock: world ? worldBlock(world) : undefined,
    vocabBlock:
      (seed ? vocabBlock(seed) : "") || (world ? vocabBlockFor(world.vocab) : "") || undefined,
  };
};
