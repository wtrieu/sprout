/**
 * Agentic Ask: the chat answers from more than the corpus. A one-shot intent
 * classification (small models classify well) decides which context builders
 * run — growth math, milestone checklist, journal facts, corpus retrieval —
 * all deterministic code except the final composition. Conversation history
 * makes follow-ups work.
 */
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { chatMessages, journalEntries, milestones, type Citation } from "../../db/schema";
import { ageInDays, formatAge } from "../age";
import { callClaudeJson, callClaudeText } from "../claude";
import { growthPercentile, type Sex } from "../growth";
import { retrieve, toCitations, type RetrievedChunk } from "../rag";
import { journalContext, achievedMilestones } from "./journal";

export const intents = ["research", "growth", "milestones", "journal"] as const;
export type Intent = (typeof intents)[number];

const IntentSchema = z.object({
  intents: z.array(z.enum(intents)).min(1).max(3),
});

export type Turn = { role: "user" | "assistant"; content: string };

const historyBlock = (history: Turn[]): string =>
  history.length > 0
    ? `CONVERSATION SO FAR (for context — resolve pronouns and follow-ups against it):\n${history
        .map((t) => `${t.role === "user" ? "Parent" : "Assistant"}: ${t.content.slice(0, 300)}`)
        .join("\n")}\n`
    : "";

/** Classify which context the answer needs. Cheap, fast, no thinking. */
export const routeIntents = async (
  question: string,
  history: Turn[],
): Promise<Intent[]> => {
  const { intents: routed } = await callClaudeJson(
    `Classify what a parenting assistant needs to answer this question. Pick 1-3:

- "research": general parenting/health/development knowledge from the research library (the default — almost always included).
- "growth": the child's OWN size — weight, length, head circumference, percentiles, "is she big/small for her age".
- "milestones": what children this age typically do, "should he be doing X by now", development checklists.
- "journal": the child's OWN history — "when did he first...", "what did I say about...", their likes/dislikes.

EXAMPLE: "is his weight okay for 13 months?" → {"intents":["growth","research"]}
EXAMPLE: "when do toddlers usually say mama?" → {"intents":["milestones","research"]}
EXAMPLE: "how do I get her to eat vegetables?" → {"intents":["research","journal"]}

${historyBlock(history)}QUESTION: ${question}

Return STRICT JSON: { "intents": string[] }`,
    IntentSchema,
    { temperature: 0.1 },
  );
  return [...new Set(routed)];
};

// --- deterministic context builders -------------------------------------------

const growthBlock = (db: DB, dob: string): string => {
  const ctx = journalContext(db);
  if (ctx.measurements.length === 0) {
    return "GROWTH DATA: no measurements logged yet. (The parent can log one on the Growth or Visit prep page.)";
  }
  const lines: string[] = [];
  for (const m of ctx.measurements.slice(-4)) {
    const d = m.data as { sex?: string; weightKg?: number; lengthCm?: number; hcCm?: number };
    const parts: string[] = [];
    if (d.weightKg) parts.push(`weight ${d.weightKg} kg`);
    if (d.lengthCm) parts.push(`length ${d.lengthCm} cm`);
    if (d.hcCm) parts.push(`HC ${d.hcCm} cm`);
    lines.push(`- at ${m.ageMonths}mo: ${parts.join(", ")}`);
  }
  // Percentiles for the most recent measurement (WHO LMS, computed — exact).
  const latest = ctx.measurements[ctx.measurements.length - 1];
  const d = latest.data as { sex?: string; weightKg?: number; lengthCm?: number };
  const sex = (d.sex ?? "male") as Sex;
  const days = ageInDays(dob, new Date(latest.createdAt));
  if (d.weightKg) {
    const p = growthPercentile(db, { sex, measure: "weight_age", x: days, value: d.weightKg });
    if (p) lines.push(`- latest weight-for-age: P${p.percentile.toFixed(1)} (z ${p.z.toFixed(2)})`);
  }
  if (d.lengthCm) {
    const p = growthPercentile(db, { sex, measure: "length_age", x: days, value: d.lengthCm });
    if (p) lines.push(`- latest length-for-age: P${p.percentile.toFixed(1)} (z ${p.z.toFixed(2)})`);
  }
  return `GROWTH DATA (this child, WHO percentiles computed exactly — quote as given):\n${lines.join("\n")}`;
};

const milestonesBlock = (db: DB, months: number): string => {
  const bucket = db.get<{ age: number } | undefined>(
    sql`SELECT MAX(age_months) as age FROM milestones WHERE age_months <= ${months}`,
  );
  const nextBucket = db.get<{ age: number } | undefined>(
    sql`SELECT MIN(age_months) as age FROM milestones WHERE age_months > ${months}`,
  );
  const rows = db
    .select({
      id: milestones.id,
      domain: milestones.domain,
      ageMonths: milestones.ageMonths,
      description: milestones.description,
    })
    .from(milestones)
    .where(sql`age_months IN (${bucket?.age ?? months}, ${nextBucket?.age ?? months})`)
    .all();
  const achieved = achievedMilestones(db);
  return `CDC MILESTONE CHECKLIST (current ${bucket?.age ?? months}mo + upcoming ${nextBucket?.age ?? "?"}mo buckets; "most children by this age" markers, not tests; ✓ = parent marked achieved):\n${rows
    .map((m) => `- ${achieved.has(m.id) ? "✓ " : ""}[${m.ageMonths}mo, ${m.domain}] ${m.description}`)
    .join("\n")}`;
};

const journalBlock = (db: DB): string => {
  const rows = db
    .select({
      kind: journalEntries.kind,
      content: journalEntries.content,
      ageMonths: journalEntries.ageMonths,
    })
    .from(journalEntries)
    .orderBy(desc(journalEntries.id))
    .limit(15)
    .all();
  if (rows.length === 0) return "JOURNAL: empty so far.";
  return `JOURNAL (facts recorded about this child, newest first):\n${rows
    .map((r) => `- [${r.ageMonths}mo, ${r.kind}] ${r.content}`)
    .join("\n")}`;
};

export type AskContext = {
  blocks: string[];
  retrieved: RetrievedChunk[];
  citations: Citation[];
};

export const buildAskContext = async (
  db: DB,
  question: string,
  routed: Intent[],
  months: number,
  dob: string,
): Promise<AskContext> => {
  const blocks: string[] = [];
  if (routed.includes("growth")) blocks.push(growthBlock(db, dob));
  if (routed.includes("milestones")) blocks.push(milestonesBlock(db, months));
  if (routed.includes("journal")) blocks.push(journalBlock(db));

  let retrieved: RetrievedChunk[] = [];
  if (routed.includes("research") || blocks.length === 0) {
    retrieved = await retrieve(db, question, months, 8);
  }
  return { blocks, retrieved, citations: toCitations(retrieved) };
};

export const composeAnswer = async (input: {
  question: string;
  months: number;
  childName: string;
  history: Turn[];
  ctx: AskContext;
}): Promise<string> => {
  const { ctx } = input;
  const corpusContext =
    ctx.retrieved.length > 0
      ? `SOURCED CONTEXT (cite inline as [1], [2]…):\n${ctx.retrieved
          .map((r, i) => `[${i + 1}] (${r.title})\n${r.text}`)
          .join("\n\n---\n\n")}`
      : "";

  return callClaudeText(
    `You are a careful parenting research assistant for a parent whose child, ${input.childName}, is ${formatAge(input.months)} old.

${historyBlock(input.history)}${ctx.blocks.join("\n\n")}

${corpusContext}

QUESTION: ${input.question}

Rules:
- Child-specific data blocks (GROWTH, MILESTONES, JOURNAL) are facts about ${input.childName} — use them directly, no citation markers needed.
- Claims from the SOURCED CONTEXT need inline [n] markers. Never invent guidance beyond what the blocks and sources say.
- If neither the blocks nor the sources cover the question, say so plainly.
- Practical and specific to a ${formatAge(input.months)}-old. You are not a doctor; for anything symptom- or safety-critical, advise checking with the pediatrician.

Answer:`,
    { temperature: 0.3, numCtx: 12288 },
  );
};

/** Last N exchanges of a session, oldest first, for prompt context. */
export const sessionHistory = (db: DB, sessionId: number, n = 6): Turn[] =>
  db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.id))
    .limit(n)
    .all()
    .reverse();
