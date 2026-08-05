/**
 * Seed corpus registry: curated story material the premise stage samples from
 * each night (per north-star shares) and the book stage receives in full when
 * a premise draws on a seed.
 */
import type { StorySeed, SeedVocab } from "./types";
import { zhTwSeeds } from "./zh-tw";
import { worldMythSeeds } from "./world-myths";
import { historySeeds } from "./history";
import type { NorthStarShare } from "../premises";

export type { StorySeed, SeedVocab } from "./types";

export const allSeeds: StorySeed[] = [...zhTwSeeds, ...worldMythSeeds, ...historySeeds];

const byKey = new Map(allSeeds.map((s) => [s.key, s]));

export const seedKeys: ReadonlySet<string> = new Set(byKey.keys());

export const getSeed = (key: string | null | undefined): StorySeed | null =>
  (key && byKey.get(key)) || null;

const seedMatchesStar = (seed: StorySeed, star: NorthStarShare): boolean => {
  const tags = new Set(seed.tags.map((t) => t.toLowerCase()));
  return star.tags.some((t) => tags.has(t.toLowerCase()));
};

/**
 * Sample tonight's seed suggestions for the premise prompt. Each north star
 * gets a number of slots proportional to its share (at least one when it has
 * matching seeds); the rest of the slots go to unmatched seeds so the
 * emphasis always has contrast. Festival seeds in season float to the front
 * of their pool.
 */
export const sampleSeedSuggestions = (
  northStars: NorthStarShare[],
  slots = 4,
  rand: () => number = Math.random,
  month: number = new Date().getMonth() + 1,
): StorySeed[] => {
  const inSeason = (s: StorySeed) => (s.festivalMonths ?? []).includes(month);
  const draw = (pool: StorySeed[], n: number): StorySeed[] => {
    const seasonal = pool.filter(inSeason);
    const rest = pool.filter((s) => !inSeason(s));
    const shuffled = [
      ...seasonal.sort(() => rand() - 0.5),
      ...rest.sort(() => rand() - 0.5),
    ];
    return shuffled.slice(0, n);
  };

  const picked: StorySeed[] = [];
  const remaining = new Set(allSeeds);
  for (const star of northStars) {
    const matching = [...remaining].filter((s) => seedMatchesStar(s, star));
    if (matching.length === 0) continue;
    const n = Math.max(1, Math.round(star.share * slots));
    for (const seed of draw(matching, n)) {
      picked.push(seed);
      remaining.delete(seed);
    }
  }
  // Fill the rest with CONTRAST first — seeds no star claims — so an emphasis
  // never captures a whole night's suggestions; matched seeds only pad out
  // when there's nothing else left.
  const unmatched = [...remaining].filter(
    (s) => !northStars.some((star) => seedMatchesStar(s, star)),
  );
  const matched = [...remaining].filter((s) =>
    northStars.some((star) => seedMatchesStar(s, star)),
  );
  for (const seed of [
    ...draw(unmatched, Math.max(0, slots - picked.length)),
    ...draw(matched, Math.max(0, slots - picked.length)),
  ]) {
    if (picked.length >= slots) break;
    picked.push(seed);
  }
  return picked.slice(0, slots);
};

/** One-line summary for the premise-stage prompt. */
export const seedSuggestion = (seed: StorySeed) => ({
  key: seed.key,
  title: seed.title,
  tradition: seed.tradition,
  summary: `${seed.bones.split(". ").slice(0, 2).join(". ")}. [tags: ${seed.tags.join(", ")}]`,
});

/** The full prompt block the book call receives when its premise has a seed. */
export const seedBlock = (seed: StorySeed): string =>
  `SOURCE MATERIAL — this book draws on "${seed.title}" (${seed.tradition}). Stay specific to this tradition; no generic mush.
THE BONES: ${seed.bones}
KEEP (what makes it work): ${seed.keep.map((k) => `\n- ${k}`).join("")}
SOFTEN (adaptation for this age): ${seed.soften.map((s) => `\n- ${s}`).join("")}
AGE NOTES: ${seed.ageNotes}`;

/**
 * Cultural vocabulary as stretch words: at most 1-2 per book, romanization
 * only — no Chinese characters rendered anywhere (owner decision 2026-08-03;
 * the `script` field is stored for the future, never displayed).
 */
export const vocabBlock = (seed: StorySeed): string => {
  if (!seed.vocab || seed.vocab.length === 0) return "";
  return `STRETCH WORDS available (use AT MOST 1-2, only where the scene makes the meaning obvious — a name called across a kitchen, a word whispered at the window. ROMANIZATION ONLY; never render Chinese characters or any non-Latin script):
${seed.vocab.map((v) => `- ${v.romanization} — ${v.gloss}`).join("\n")}`;
};
