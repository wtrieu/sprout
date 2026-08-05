/**
 * Stage A of the story engine: premise generation, ranking, and the inbox
 * pool. One frontier-model call per night proposes ~8 premises; code ranks
 * them for diversity, enforces the lesson dial and per-north-star shares, and
 * everything lands in the premise inbox for the parent to greenlight or pass
 * (with a 48h auto-pick fallback so the library grows without babysitting).
 */
import { z } from "zod";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { premises, stories, storyLessons, type StoryLesson } from "../../db/schema";
import { formKeys, storyForms, type AgeBand } from "../skills/storyText";
import { laneKeys, laneMenu, storyLanes } from "./lanes";
import { ENGINE_VERSION } from "./engine";

/** Premises proposed per stage-A batch. */
export const PREMISES_PER_BATCH = 8;
/** Stage A skips a night while this many premises sit unreviewed. */
export const MAX_PENDING_PREMISES = PREMISES_PER_BATCH;
/** Lesson dial: at most ~1 in 3 selected premises carries an explicit lesson. */
export const LESSON_CAP_RATIO = 1 / 3;
/** Share window: north-star shares are enforced over this many recent picks. */
export const SHARE_WINDOW = 15;
/** Summed north-star shares are capped so half the library stays unconstrained. */
export const MAX_TOTAL_SHARE = 0.5;
/** Unpicked premises auto-pass ("expired") after this many days in the inbox. */
export const PREMISE_EXPIRY_DAYS = 7;

export const PremiseSchema = z.object({
  title: z.string().min(3).max(120),
  lane: z.string(),
  pitch: z.string().min(20).max(700),
  tags: z.array(z.string().min(2).max(40)).min(1).max(8),
  lesson: z.enum(storyLessons).default("none"),
  lessonNote: z.string().max(400).optional(),
  seedRef: z.string().max(80).optional(),
  worldRef: z.string().max(80).optional(),
  form: z.string().max(40).optional(),
  lengthPages: z.number().int().min(4).max(20),
  whyForJun: z.string().max(400).optional(),
});
export type Premise = z.infer<typeof PremiseSchema>;

export const PremiseBatchSchema = z.object({
  premises: z.array(PremiseSchema).min(3).max(12),
});

/**
 * Clean one model-proposed premise: unknown lanes fall back to
 * everyday-wonder, unknown forms/seeds are dropped rather than trusted, the
 * funny lane never carries a lesson, and tags are normalized to lowercase.
 */
export const normalizePremise = (
  p: Premise,
  band: AgeBand,
  validSeedKeys: ReadonlySet<string> = new Set(),
): Premise => {
  const lane = laneKeys.includes(p.lane) ? p.lane : "everyday-wonder";
  const lessonAllowed = storyLanes[lane].lessonAllowed;
  return {
    ...p,
    lane,
    tags: [...new Set(p.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    lesson: lessonAllowed ? p.lesson : "none",
    lessonNote: lessonAllowed ? p.lessonNote : undefined,
    form: p.form && formKeys.includes(p.form) ? p.form : undefined,
    seedRef: p.seedRef && validSeedKeys.has(p.seedRef) ? p.seedRef : undefined,
    lengthPages: Math.min(band.maxPages, Math.max(band.minPages, p.lengthPages)),
  };
};

// ---------------------------------------------------------------------------
// selection: diversity ranking + lesson dial + north-star shares
// ---------------------------------------------------------------------------

export type SelectablePremise = {
  lane: string;
  tags: string[];
  lesson: StoryLesson;
};

export type RecentBookLike = { lane: string | null; tags: string[] | null };

export type NorthStarShare = {
  label: string;
  /** Target fraction of the library (culture starts at 0.2). */
  share: number;
  /** Attribution tags — a premise "touches" the star when tags intersect. */
  tags: string[];
};

const intersects = (a: string[], b: string[]): boolean => {
  const set = new Set(a.map((t) => t.toLowerCase()));
  return b.some((t) => set.has(t.toLowerCase()));
};

export type SelectionContext = {
  /** Last ~10 non-rejected stories, for lane/tag freshness. */
  recentBooks: RecentBookLike[];
  /** Last ~SHARE_WINDOW picked premises (greenlit/auto-picked/written), for shares. */
  recentPicks: SelectablePremise[];
  northStars?: NorthStarShare[];
  rand?: () => number;
};

/**
 * Score one candidate against what's already selected + recent history.
 * Higher = fresher. Pure and deterministic apart from the injected jitter.
 */
const scorePremise = (
  candidate: SelectablePremise,
  selected: SelectablePremise[],
  ctx: SelectionContext,
): number => {
  let score = 10;
  // Lane diversity: hard-ish penalty for repeating tonight, soft for recent books.
  score -= 4 * selected.filter((s) => s.lane === candidate.lane).length;
  score -= Math.min(3, ctx.recentBooks.filter((b) => b.lane === candidate.lane).length);
  // Tag freshness.
  for (const s of selected) {
    score -= 1.5 * (intersects(s.tags, candidate.tags) ? 1 : 0);
  }
  score -=
    0.5 *
    Math.min(4, ctx.recentBooks.filter((b) => intersects(b.tags ?? [], candidate.tags)).length);
  // North-star share steering over the rolling window of picks.
  for (const star of ctx.northStars ?? []) {
    if (!intersects(candidate.tags, star.tags)) continue;
    const window = [...ctx.recentPicks, ...selected];
    const touched = window.filter((p) => intersects(p.tags, star.tags)).length;
    const target = star.share * Math.max(window.length + 1, SHARE_WINDOW);
    score += touched < target ? 2 : -3;
  }
  score += (ctx.rand ?? Math.random)() * 0.5; // tie-break jitter
  return score;
};

/**
 * Greedy diverse selection with the lesson dial enforced: pick `count`
 * premises, never letting explicit lessons exceed ~1/3 of the picks while a
 * no-lesson candidate is still available.
 */
export const selectPremises = <T extends SelectablePremise>(
  pool: T[],
  count: number,
  ctx: SelectionContext,
): T[] => {
  const selected: T[] = [];
  const remaining = [...pool];
  const lessonCap = Math.max(count >= 3 ? 1 : 0, Math.floor(count * LESSON_CAP_RATIO));
  while (selected.length < count && remaining.length > 0) {
    const lessonsPicked = selected.filter((s) => s.lesson !== "none").length;
    const lessonBlocked =
      lessonsPicked >= lessonCap && remaining.some((r) => r.lesson === "none");
    const eligible = lessonBlocked ? remaining.filter((r) => r.lesson === "none") : remaining;
    let best: T | null = null;
    let bestScore = -Infinity;
    for (const candidate of eligible) {
      const s = scorePremise(candidate, selected, ctx);
      if (s > bestScore) {
        bestScore = s;
        best = candidate;
      }
    }
    if (!best) break;
    selected.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }
  return selected;
};

/** Rank a whole pool (for inbox ordering): returns pool sorted best-first. */
export const rankPremises = <T extends SelectablePremise>(
  pool: T[],
  ctx: SelectionContext,
): T[] => selectPremises(pool, pool.length, ctx);

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

export const pendingPremiseCount = (db: DB): number =>
  db.select({ id: premises.id }).from(premises).where(eq(premises.status, "proposed")).all()
    .length;

/** Last ~10 non-rejected stories (freshness context for ranking + prompts). */
export const recentBookRows = (db: DB, limit = 10) =>
  db
    .select({
      title: stories.title,
      lane: stories.lane,
      tags: stories.tags,
      characterName: stories.characterName,
      lesson: stories.lesson,
    })
    .from(stories)
    .where(sql`${stories.status} NOT IN ('rejected', 'failed')`)
    .orderBy(desc(stories.id))
    .limit(limit)
    .all();

/** Last ~SHARE_WINDOW picked premises — the north-star share window. */
export const recentPickedPremises = (db: DB): SelectablePremise[] =>
  db
    .select({ lane: premises.lane, tags: premises.tags, lesson: premises.lesson })
    .from(premises)
    .where(inArray(premises.status, ["greenlit", "auto_picked", "written", "rejected"]))
    .orderBy(desc(premises.id))
    .limit(SHARE_WINDOW)
    .all()
    .map((r) => ({ lane: r.lane, tags: r.tags ?? [], lesson: r.lesson }));

export const storePremises = (
  db: DB,
  childId: number,
  batch: Premise[],
  ranked: Premise[],
): number[] =>
  db.transaction((tx) =>
    batch.map((p) => {
      const rankIndex = ranked.indexOf(p);
      return tx
        .insert(premises)
        .values({
          childId,
          title: p.title,
          lane: p.lane,
          pitch: p.pitch,
          tags: p.tags,
          lesson: p.lesson,
          lessonNote: p.lessonNote ?? null,
          seedRef: p.seedRef ?? null,
          worldRef: p.worldRef ?? null,
          form: p.form ?? null,
          lengthPages: p.lengthPages,
          whyForJun: p.whyForJun ?? null,
          score: rankIndex === -1 ? 0 : ranked.length - rankIndex,
          engineVersion: ENGINE_VERSION,
          status: "proposed",
        })
        .returning({ id: premises.id })
        .get().id;
    }),
  );

/** Proposed premises older than the auto-pick window. */
export const stalePremiseRows = (db: DB, hours: number) => {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000);
  return db
    .select()
    .from(premises)
    .where(and(eq(premises.status, "proposed"), lt(premises.createdAt, cutoff)))
    .all();
};

/** Greenlit premises whose detached book-write never landed (crash recovery). */
export const unwrittenGreenlitRows = (db: DB) =>
  db
    .select()
    .from(premises)
    .where(and(eq(premises.status, "greenlit"), isNull(premises.storyId)))
    .all();

/** Auto-pass premises that sat unpicked past expiry, so the pool refreshes. */
export const expireStalePremises = (db: DB, days = PREMISE_EXPIRY_DAYS): number => {
  const cutoff = new Date(Date.now() - days * 86400 * 1000);
  const rows = db
    .select({ id: premises.id })
    .from(premises)
    .where(and(eq(premises.status, "proposed"), lt(premises.createdAt, cutoff)))
    .all();
  for (const row of rows) {
    db.update(premises)
      .set({ status: "passed", passReason: "expired", decidedAt: new Date() })
      .where(eq(premises.id, row.id))
      .run();
  }
  return rows.length;
};

// ---------------------------------------------------------------------------
// the stage-A prompt
// ---------------------------------------------------------------------------

export type PremisePromptInput = {
  childName: string;
  ageText: string;
  band: AgeBand;
  batchSize: number;
  recentBooks: ReturnType<typeof recentBookRows>;
  pendingTitles: string[];
  /** Durable family intents, always included. Empty until the interests page ships. */
  northStars: { label: string; brief: string }[];
  /** Sampled current fascinations (2-3 per night). */
  interests: { label: string; brief: string }[];
  /** Curated seed material offered tonight (sampled per north-star shares). */
  seedSuggestions: { key: string; title: string; tradition: string; summary: string }[];
  /** The child's developmental frontier, for the occasional developmental lesson. */
  milestoneFrontier: string[];
  /** The distilled editor's memo (data/editorial-taste.md), or "". */
  tasteMemo: string;
};

const formMenu = (): string =>
  formKeys.map((k) => `- ${k}: ${storyForms[k].name}`).join("\n");

export const buildPremisePrompt = (input: PremisePromptInput): string => {
  const lessonCap = Math.max(1, Math.floor(input.batchSize * LESSON_CAP_RATIO));
  const sections: string[] = [];

  sections.push(`You are the commissioning editor for ${input.childName}'s home library — a small press that publishes a few picture books a week for one child, ${input.ageText} old. Tonight you propose ${input.batchSize} book premises. A parent will greenlight the ones they love; a different call writes each greenlit book later. Your job is RANGE and APPEAL: premises a tired parent reads on their phone and thinks "oh, that one."

Reading level: ${input.band.language}
Each book will be ${input.band.minPages}-${input.band.maxPages} pages, up to ${input.band.maxWordsPerPage} words per page — propose a lengthPages within that range that suits each premise.`);

  if (input.tasteMemo) {
    sections.push(`THE HOUSE TASTE (editor's memo distilled from this family's approvals and rejections — let it steer you):\n${input.tasteMemo}`);
  }

  if (input.northStars.length > 0) {
    sections.push(`FAMILY NORTH STARS (durable intents; fold in naturally where a premise suits it — NEVER force one, never make every premise about them):\n${input.northStars.map((n) => `- ${n.label}: ${n.brief}`).join("\n")}`);
  }

  if (input.interests.length > 0) {
    sections.push(`CURRENT FASCINATIONS (inspiration, not required props — a premise may riff on one, most should ignore them):\n${input.interests.map((i) => `- ${i.label}: ${i.brief}`).join("\n")}`);
  }

  if (input.seedSuggestions.length > 0) {
    sections.push(`STORY SEEDS available tonight (curated real material; if a premise retells or draws on one, set "seedRef" to its key — use at most 2 tonight, and only where the material genuinely excites you):\n${input.seedSuggestions.map((s) => `- ${s.key} (${s.tradition}): "${s.title}" — ${s.summary}`).join("\n")}`);
  }

  sections.push(`GENRE LANES (spread tonight's premises across at least 4 different lanes):\n${laneMenu()}`);

  sections.push(`THE LESSON DIAL — entertainment first. At most ${lessonCap} of the ${input.batchSize} premises may carry an explicit lesson ("developmental", "cultural", or "factual" — with a one-line lessonNote saying what is SHOWN, never preached). Every other premise is lesson: "none" — commissioned as "no lesson, just a good story."${
    input.milestoneFrontier.length > 0
      ? `\nIf you use a developmental lesson, draw from the child's current frontier: ${input.milestoneFrontier.join("; ")}`
      : ""
  }`);

  sections.push(`PROTAGONISTS are free: a child, an animal, a moon rabbit, a little god, a lighthouse keeper, a sailor — whatever the premise wants. No default species, no default coziness.`);

  sections.push(`TEXT FORMS (optional tools — attach "form" ONLY when a premise is genuinely built for that structure, most premises should have no form):\n${formMenu()}`);

  const avoid: string[] = [];
  if (input.recentBooks.length > 0) {
    avoid.push(`Recent books (push away from these lanes, subjects, and characters):\n${input.recentBooks
      .map(
        (b) =>
          `- "${b.title ?? "untitled"}" [${b.lane ?? "bedtime"}]${b.characterName ? ` starring ${b.characterName}` : ""}${b.tags && b.tags.length ? ` — ${b.tags.join(", ")}` : ""}`,
      )
      .join("\n")}`);
  }
  if (input.pendingTitles.length > 0) {
    avoid.push(`Premises already waiting in the inbox (do not duplicate): ${input.pendingTitles.map((t) => `"${t}"`).join(", ")}`);
  }
  if (avoid.length > 0) sections.push(avoid.join("\n\n"));

  sections.push(`Return ONLY a JSON object, no prose before or after, exactly this shape:
{ "premises": [ { "title": string, "lane": string (a lane key), "pitch": string (2-3 sentences — the premise itself, concrete and appealing), "tags": string[] (3-6 lowercase topic/motif tags), "lesson": "none"|"developmental"|"cultural"|"factual", "lessonNote": string (only when lesson is not "none"), "seedRef": string (optional seed key), "form": string (optional form key), "lengthPages": number, "whyForJun": string (one sentence: why this child, why now) } ] }
Exactly ${input.batchSize} premises.`);

  return sections.join("\n\n");
};
