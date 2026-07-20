/**
 * Corpus-audit skill: the same three audits as before, but shaped for a local
 * model — small fixed batches (a 30-doc mega-prompt overflows attention and
 * context on a 14B), one narrow judgment per call, exemplars pinned.
 */
import { z } from "zod";
import { callClaudeJson } from "../claude";

export const AUDIT_BATCH_SIZE = 8;

export const inBatches = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// --- relevance re-grade ---------------------------------------------------------

const RegradeSchema = z.object({
  verdicts: z.array(
    z.object({ id: z.number().int(), agree: z.boolean(), reason: z.string().max(300) }),
  ),
});

export type GradedDoc = {
  id: number;
  title: string;
  content: string;
  relevance: string;
  ageMin: number | null;
  ageMax: number | null;
};

export const regradeBatch = async (batch: GradedDoc[]) => {
  const { verdicts } = await callClaudeJson(
    `A small local model classifies documents for a parenting research library (family with one child aged 0-5). "relevant" means useful to such a parent: nutrition, sleep, development, safety, health, activities, parenting approaches. Audit its calls below.

EXAMPLE output shape (a paper on adolescent screen time labeled RELEVANT, and a weaning guide labeled RELEVANT):
{"verdicts":[{"id": 12, "agree": false, "reason": "Adolescent-focused; family's child is 0-5."},{"id": 13, "agree": true, "reason": ""}]}

${batch
  .map(
    (d) =>
      `#${d.id} — labeled ${d.relevance.toUpperCase()}${d.ageMin !== null || d.ageMax !== null ? ` (ages ${d.ageMin ?? "?"}-${d.ageMax ?? "?"}mo)` : ""}\nTitle: ${d.title}\nExcerpt: ${d.content}`,
  )
  .join("\n\n---\n\n")}

Return STRICT JSON: { "verdicts": [ { "id": int, "agree": boolean, "reason": string (one sentence; empty when you agree) } ] } — one entry per document.`,
    RegradeSchema,
    { temperature: 0.1, think: true },
  );
  return verdicts;
};

// --- staleness flags --------------------------------------------------------------

const StalenessSchema = z.object({
  flags: z.array(
    z.object({ id: z.number().int(), stale_risk: z.boolean(), reason: z.string().max(300) }),
  ),
});

export type OldDoc = { id: number; title: string; content: string; year: string };

export const stalenessBatch = async (batch: OldDoc[], today: string) => {
  const { flags } = await callClaudeJson(
    `These parenting-library documents are over two years old. Pediatric guidance changes (sleep safety, allergen introduction, screen time, feeding). For each, flag stale_risk=true ONLY where recommendations in that area have plausibly moved since publication — not merely because it is old. Timeless content (basic development descriptions, generic play ideas) is not stale. Today is ${today}.

EXAMPLE output shape (a 2021 article on allergen timing, and a 2020 article describing typical 12-month motor skills):
{"flags":[{"id": 4, "stale_risk": true, "reason": "Allergen-introduction guidance shifted toward earlier introduction; timing advice may be outdated."},{"id": 5, "stale_risk": false, "reason": ""}]}

${batch.map((d) => `#${d.id} (published ${d.year}) — ${d.title}\n${d.content}`).join("\n\n---\n\n")}

Return STRICT JSON: { "flags": [ { "id": int, "stale_risk": boolean, "reason": string } ] } — one entry per document.`,
    StalenessSchema,
    { temperature: 0.1, think: true },
  );
  return flags;
};

// --- source-suggestion review -------------------------------------------------------

const SuggestionSchema = z.object({
  recommendations: z.array(
    z.object({
      id: z.number().int(),
      recommend: z.enum(["approve", "reject", "unsure"]),
      reason: z.string().max(300),
    }),
  ),
});

export type PendingSuggestion = {
  id: number;
  url: string;
  title: string | null;
  reason: string | null;
};

export const suggestionBatch = async (batch: PendingSuggestion[]) => {
  const { recommendations } = await callClaudeJson(
    `These URLs were auto-discovered as potential additions to a parenting research library built on authoritative sources (CDC, WHO, AAP, PubMed, MedlinePlus). Recommend whether a human should approve each: favor authoritative, primary, non-commercial sources about children aged 0-5; reject content farms, product marketing, and off-topic material. Use "unsure" when the URL alone doesn't tell you.

EXAMPLE output shape:
{"recommendations":[{"id": 1, "recommend": "approve", "reason": "PubMed primary literature."},{"id": 2, "recommend": "reject", "reason": "Commercial product-review site."}]}

${batch.map((s) => `#${s.id} — ${s.url}${s.title ? `\n  title: ${s.title}` : ""}${s.reason ? `\n  found via: ${s.reason}` : ""}`).join("\n\n")}

Return STRICT JSON: { "recommendations": [ { "id": int, "recommend": "approve"|"reject"|"unsure", "reason": string } ] } — one entry per suggestion.`,
    SuggestionSchema,
    { temperature: 0.1 },
  );
  return recommendations;
};
