/**
 * Research-brief skill. The failure mode of one-shot synthesis on a small
 * model is confident prose with drifting citations. So:
 *
 *   1. plan sub-queries (small call)
 *   2. extract findings per source BATCH — each finding carries its source
 *      index, so citations are attached at extraction time, not invented
 *      during writing
 *   3. write each section from the FINDINGS ONLY (the writer never sees raw
 *      chunks and can only cite indices that exist)
 *   4. code validates every [n] marker and assembles the document
 */
import { z } from "zod";
import { callClaudeJson } from "../claude";
import { formatAge } from "../age";

// --- step 1: fan the topic out ------------------------------------------------

const PlanSchema = z.object({
  sub_queries: z.array(z.string()).min(2).max(4),
  pubmed_term: z.string().min(3),
});

export const planQueries = (topic: string, months: number) =>
  callClaudeJson(
    `A parent of a ${formatAge(months)}-old wants a research brief on: "${topic}"

Return STRICT JSON:
{
  "sub_queries": string[],  // 2-4 distinct retrieval queries covering different angles (mechanism, practical guidance, safety, age-specifics)
  "pubmed_term": string     // one PubMed search term for primary literature on this topic in young children
}

EXAMPLE for topic "introducing peanut early":
{"sub_queries":["early peanut introduction allergy prevention","how to serve peanut to infants safely","signs of allergic reaction to peanut in babies"],"pubmed_term":"early peanut introduction infant allergy prevention"}`,
    PlanSchema,
    { temperature: 0.3 },
  );

// --- step 2: extract findings, source index attached at birth -------------------

const FindingsSchema = z.object({
  findings: z.array(
    z.object({
      source: z.number().int().min(1),
      claim: z.string().min(15).max(400),
      strength: z.enum(["strong", "moderate", "weak"]),
    }),
  ),
});
export type Finding = z.infer<typeof FindingsSchema>["findings"][number];

export type NumberedSource = { index: number; label: string; text: string };

/** Extract findings from a batch of ≤4 sources (keeps prompts small for a 14B). */
export const extractFindings = async (
  topic: string,
  months: number,
  batch: NumberedSource[],
): Promise<Finding[]> => {
  const { findings } = await callClaudeJson(
    `Extract every finding relevant to "${topic}" (child is ${formatAge(months)} old) from the numbered sources below. A finding is ONE factual claim the source actually states — not your interpretation.

Rate strength by the source itself: "strong" = guideline body, RCT, meta-analysis, or large study; "moderate" = observational study or authoritative summary; "weak" = small study, expert opinion, or hedged statement.

Skip sources with nothing relevant. Use the source's own number.

EXAMPLE output shape (shortened to one finding — extract every relevant one):
{"findings":[{"source": 3, "claim": "Introducing peanut protein between 4-11 months reduced peanut allergy by ~80% in high-risk infants (LEAP trial).", "strength": "strong"}]}

SOURCES:
${batch.map((s) => `[${s.index}] (${s.label})\n${s.text}`).join("\n\n---\n\n")}

Return STRICT JSON: { "findings": [ { "source": int, "claim": string, "strength": "strong"|"moderate"|"weak" } ] }`,
    FindingsSchema,
    { temperature: 0.2, think: true, numCtx: 10240 },
  );
  const valid = new Set(batch.map((s) => s.index));
  return findings.filter((f) => valid.has(f.source));
};

// --- step 3: write each section from the findings only --------------------------

const SectionSchema = z.object({ section_md: z.string().min(40) });

const findingsBlock = (findings: Finding[]): string =>
  findings.map((f) => `[${f.source}] (${f.strength}) ${f.claim}`).join("\n");

export const writeEvidenceSection = async (topic: string, findings: Finding[]) => {
  const { section_md } = await callClaudeJson(
    `Write the "What the evidence says" section of a parent research brief on "${topic}", using ONLY the findings below. Every sentence that states a fact keeps the [n] marker(s) of the finding(s) it came from — copy the numbers exactly. Group related findings into short paragraphs. Give strong findings more weight than weak ones. Do not add any claim not in the list.

FINDINGS:
${findingsBlock(findings)}

Return STRICT JSON: { "section_md": string (markdown paragraphs, no heading) }`,
    SectionSchema,
    { temperature: 0.3, think: true },
  );
  return section_md;
};

export const writePracticalSection = async (
  topic: string,
  months: number,
  findings: Finding[],
) => {
  const { section_md } = await callClaudeJson(
    `Write the "What this means at ${formatAge(months)}" section of a parent research brief on "${topic}" — concrete things the parent can do this week, each grounded in the findings below with its [n] marker(s) copied exactly. 3-5 short bullets. If the findings don't support age-specific advice, say so plainly instead of inventing it. End with one sentence: check with the pediatrician on anything symptom- or safety-critical.

FINDINGS:
${findingsBlock(findings)}

Return STRICT JSON: { "section_md": string (markdown, no heading) }`,
    SectionSchema,
    { temperature: 0.3 },
  );
  return section_md;
};

export const writeCaveatsAndBottomLine = async (topic: string, findings: Finding[]) => {
  const { section_md } = await callClaudeJson(
    `Finish a parent research brief on "${topic}" with two parts, using ONLY the findings below (keep [n] markers):

## Disagreements & open questions
Where findings conflict, or where evidence is only "weak"/"moderate", say so candidly. If the evidence is consistent, say that in one sentence.

## Bottom line
3-5 plain-language takeaway bullets.

FINDINGS:
${findingsBlock(findings)}

Return STRICT JSON: { "section_md": string (markdown INCLUDING those two ## headings) }`,
    SectionSchema,
    { temperature: 0.3, think: true },
  );
  return section_md;
};

// --- step 4: code-side citation validation + assembly ----------------------------

/** Strip out-of-range [n] markers; report what was stripped. */
export const validateCitations = (
  md: string,
  maxIndex: number,
): { md: string; stripped: number[] } => {
  const stripped: number[] = [];
  const cleaned = md.replace(/\[(\d{1,3})\]/g, (whole, num: string) => {
    const n = Number(num);
    if (n >= 1 && n <= maxIndex) return whole;
    stripped.push(n);
    return "";
  });
  return { md: cleaned, stripped };
};

export const assembleResearchBrief = (parts: {
  months: number;
  evidence: string;
  practical: string;
  caveatsAndBottomLine: string;
  maxIndex: number;
}): { md: string; strippedMarkers: number[] } => {
  const raw = [
    `## What the evidence says\n\n${parts.evidence}`,
    `## What this means at ${formatAge(parts.months)}\n\n${parts.practical}`,
    parts.caveatsAndBottomLine,
    `*Research synthesis, not medical advice.*`,
  ].join("\n\n");
  const { md, stripped } = validateCitations(raw, parts.maxIndex);
  return { md, strippedMarkers: stripped };
};
