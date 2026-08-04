/**
 * Story seeds: curated, parent-reviewable story material checked into the
 * repo (PR-editable). A seed carries the actual bones of a tale plus
 * adaptation notes — the premise stage offers a sampled handful each night
 * and the book stage receives the full entry when a premise draws on one.
 */

export type SeedVocab = {
  /** The concept in English ("grandma", "moon"). */
  word: string;
  /** What appears in the book — romanization only. */
  romanization: string;
  /** Short gloss incl. language ("grandma (Taiwanese Hokkien)"). */
  gloss: string;
  /**
   * Native script, kept for the future — NOTHING renders it (owner decision
   * 2026-08-03: romanization only, no Chinese characters displayed).
   */
  script?: string;
};

export type StorySeed = {
  /** Stable key stored on premises.seed_ref. */
  key: string;
  /** Where this comes from, specifically ("Taiwanese Hokkien", "Thao legend, Taiwan"). */
  tradition: string;
  title: string;
  /** The actual tale, 5-10 sentences — bones, not a summary of vibes. */
  bones: string;
  /** What makes it work — keep these. */
  keep: string[];
  /** Adaptation notes: how to gentle it for this age. */
  soften: string[];
  ageNotes: string;
  tags: string[];
  /** Cultural vocabulary that can ride the stretch-words slot (1-2 per book max). */
  vocab?: SeedVocab[];
  /** Months (1-12) when this seed is in season (festivals); boosts sampling. */
  festivalMonths?: number[];
};
