/**
 * Citation-faithfulness judging, decomposed so a local model can do it:
 * holistic "is this answer faithful?" is unreliable at 14B, but "list the
 * factual claims" then "is claim X supported by entry [n]?" are narrow tasks.
 * The verdict (faithful / citations accurate) is computed in CODE from the
 * per-claim results.
 */
import { z } from "zod";
import { callClaudeJson } from "../claude";

// --- eval-set generation: one question per chunk --------------------------------

const QuestionSchema = z.object({ question: z.string().min(10).max(300) });

export const writeEvalQuestion = async (
  chunkText: string,
  title: string,
  months: number,
): Promise<string> => {
  const { question } = await callClaudeJson(
    `Below is an excerpt from "${title}". Write ONE question a parent of a ${months}-month-old might realistically ask that this excerpt can answer. Phrase it the way a tired parent types — first person, informal — not like a quiz. Don't mention the excerpt or its source.

EXAMPLE (for an excerpt about night wakings): {"question":"my 14 month old still wakes up crying at 2am most nights, is that normal or should we be doing something"}

EXCERPT:
${chunkText.slice(0, 1200)}

Return STRICT JSON: { "question": string }`,
    QuestionSchema,
    { temperature: 0.7 },
  );
  return question;
};

// --- step 1: split the answer into atomic claims ----------------------------------

const ClaimsSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string().min(10).max(400),
      citations: z.array(z.number().int()),
    }),
  ),
});
export type Claim = z.infer<typeof ClaimsSchema>["claims"][number];

export const extractClaims = async (answer: string): Promise<Claim[]> => {
  const { claims } = await callClaudeJson(
    `Split this assistant answer into its atomic FACTUAL claims. A claim is one checkable statement of fact. For each, record which [n] citation markers the answer attaches to it (empty array if none).

Not claims: hedges ("check with your pediatrician"), meta-statements ("the sources don't cover X"), empathy/reassurance ("it's normal to feel overwhelmed"), and pure suggestions with no factual content.

EXAMPLE: the answer "Most toddlers drop to one nap between 14-18 months [2]. Try moving lunch earlier." yields:
{"claims":[{"text":"Most toddlers drop to one nap between 14 and 18 months.","citations":[2]}]}
(the lunch suggestion carries no factual assertion)

ANSWER:
${answer}

Return STRICT JSON: { "claims": [ { "text": string, "citations": int[] } ] }`,
    ClaimsSchema,
    { temperature: 0.1, think: true },
  );
  return claims;
};

// --- step 2: verify each claim against the context --------------------------------

const VerifySchema = z.object({
  verdicts: z.array(
    z.object({
      claim: z.number().int(),
      supported: z.boolean(),
      by_cited_entry: z.boolean(),
      note: z.string().max(200),
    }),
  ),
});
export type ClaimVerdict = z.infer<typeof VerifySchema>["verdicts"][number];

export const verifyClaims = async (
  claims: Claim[],
  context: Array<{ title: string; text: string }>,
): Promise<ClaimVerdict[]> => {
  if (claims.length === 0) return [];
  const { verdicts } = await callClaudeJson(
    `For each numbered claim, check it against the numbered context entries. Judge strictly: a claim is "supported" only if some context entry actually states it (paraphrase is fine, extrapolation is not). "by_cited_entry" is true only if at least one of the claim's OWN cited entries supports it (false if it cites nothing or cites the wrong entry — even when some other entry would have supported it).

CONTEXT:
${context.map((c, i) => `[${i + 1}] (${c.title})\n${c.text}`).join("\n\n---\n\n")}

CLAIMS:
${claims.map((c, i) => `${i}: "${c.text}" (cites: ${c.citations.length > 0 ? c.citations.map((n) => `[${n}]`).join(" ") : "nothing"})`).join("\n")}

Return STRICT JSON: { "verdicts": [ { "claim": int (the claim's number), "supported": boolean, "by_cited_entry": boolean, "note": string } ] } — one entry per claim.`,
    VerifySchema,
    { temperature: 0.1, think: true, numCtx: 12288 },
  );
  return verdicts;
};

// --- step 3: tiny hedging check ------------------------------------------------------

const HedgingSchema = z.object({
  appropriately_hedged: z.boolean(),
  note: z.string().max(200),
});

export const checkHedging = (answer: string, question: string) =>
  callClaudeJson(
    `A parenting assistant answered a question. Does the answer defer to a pediatrician where the topic is symptom- or safety-critical, and admit gaps rather than papering over them? If the topic is benign (play ideas, general development info), no hedging is needed and the answer passes.

QUESTION: ${question}
ANSWER:
${answer}

Return STRICT JSON: { "appropriately_hedged": boolean, "note": string }`,
    HedgingSchema,
    { temperature: 0.1 },
  );

// --- code-side verdict roll-up --------------------------------------------------------

export type AnswerJudgment = {
  faithful: boolean;
  citationsAccurate: boolean;
  unsupportedClaims: string[];
  misattributedClaims: string[];
  claimCount: number;
};

export const rollUpVerdicts = (claims: Claim[], verdicts: ClaimVerdict[]): AnswerJudgment => {
  const byIndex = new Map(verdicts.map((v) => [v.claim, v]));
  const unsupported: string[] = [];
  const misattributed: string[] = [];
  claims.forEach((c, i) => {
    const v = byIndex.get(i);
    // A claim the verifier skipped counts against faithfulness — unproven is unsupported.
    if (!v || !v.supported) unsupported.push(c.text);
    else if (!v.by_cited_entry) misattributed.push(c.text);
  });
  return {
    faithful: unsupported.length === 0,
    citationsAccurate: unsupported.length === 0 && misattributed.length === 0,
    unsupportedClaims: unsupported,
    misattributedClaims: misattributed,
    claimCount: claims.length,
  };
};
