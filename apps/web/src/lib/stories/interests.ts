/**
 * Interests & north stars — the preference-intake layer feeding the premise
 * stage. North stars are durable family intents with a target share of the
 * library (a light guiding touch, never a filter); interests are current
 * fascinations, sampled by weight and decayed without reinforcement.
 */
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { interests, journalEntries } from "../../db/schema";
import { callClaudeJson } from "../claude";
import { MAX_TOTAL_SHARE, type NorthStarShare } from "./premises";

export const DEFAULT_SHARE = 0.2; // owner decision 2026-08-03: 1/5 per north star
const DECAY_INTERVAL_DAYS = 21; // weight −1 every 3 weeks without reinforcement
export const MAX_WEIGHT = 5;

export type InterestRow = typeof interests.$inferSelect;

export const activeNorthStars = (db: DB): InterestRow[] =>
  db
    .select()
    .from(interests)
    .where(and(eq(interests.kind, "north-star"), eq(interests.status, "active")))
    .all();

/**
 * North stars as share targets for premise selection. Summed shares are
 * capped at MAX_TOTAL_SHARE (scaled down proportionally when exceeded) so at
 * least half the library always stays fully unconstrained.
 */
export const northStarShares = (db: DB): NorthStarShare[] => {
  const stars = activeNorthStars(db).map((s) => ({
    label: s.label,
    share: s.share ?? DEFAULT_SHARE,
    tags: s.tags,
  }));
  const total = stars.reduce((sum, s) => sum + s.share, 0);
  if (total <= MAX_TOTAL_SHARE) return stars;
  const scale = MAX_TOTAL_SHARE / total;
  return stars.map((s) => ({ ...s, share: s.share * scale }));
};

/** Weight-proportional sample (without replacement) of active interests. */
export const sampleInterests = (
  db: DB,
  n = 3,
  rand: () => number = Math.random,
): InterestRow[] => {
  const pool = db
    .select()
    .from(interests)
    .where(and(eq(interests.kind, "interest"), eq(interests.status, "active")))
    .all();
  const picked: InterestRow[] = [];
  while (picked.length < n && pool.length > 0) {
    const total = pool.reduce((sum, r) => sum + Math.max(1, r.weight), 0);
    let roll = rand() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      roll -= Math.max(1, pool[idx].weight);
      if (roll <= 0) break;
    }
    picked.push(...pool.splice(Math.min(idx, pool.length - 1), 1));
  }
  return picked;
};

/**
 * Weekly-ish decay, safe to call nightly: an interest loses one weight per
 * 3 weeks without reinforcement (or prior decay), and archives at 0.
 * North stars never decay.
 */
export const decayInterests = (db: DB, now: Date = new Date()): number => {
  const cutoff = now.getTime() - DECAY_INTERVAL_DAYS * 86400 * 1000;
  const rows = db
    .select()
    .from(interests)
    .where(and(eq(interests.kind, "interest"), eq(interests.status, "active")))
    .all();
  let decayed = 0;
  for (const row of rows) {
    const last = Math.max(
      row.createdAt.getTime(),
      row.lastReinforcedAt?.getTime() ?? 0,
      row.lastDecayedAt?.getTime() ?? 0,
    );
    if (last > cutoff) continue;
    const weight = row.weight - 1;
    db.update(interests)
      .set({
        weight: Math.max(0, weight),
        lastDecayedAt: now,
        ...(weight <= 0 ? { status: "archived" as const } : {}),
      })
      .where(eq(interests.id, row.id))
      .run();
    decayed += 1;
  }
  return decayed;
};

/**
 * Review-as-intake: nudge every active interest whose tags intersect a
 * story's tags. Positive deltas reinforce (refresh the decay clock); negative
 * deltas never archive on their own — parents archive, stories just cool.
 */
export const nudgeInterestsByTags = (
  db: DB,
  storyTags: string[],
  delta: number,
  now: Date = new Date(),
): number => {
  if (storyTags.length === 0) return 0;
  const tagSet = new Set(storyTags.map((t) => t.toLowerCase()));
  const rows = db
    .select()
    .from(interests)
    .where(and(eq(interests.kind, "interest"), eq(interests.status, "active")))
    .all();
  let nudged = 0;
  for (const row of rows) {
    if (!row.tags.some((t) => tagSet.has(t.toLowerCase()))) continue;
    db.update(interests)
      .set({
        weight: Math.min(MAX_WEIGHT, Math.max(1, row.weight + delta)),
        ...(delta > 0 ? { lastReinforcedAt: now } : {}),
      })
      .where(eq(interests.id, row.id))
      .run();
    nudged += 1;
  }
  return nudged;
};

// ---------------------------------------------------------------------------
// suggestion intake (conversational capture)
// ---------------------------------------------------------------------------

const SuggestSchema = z.object({
  suggestions: z.array(
    z.object({
      label: z.string().min(2).max(60),
      brief: z.string().min(10).max(200),
      tags: z.array(z.string().min(2).max(30)).min(1).max(5),
    }),
  ),
});

/**
 * Propose interest candidates from recent journal entries (which include the
 * nightly chat extraction). Proposals land as status='suggested' pending
 * one-tap confirmation on the interests page — NEVER auto-added: raw
 * extraction → literal insertion is the failure mode the croissant taught us.
 * Runs on the local-first lane (callClaudeJson falls back to qwen3).
 */
export const proposeInterestSuggestions = async (db: DB): Promise<string> => {
  const twoWeeksAgo = Math.floor(Date.now() / 1000) - 14 * 86400;
  const recent = db
    .select({ kind: journalEntries.kind, content: journalEntries.content })
    .from(journalEntries)
    .where(
      sql`kind IN ('preference', 'observation', 'note') AND created_at >= ${twoWeeksAgo}`,
    )
    .limit(30)
    .all();
  if (recent.length === 0) return "interest suggestions: no recent journal entries";

  const existing = db.select({ label: interests.label }).from(interests).all();
  const existingLabels = new Set(existing.map((r) => r.label.toLowerCase()));

  const { suggestions } = await callClaudeJson(
    `From these journal entries about a young child, propose up to 3 CURRENT FASCINATIONS worth feeding into their storybook engine — recurring, story-worthy interests ("diggers", "pointing at the moon", "dogs"), not one-off events or needs.

- Only propose something with real evidence of delight or repetition.
- "label": 1-3 words. "brief": one sentence a story-premise writer can use. "tags": lowercase topic words.
- Do NOT propose any of these existing ones: ${[...existingLabels].join(", ") || "(none)"}.
- Returning {"suggestions":[]} is a common, correct answer.

JOURNAL ENTRIES:
${recent.map((r) => `- (${r.kind}) ${r.content.slice(0, 200)}`).join("\n")}

Return STRICT JSON: { "suggestions": [ { "label": string, "brief": string, "tags": string[] } ] }`,
    SuggestSchema,
    { temperature: 0.2, think: true },
  );

  let inserted = 0;
  for (const s of suggestions) {
    if (existingLabels.has(s.label.toLowerCase())) continue;
    db.insert(interests)
      .values({
        kind: "interest",
        label: s.label,
        brief: s.brief,
        tags: s.tags.map((t) => t.toLowerCase()),
        weight: 2,
        source: "chat",
        status: "suggested",
      })
      .run();
    inserted += 1;
  }
  return `interest suggestions: ${inserted} proposed from ${recent.length} journal entr${recent.length === 1 ? "y" : "ies"}`;
};
