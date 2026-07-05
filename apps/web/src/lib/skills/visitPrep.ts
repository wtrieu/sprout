/**
 * Visit-prep skill: the brief is assembled in CODE from four small,
 * single-purpose model calls, so a local 14B model never has to hold a whole
 * coherent hedged document in its head. Each step has a tight schema and an
 * exemplar; the growth section and notes skeleton are fully deterministic.
 */
import { z } from "zod";
import { callClaudeJson } from "../claude";
import { formatAge } from "../age";

// --- step 1: recent chat questions + typed concerns → visit themes ---------

const ThemesSchema = z.object({
  themes: z
    .array(
      z.object({
        theme: z.string().min(3).max(80),
        evidence: z.string().min(3).max(200),
      }),
    )
    .max(6),
});
export type VisitTheme = z.infer<typeof ThemesSchema>["themes"][number];

export const summarizeConcernThemes = async (
  recentQuestions: string[],
  concerns: string | undefined,
  months: number,
): Promise<VisitTheme[]> => {
  if (recentQuestions.length === 0 && !concerns) return [];
  const { themes } = await callClaudeJson(
    `A parent of a ${formatAge(months)}-old is preparing for a pediatrician visit. Below are questions they researched recently, plus anything they typed in for this visit. Group them into at most 6 themes worth raising with the doctor.

Rules:
- A theme must be backed by the input — never invent a worry the parent didn't express.
- Repeated questions about the same thing = one theme, and note the repetition in "evidence".
- Skip themes that are clearly resolved or trivial (e.g. a one-off recipe question).

EXAMPLE (different family):
Input questions: "why does she wake at 4am every night", "early waking 10 month old", "when do babies drop to one nap"
Typed concerns: "eczema patch behind knees is back"
Output: {"themes":[{"theme":"Early-morning waking and nap transition","evidence":"Three separate questions about 4am waking and nap schedules — an ongoing sleep concern."},{"theme":"Recurring eczema behind the knees","evidence":"Parent flagged the patch has returned."}]}

RECENT QUESTIONS (newest first):
${recentQuestions.length > 0 ? recentQuestions.map((q) => `- ${q.slice(0, 200)}`).join("\n") : "(none)"}

TYPED CONCERNS FOR THIS VISIT:
${concerns ?? "(none)"}

Return STRICT JSON: { "themes": [ { "theme": string, "evidence": string } ] }`,
    ThemesSchema,
    { temperature: 0.2, think: true },
  );
  return themes;
};

// --- step 2: milestone checklist → talking points (selection, not writing) --

const TalkingPointsSchema = z.object({
  points: z
    .array(
      z.object({
        milestone_id: z.number().int(),
        angle: z.string().min(5).max(200),
      }),
    )
    .min(3)
    .max(6),
});

export type MilestoneRow = {
  id: number;
  domain: string;
  ageMonths: number;
  description: string;
};

export const pickTalkingPoints = async (
  milestoneRows: MilestoneRow[],
  months: number,
): Promise<Array<{ milestone: MilestoneRow; angle: string }>> => {
  const { points } = await callClaudeJson(
    `From the CDC milestone checklist below, pick 4-6 items most worth discussing at a ${formatAge(months)}-old's checkup, and give each a short "angle" — how the parent should bring it up. These are "most children by this age" markers, never pass/fail tests, so every angle is framed as observing or discussing, not as a deficit.

Pick a mix of domains. Prefer items at the frontier (the child's current or next age bucket) over ones long mastered.

EXAMPLE angles (for a different age):
- "Mention how many words she uses at home — the checklist marker is ~10, and the doctor will want the home count, not the shy-in-clinic count."
- "Ask what stacking/nesting play to encourage next now that she stacks two blocks."

CHECKLIST (id: [age, domain] description):
${milestoneRows.map((m) => `${m.id}: [${m.ageMonths}mo, ${m.domain}] ${m.description}`).join("\n")}

Return STRICT JSON: { "points": [ { "milestone_id": int (an id from the list), "angle": string } ] }`,
    TalkingPointsSchema,
    { temperature: 0.3 },
  );
  const byId = new Map(milestoneRows.map((m) => [m.id, m]));
  return points
    .filter((p) => byId.has(p.milestone_id))
    .map((p) => ({ milestone: byId.get(p.milestone_id)!, angle: p.angle }));
};

// --- step 3: themes + growth + age → questions for the doctor ---------------

const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        q: z.string().min(10).max(250),
        why: z.string().min(3).max(150),
      }),
    )
    .min(5)
    .max(8),
});
export type DoctorQuestion = z.infer<typeof QuestionsSchema>["questions"][number];

export const draftDoctorQuestions = async (input: {
  months: number;
  themes: VisitTheme[];
  growthLines: string[];
  concerns?: string;
}): Promise<DoctorQuestion[]> => {
  const { questions } = await callClaudeJson(
    `Write 5-8 questions a parent should ask at their ${formatAge(input.months)}-old's pediatrician visit. Each must be concrete and answerable inside an appointment — no vague "is my child okay?" questions.

Draw from, in priority order:
1. The visit themes below (these are the parent's actual worries — cover every theme with at least one question).
2. The growth numbers below, if any stand out.
3. Age-typical topics for ${formatAge(input.months)}: sleep, feeding/nutrition, safety at this mobility stage, vaccines due around this age, what to expect before the next visit.

A BAD question is vague and unanswerable: "Is his sleep normal?"
EXAMPLE output shape (shortened to two questions — you write 5-8):
{"questions":[{"q":"He still wakes once most nights around 2am — at this age, is it worth night-weaning or should we wait it out?","why":"Recurring sleep theme from the parent's questions."},{"q":"Which vaccines are due today, and what reactions should we watch for tonight?","why":"Age-typical topic."}]}
The example shows shape and concreteness only — NEVER copy its wording, and never state details (times, frequencies, symptoms) that the themes below don't actually say.

VISIT THEMES:
${input.themes.length > 0 ? input.themes.map((t) => `- ${t.theme} (${t.evidence})`).join("\n") : "(none captured)"}

GROWTH:
${input.growthLines.length > 0 ? input.growthLines.join("\n") : "(no measurements this time)"}

Return STRICT JSON: { "questions": [ { "q": string, "why": string (which theme/topic it comes from) } ] }`,
    QuestionsSchema,
    { temperature: 0.4, think: true },
  );
  return questions;
};

// --- step 4: one short snapshot paragraph -----------------------------------

const SnapshotSchema = z.object({ snapshot: z.string().min(40).max(600) });

export const writeSnapshot = async (input: {
  name: string;
  months: number;
  growthSummary: string | null;
  themeCount: number;
}): Promise<string> => {
  const { snapshot } = await callClaudeJson(
    `Write ONE short warm paragraph (2-3 sentences) opening a pediatrician visit-prep brief for ${input.name}, ${formatAge(input.months)} old.

Mention: the age, ${input.growthSummary ? `the growth picture in plain words (${input.growthSummary})` : "that no new measurements were taken for this visit"}, and that the brief collects ${input.themeCount > 0 ? "a few things the family wants to discuss" : "routine talking points for this age"}. Plain language, no percentile jargon in this paragraph, no diagnoses, no alarm.

Return STRICT JSON: { "snapshot": string }`,
    SnapshotSchema,
    { temperature: 0.4 },
  );
  return snapshot;
};

// --- deterministic assembly ---------------------------------------------------

export const assembleVisitBrief = (parts: {
  snapshot: string;
  growthLines: string[];
  talkingPoints: Array<{ milestone: MilestoneRow; angle: string }>;
  questions: DoctorQuestion[];
}): string => {
  const sections: string[] = [`## Snapshot\n\n${parts.snapshot}`];

  if (parts.growthLines.length > 0) {
    sections.push(
      `## Growth\n\n${parts.growthLines.map((l) => `- ${l}`).join("\n")}\n\nA single measurement is a snapshot — trends across visits matter more. Worth confirming these against the clinic's own scale.`,
    );
  }

  if (parts.talkingPoints.length > 0) {
    sections.push(
      `## Development check-in\n\nThings to mention or observe together (checklist markers are "most children by this age", not tests):\n\n${parts.talkingPoints
        .map((p) => `- **${p.milestone.description}** (${p.milestone.domain}, ${p.milestone.ageMonths}mo marker) — ${p.angle}`)
        .join("\n")}`,
    );
  }

  sections.push(
    `## Questions to ask\n\n${parts.questions.map((q, i) => `${i + 1}. ${q.q}\n   *(${q.why})*`).join("\n")}`,
  );

  sections.push(
    `## Notes space\n\n- Weight / length / HC at clinic: \n- Vaccines given today: \n- Answers & advice: \n- Follow up before next visit: `,
  );

  return sections.join("\n\n");
};
