/**
 * Imagery-overlap check: motif n-grams shared between a new draft and the
 * last few stories ("fireflies", "blinked awake", the croissant problem).
 * Overlap is a NOTE handed to the editor-judge, never a hard reject — some
 * repetition is how a library gets a voice.
 */
import { desc, inArray, notInArray } from "drizzle-orm";
import type { DB } from "../../db/client";
import { stories, storyPages } from "../../db/schema";

const STOPWORDS = new Set(
  `a an and are as at be but by for from had has he her his i in into is it its
   little me my no not of off on one out she so the their then there they this
   to too up was we what when who will with you your all one two three down
   over under said says went goes go got get like just very came come`.split(/\s+/),
);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * Motif phrases: word n-grams (2-3) that carry at least one content word, plus
 * standalone distinctive nouns (4+ letters, non-stopword). "the meadow at
 * dusk" contributes "meadow" and "meadow at dusk"; "in the and of" contributes
 * nothing.
 */
export const motifPhrases = (text: string): Set<string> => {
  const words = tokenize(text);
  const phrases = new Set<string>();
  for (const w of words) {
    if (!STOPWORDS.has(w) && w.length >= 4) phrases.add(w);
  }
  for (const n of [2, 3]) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n);
      // Every edge word must be a content word, or the gram is glue.
      if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[n - 1])) continue;
      if (!gram.some((w) => !STOPWORDS.has(w) && w.length >= 4)) continue;
      phrases.add(gram.join(" "));
    }
  }
  return phrases;
};

/**
 * Phrases the draft shares with recent texts, longest first. Single words
 * are reported only when no longer phrase already covers them.
 */
export const overlappingMotifs = (
  draftText: string,
  recentTexts: string[],
  limit = 6,
): string[] => {
  const draft = motifPhrases(draftText);
  const seen = new Set<string>();
  for (const text of recentTexts) {
    for (const phrase of motifPhrases(text)) {
      if (draft.has(phrase)) seen.add(phrase);
    }
  }
  const sorted = [...seen].sort((a, b) => b.length - a.length);
  const kept: string[] = [];
  for (const phrase of sorted) {
    if (kept.some((k) => k.includes(phrase))) continue;
    kept.push(phrase);
    if (kept.length >= limit) break;
  }
  return kept;
};

/** Full page text of the last `count` non-rejected stories, one string each. */
export const recentStoryTexts = (db: DB, count = 10): string[] => {
  const recent = db
    .select({ id: stories.id })
    .from(stories)
    .where(notInArray(stories.status, ["rejected", "failed"]))
    .orderBy(desc(stories.id))
    .limit(count)
    .all();
  if (recent.length === 0) return [];
  const ids = recent.map((r) => r.id);
  const pages = db
    .select({ storyId: storyPages.storyId, text: storyPages.text })
    .from(storyPages)
    .where(inArray(storyPages.storyId, ids))
    .all();
  const byStory = new Map<number, string[]>();
  for (const p of pages) {
    byStory.set(p.storyId, [...(byStory.get(p.storyId) ?? []), p.text]);
  }
  return [...byStory.values()].map((texts) => texts.join("\n"));
};

/** The judge note for a draft, or "" when the overlap is unremarkable. */
export const imageryOverlapNote = (db: DB, draftPages: { text: string }[]): string => {
  const overlaps = overlappingMotifs(
    draftPages.map((p) => p.text).join("\n"),
    recentStoryTexts(db),
  );
  if (overlaps.length === 0) return "";
  return `Imagery already used by recent books in the library (flag as samey ONLY if it reads tired here): ${overlaps.join("; ")}`;
};
