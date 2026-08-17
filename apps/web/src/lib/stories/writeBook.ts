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
import {
  composePagePrompt,
  isCharacterShot,
  pickArtPack,
  promptWordCount,
  PROMPT_WORD_CEILING,
  shotKeys,
  shots,
} from "../skills/storyArt";
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
  pictures: z.string().optional(),
  factAccuracy: z.string().optional(),
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
- "characterDesc": a canonical appearance block of AT MOST 18 words (species/kind, one silhouette-defining shape, 3 colors at most, one distinctive accessory). It is pasted verbatim into every illustration prompt, where shorter = stronger. Aim for a character a child could recognise as a solid black silhouette, and keep the palette to three colors so the illustrator can hold them steady across pages.`);

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
- Never render Chinese or other non-Latin script — if a foreign word appears, romanization only.`);

  const nonfiction = storyLanes[premise.lane]?.kind === "nonfiction";
  sections.push(`THE PICTURES — every page here is an illustration brief that ships straight to an image model. That model holds about THREE subjects and stops resolving what it reads past ~70 words total, and your fields share that budget with the style and character blocks. So: concrete pictureable nouns, telegram style, no narrative connective tissue, and no more than you can actually get drawn.
- LITERAL NOUNS ONLY: the image model paints every noun it reads. Never a simile or metaphor ("soft like pillows" paints actual pillows) and never a negation ("no leaves on the tree" paints leaves) — name only what is physically in the picture.
- "shot" (per page): the camera, exactly one of "wide" | "closeup" | "behind" | "pov" | "detail".
  CHARACTER shots put the character in frame: "wide" (a small figure in a big scene), "closeup" (near and expressive — spend these on the emotional beats), "behind" (seen from behind, facing into the scene — good for journeys and thresholds).
  WORLD shots leave the character OUT of frame: "pov" (exactly what the character is looking at) and "detail" (one small thing seen very close). World shots are the book's worldbuilding room.
  Rules: page 1 and the final page are CHARACTER shots. At least half the pages are character shots — a young reader anchors on seeing their character. Use at least one world shot, and never the same shot three pages running: cutting away and coming back is what makes turning the page feel like something changed.
- "scene" (per page): THAT page's foreground moment — setting, action, light. AT MOST 18 words on character shots; on world shots you may run to 30 and spend the room on the world. On character shots do NOT describe the character's appearance (characterDesc covers it); on world shots do not mention the character at all — they are not in the frame. Do NOT name an art style. Never any text, words, or signage in the image.
- "background" (per page, AT MOST 10 words): exactly ONE thing, written as a scale-anchored noun phrase — it MUST open with its own size and distance ("a tiny distant lighthouse", "a small far-off boat", "one thumbnail-sized bird high above"). Do not write "in the background" — the model cannot honour a positional instruction, only the scale words you bake into the phrase itself. One thing, not a scene: a second element here is what makes the picture come back wrong.
  Give the background its own quiet thread: let that one small thing recur across the pages and quietly resolve by the last page, so a rereading child discovers a second story living in the pictures.${
    nonfiction
      ? `\n  In this nonfiction book the background is also where extra TRUTH lives — real anatomy, real tools, the subject's true surroundings. Every background detail must stay true.`
      : ""
  }
- "hiddenFriend" (book-level, AT MOST 12 words): one small companion creature or object that belongs to this book. It never appears in the text, and it is NOT sent to the image model (asking it to hide something small only makes it large) — it is a note for the reader, so write it as something a parent could point at and name.
- Composition: give each page one clear focal point with room to breathe. End pages that turn on a surprise with the question, not the answer.
- Composition safety: keep the background element small and simple (a distant shape or silhouette — never a crowd of detailed faces). Nothing hand-intricate on the main character, no mirrors.`);

  sections.push(`Return ONLY a JSON object, no prose before or after, exactly this shape:
{ "title": string, "characterName": string, "characterDesc": string, "hiddenFriend": string, "pages": [ { "text": string, "shot": string, "scene": string, "background": string } ] }
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
6. pictures: read scene/background as the illustration brief they are, for an image model that holds ~3 subjects and ~70 words. Is each "scene" one clear focal moment rather than a list? Is each "background" exactly ONE thing, opening with its own scale and distance ("a tiny distant …") rather than a second scene competing with the foreground? Does that one small thing recur across the pages and pay off by the last one, instead of just restating the foreground? Flag any background that packs in two or more elements — that is the single most common way these pictures come back wrong. Also flag: any simile, metaphor, or negation in scene/background (the image model paints every noun it reads — "soft like pillows" puts pillows in the picture); any world shot ("pov"/"detail") whose scene mentions the character (they are not in the frame); and a shot sequence that fails to vary or parks the emotional beats on world shots instead of character shots.${
    storyLanes[opts.premise.lane]?.kind === "nonfiction"
      ? `\n7. factAccuracy: this is a NONFICTION book — is every stated fact (in text AND in the picture layers) true? Simplification is fine; invention is not. A false or misleading fact alone justifies "revise", with the correction in "fixes".`
      : ""
  }

Return ONLY JSON:
{ "verdict": "approve" | "revise" | "reject", "coherence": string, "freshness": string, "readAloud": string, "ageFit": string, "lessonSubtlety": string, "pictures": string${
    storyLanes[opts.premise.lane]?.kind === "nonfiction" ? `, "factAccuracy": string` : ""
  }, "fixes": [string] }
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

// Per-field word budgets for the illustration layers (a couple of words'
// tolerance over the numbers the prompt states). These are chosen to SUM under
// PROMPT_WORD_CEILING once a <=20-word style DNA and a <=3-word camera clause
// are prepended:
//   character shots: 20 (DNA) + 20 (char) + 3 (camera) + 20 (scene) + 12 = 75.
//   world shots:     20 (DNA) + 2 (camera) + 33 (scene) + 12 = 67 — the
//   character block's words become worldbuilding room (scene may run to 30).
// Field-by-field checks are not enough on their own, so the composed total is
// checked too — that is the number that actually reaches Midjourney.
const ART_BUDGETS = {
  characterDesc: 20,
  scene: 20,
  sceneWorldShot: 33,
  background: 12,
  hiddenFriend: 15,
};

/**
 * Similes, comparisons, and negations all put the named object IN the picture
 * ("soft like pillows" paints pillows; "no hat" paints a hat) — a diffusion
 * model renders nouns, it does not process analogy or absence.
 */
const FIGURATIVE_RE = /\blike\b|\bas if\b|\bas though\b|\bwithout\b|\bno\s+\w/i;

const words = (s: string | undefined): number =>
  s ? s.split(/\s+/).filter(Boolean).length : 0;

/**
 * The illustration layers are asked for by the prompt but optional in the
 * schema — a thin (or bloated) draft gets one repair pass, and if it comes
 * back imperfect we import anyway (a book with imperfect art briefs is still
 * a book; these problems never block).
 */
const artLayerProblems = (candidate: Candidate | null, artPackKey?: string): string[] => {
  if (!candidate) return [];
  const problems: string[] = [];
  if (!candidate.hiddenFriend) {
    problems.push(
      `missing "hiddenFriend" — the book needs its small companion for the reader's notes`,
    );
  } else if (words(candidate.hiddenFriend) > ART_BUDGETS.hiddenFriend) {
    problems.push(`"hiddenFriend" is ${words(candidate.hiddenFriend)} words — trim to 12 or fewer`);
  }
  if (words(candidate.characterDesc) > ART_BUDGETS.characterDesc) {
    problems.push(
      `"characterDesc" is ${words(candidate.characterDesc)} words — trim to 18 or fewer (it rides every illustration prompt)`,
    );
  }
  const thin = candidate.pages.filter((p) => !p.background).length;
  if (thin > 0) {
    problems.push(
      `${thin} page(s) missing "background" — every page's picture needs its background layer (world life behind the moment)`,
    );
  }
  // Shot grammar. Missing/invalid shots are flagged for repair; the grammar
  // itself is only judged once every page has a valid one (the repair fixes
  // the vocabulary first, then the sequence).
  const invalidShots = candidate.pages.filter((p) => !p.shot || !(p.shot in shots)).length;
  if (invalidShots > 0) {
    problems.push(
      `${invalidShots} page(s) missing "shot" (or using an unknown value) — every page names its camera, exactly one of ${shotKeys.map((k) => `"${k}"`).join(" | ")}`,
    );
  } else {
    const pageShots = candidate.pages.map((p) => p.shot!);
    const charPages = pageShots.filter((s) => isCharacterShot(s)).length;
    if (!isCharacterShot(pageShots[0])) {
      problems.push(
        `page 1 must be a CHARACTER shot (wide/closeup/behind) — it introduces the character and seeds the book's look`,
      );
    }
    if (!isCharacterShot(pageShots[pageShots.length - 1])) {
      problems.push(`the final page must be a CHARACTER shot — the goodbye belongs to the character`);
    }
    if (charPages < Math.ceil(pageShots.length / 2)) {
      problems.push(
        `only ${charPages} of ${pageShots.length} pages show the character — at least half must be character shots (a young reader anchors on seeing them)`,
      );
    }
    if (charPages === pageShots.length && pageShots.length >= 6) {
      problems.push(
        `every page is a character shot — use at least one world shot ("pov" or "detail") so the book gets its cutaways`,
      );
    }
    if (pageShots.some((s, i) => i >= 2 && s === pageShots[i - 1] && s === pageShots[i - 2])) {
      problems.push(
        `the same shot runs three or more pages in a row — vary the camera so each page turn feels like a change`,
      );
    }
  }
  const longScenes = candidate.pages.filter(
    (p) => isCharacterShot(p.shot) && words(p.scene) > ART_BUDGETS.scene,
  ).length;
  if (longScenes > 0) {
    problems.push(
      `${longScenes} page(s) have a "scene" over 18 words — cut each to its concrete pictureable core`,
    );
  }
  const longWorldScenes = candidate.pages.filter(
    (p) => !isCharacterShot(p.shot) && words(p.scene) > ART_BUDGETS.sceneWorldShot,
  ).length;
  if (longWorldScenes > 0) {
    problems.push(
      `${longWorldScenes} world-shot page(s) have a "scene" over 30 words — even worldbuilding pages must stay drawable`,
    );
  }
  const figurative = candidate.pages
    .map((p, i) => ({ i, hit: FIGURATIVE_RE.test(p.scene) || (p.background ? FIGURATIVE_RE.test(p.background) : false) }))
    .filter(({ hit }) => hit);
  if (FIGURATIVE_RE.test(candidate.characterDesc)) {
    figurative.unshift({ i: -1, hit: true });
  }
  if (figurative.length > 0) {
    const where = figurative.map(({ i }) => (i === -1 ? "characterDesc" : `page ${i + 1}`)).join(", ");
    problems.push(
      `simile, comparison, or negation in the illustration fields (${where}) — the image model paints every noun it reads ("soft like pillows" paints pillows; "no hat" paints a hat), so name only what is physically in the picture`,
    );
  }
  const longBackgrounds = candidate.pages.filter(
    (p) => words(p.background) > ART_BUDGETS.background,
  ).length;
  if (longBackgrounds > 0) {
    problems.push(
      `${longBackgrounds} page(s) have a "background" over 10 words — ONE scale-anchored noun phrase ("a tiny distant lighthouse"), nothing more`,
    );
  }
  const unscaled = candidate.pages
    .map((p, i) => ({ i, bg: p.background }))
    .filter(({ bg }) => bg && !SCALE_WORD_RE.test(bg));
  if (unscaled.length > 0) {
    problems.push(
      `${unscaled.length} page(s) have a "background" with no scale/distance word (page ${unscaled
        .map(({ i }) => i + 1)
        .join(", ")}) — each must open with how small and how far ("a tiny distant …", "one small far-off …")`,
    );
  }
  // The number that actually reaches Midjourney. Per-field budgets can each
  // pass while the composed prompt still overruns, so check the real thing.
  if (artPackKey) {
    const over = candidate.pages
      .map((p, i) => ({
        i,
        n: promptWordCount(
          composePagePrompt(artPackKey, candidate.characterDesc, p.scene, {
            background: p.background,
            shot: p.shot,
          }),
        ),
      }))
      .filter(({ n }) => n > PROMPT_WORD_CEILING);
    if (over.length > 0) {
      problems.push(
        `${over.length} page(s) compose to a Midjourney prompt over ${PROMPT_WORD_CEILING} words (worst: ${Math.max(
          ...over.map(({ n }) => n),
        )}) — trim "scene" and "background" on page ${over.map(({ i }) => i + 1).join(", ")}`,
      );
    }
  }
  return problems;
};

/** A background phrase has to say how small and how far, not just what. */
const SCALE_WORD_RE =
  /\b(tiny|small|little|distant|far|far-off|faraway|thumbnail|speck|miniature|minute|remote|horizon|high above|way off)\b/i;

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
  const artPackKey = pickArtPack(db, [], premiseRow.lane);
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
  let artProblems = artLayerProblems(candidate, artPackKey);

  if (!candidate || problems.length > 0 || artProblems.length > 0) {
    const flagged = [...problems, ...artProblems];
    log(`draft flagged, one repair pass: ${flagged.join("; ")}`);
    const repairPrompt = `${prompt}

You already wrote a draft, but an editor flagged problems. Fix ONLY these, keeping everything that works:
${flagged.map((p) => `- ${p}`).join("\n")}

YOUR PREVIOUS DRAFT:
${JSON.stringify(raw)}

Return the corrected JSON object only, same shape, exactly ${pageCount} pages.`;
    raw = callClaudeForJson(repairPrompt, { model: models.writer }, call);
    ({ candidate, problems } = parseAndValidate(raw, formKey, band, pageCount));
    artProblems = artLayerProblems(candidate, artPackKey);
    if (artProblems.length > 0) {
      log(`art layers still thin after repair (importing anyway): ${artProblems.join("; ")}`);
    }
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
