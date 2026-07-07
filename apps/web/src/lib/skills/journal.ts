/**
 * Journal skill: the read/write layer for persistent facts about the child.
 * `journalContext` is what every pipeline consumes; `extractJournalFromChat`
 * runs nightly and turns the day's chat questions into durable observations
 * (with provenance) — the parent never has to journal manually for Sprout to
 * learn.
 */
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { chatMessages, children, journalEntries } from "../../db/schema";
import { ageInMonths } from "../age";
import { callClaudeJson } from "../claude";

export type JournalContext = {
  /** Durable likes/dislikes, newest first. */
  preferences: string[];
  /** Milestone ids the parent marked achieved. */
  achievedMilestoneIds: number[];
  /** Notes + observations from the last 3 weeks, newest first. */
  recentNotes: string[];
  /** Measurement entries, oldest first (for trends). */
  measurements: Array<{ ageMonths: number; data: Record<string, unknown>; createdAt: Date }>;
};

export const journalContext = (db: DB): JournalContext => {
  const threeWeeksAgo = Math.floor(Date.now() / 1000) - 21 * 86400;

  const preferences = db
    .select({ content: journalEntries.content })
    .from(journalEntries)
    .where(eq(journalEntries.kind, "preference"))
    .orderBy(desc(journalEntries.id))
    .limit(8)
    .all()
    .map((r) => r.content);

  const achievedMilestoneIds = db
    .select({ milestoneId: journalEntries.milestoneId })
    .from(journalEntries)
    .where(eq(journalEntries.kind, "milestone"))
    .all()
    .map((r) => r.milestoneId)
    .filter((id): id is number => id !== null);

  const recentNotes = db
    .select({ content: journalEntries.content })
    .from(journalEntries)
    .where(
      sql`kind IN ('note', 'observation') AND created_at >= ${threeWeeksAgo}`,
    )
    .orderBy(desc(journalEntries.id))
    .limit(10)
    .all()
    .map((r) => r.content);

  const measurements = db
    .select({
      ageMonths: journalEntries.ageMonths,
      data: journalEntries.data,
      createdAt: journalEntries.createdAt,
    })
    .from(journalEntries)
    .where(eq(journalEntries.kind, "measurement"))
    .orderBy(journalEntries.id)
    .all()
    .map((r) => ({ ...r, data: r.data ?? {} }));

  return { preferences, achievedMilestoneIds, recentNotes, measurements };
};

/** One line for prompts, or empty string when the journal is silent. */
export const personalizationLine = (ctx: JournalContext): string =>
  ctx.preferences.length > 0
    ? `The child currently loves: ${ctx.preferences.slice(0, 4).join("; ")}. Weave one in only if it fits naturally.`
    : "";

// --- nightly extraction ------------------------------------------------------

const ExtractSchema = z.object({
  entries: z.array(
    z.object({
      message: z.number().int(),
      kind: z.enum(["observation", "preference"]),
      content: z.string().min(10).max(300),
    }),
  ),
});

/**
 * Turn recent chat questions into journal entries. Strict: only facts the
 * parent actually stated about THEIR child — questions alone are not facts.
 */
export const extractJournalFromChat = async (db: DB): Promise<string> => {
  const child = db.select().from(children).limit(1).get();
  if (!child) return "no child profile — skipping journal extraction";
  const months = ageInMonths(child.dob);

  const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 86400;
  const alreadyExtracted = db
    .select({ id: journalEntries.sourceMessageId })
    .from(journalEntries)
    .where(sql`source_message_id IS NOT NULL`)
    .all()
    .map((r) => r.id);

  const messages = db
    .select({ id: chatMessages.id, content: chatMessages.content })
    .from(chatMessages)
    .where(
      sql`role = 'user' AND created_at >= ${twoDaysAgo}${
        alreadyExtracted.length > 0 ? sql` AND id NOT IN ${alreadyExtracted}` : sql``
      }`,
    )
    .limit(20)
    .all();
  if (messages.length === 0) return "no new chat messages to extract from";

  const { entries } = await callClaudeJson(
    `A parent asked their research assistant the questions below (child is ${months} months old). Extract ONLY durable facts the parent STATED about their own child, as journal entries.

- "observation": something happening with the child ("wakes at 2am most nights", "started daycare this week").
- "preference": a durable like/dislike ("obsessed with diggers", "refuses broccoli").
- A question is NOT a fact: "when do babies walk?" states nothing about this child. "She took her first steps yesterday — what shoes does she need?" states a fact.
- Write each entry as a short third-person statement. Skip anything uncertain.

EXAMPLE output shape:
{"entries":[{"message": 12, "kind": "observation", "content": "Took first independent steps."},{"message": 15, "kind": "preference", "content": "Loves pointing at dogs on walks."}]}
Return {"entries":[]} if nothing qualifies — that is a common, correct answer.

MESSAGES (id: text):
${messages.map((m) => `${m.id}: ${m.content.slice(0, 250)}`).join("\n")}

Return STRICT JSON: { "entries": [ { "message": int (the message id), "kind": "observation"|"preference", "content": string } ] }`,
    ExtractSchema,
    { temperature: 0.1, think: true },
  );

  const validIds = new Set(messages.map((m) => m.id));
  let inserted = 0;
  for (const e of entries) {
    if (!validIds.has(e.message)) continue;
    // Cheap dedupe: skip if an identical entry already exists.
    const dupe = db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(sql`lower(content) = ${e.content.toLowerCase()}`)
      .get();
    if (dupe) continue;
    db.insert(journalEntries)
      .values({
        childId: child.id,
        kind: e.kind,
        content: e.content,
        ageMonths: months,
        sourceMessageId: e.message,
      })
      .run();
    inserted += 1;
  }
  return `journal extraction: ${inserted} new entr${inserted === 1 ? "y" : "ies"} from ${messages.length} message(s)`;
};

/** Fetch achieved milestone ids as a Set (helper for activity/visit-prep filtering). */
export const achievedMilestones = (db: DB): Set<number> =>
  new Set(journalContext(db).achievedMilestoneIds);

export const milestonesNotYetAchieved = <T extends { id: number }>(
  db: DB,
  rows: T[],
): T[] => {
  const achieved = achievedMilestones(db);
  const remaining = rows.filter((r) => !achieved.has(r.id));
  // If everything is checked off, keep the full list rather than an empty one.
  return remaining.length > 0 ? remaining : rows;
};
