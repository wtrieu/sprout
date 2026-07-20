/**
 * Story-arc skill: planning is split into (1) picking milestone themes,
 * (2) inventing a small through-line, (3) outlining ONE story per call with
 * the previous outlines as context. A 14B model plans a single 3-sentence
 * outline far more reliably than a whole coherent series in one shot.
 */
import { z } from "zod";
import { callClaudeJson } from "../claude";
import { formatAge } from "../age";

// --- step 1: pick which frontier skills the arc will model ------------------

const ArcThemesSchema = z.object({
  themes: z.array(
    z.object({
      skill: z.string().min(5).max(150),
      domain: z.string().min(2).max(30),
    }),
  ),
});

export const selectArcThemes = async (
  milestoneRows: Array<{ domain: string; description: string }>,
  count: number,
  months: number,
  focus: string | undefined,
): Promise<Array<{ skill: string; domain: string }>> => {
  const { themes } = await callClaudeJson(
    `Pick ${count} developmental themes for a bedtime-story series for a ${formatAge(months)}-old — one theme per story. Choose from the checklist below: prefer skills the child is practicing right now, story-friendly ones (social/language/self-help beat "stacks two blocks"), and variety across domains.${focus ? `\nThe parent asked the series to also touch on: "${focus}" — make it one of the themes.` : ""}

CHECKLIST:
${milestoneRows.map((m) => `- (${m.domain}) ${m.description}`).join("\n")}

Return STRICT JSON: { "themes": [ { "skill": string (the skill in a few plain words, e.g. "taking turns", "naming feelings"), "domain": string } ] }
Exactly ${count} themes.`,
    ArcThemesSchema.refine((t) => t.themes.length === count, {
      message: `must contain exactly ${count} themes`,
    }),
    { temperature: 0.6 },
  );
  return themes;
};

// --- step 2: the through-line that makes it feel like a series ---------------

const ThroughlineSchema = z.object({
  arc_title: z.string().min(3).max(120),
  setting: z.string().min(10).max(300),
  connector: z.string().min(10).max(300),
});
export type Throughline = z.infer<typeof ThroughlineSchema>;

export const planThroughline = async (input: {
  characterName: string;
  characterDesc: string;
  months: number;
  themes: Array<{ skill: string }>;
  focus?: string;
}): Promise<Throughline> =>
  callClaudeJson(
    `Invent the through-line for a ${input.themes.length}-story bedtime series starring ${input.characterName} (${input.characterDesc}), for a ${formatAge(input.months)}-old.

The stories will each gently model one of: ${input.themes.map((t) => t.skill).join("; ")}.${input.focus ? ` The parent's focus: "${input.focus}".` : ""}

A through-line is ONE cozy recurring element that links the stories — a place, a friend, or a small object. Keep it toddler-simple and calm.

EXAMPLE (different character): {"arc_title":"Momo and the Garden Gate","setting":"the little garden behind Momo's house, reached through a squeaky blue gate","connector":"each evening the gate squeaks hello, and something small in the garden needs Momo's help before the sun goes down"}

Return STRICT JSON: { "arc_title": string, "setting": string, "connector": string (the recurring beat that opens each story) }`,
    ThroughlineSchema,
    { temperature: 0.8 },
  );

// --- step 3: outline ONE story at a time --------------------------------------

const OutlineSchema = z.object({
  title: z.string().min(3).max(120),
  outline: z.string().min(60).max(600),
});

export const outlineStory = async (input: {
  characterName: string;
  months: number;
  throughline: Throughline;
  theme: { skill: string };
  storyNumber: number; // 1-based
  storyCount: number;
  previousOutlines: Array<{ title: string; outline: string }>;
}): Promise<z.infer<typeof OutlineSchema>> =>
  callClaudeJson(
    `Outline story ${input.storyNumber} of ${input.storyCount} in the bedtime series "${input.throughline.arc_title}" for a ${formatAge(input.months)}-old.

Setting: ${input.throughline.setting}
Recurring beat: ${input.throughline.connector}
This story gently models: ${input.theme.skill}

${
  input.previousOutlines.length > 0
    ? `EARLIER STORIES (do not repeat their events; a light callback is nice):\n${input.previousOutlines
        .map((p, i) => `${i + 1}. "${p.title}" — ${p.outline}`)
        .join("\n")}\n`
    : ""
}Rules:
- "Gently models" = ${input.characterName} experiences the skill warmly and low-stakes; never a lesson, never a moral spelled out.
- 3-4 sentences: the small situation, what ${input.characterName} does, how it winds down calm and sleepy.
- No peril, nothing scary, nothing sad. It must end restful — this is the last thing the child hears before sleep.
${input.storyNumber === input.storyCount ? "- This is the finale: close the series softly (the connector gets a goodnight too)." : ""}

EXAMPLE outline (different series, theme "trying new foods"): "At the garden gate, Momo finds Rabbit with a basket of berries Momo has never seen. Momo watches Rabbit try one, sniffs one, then takes the tiniest nibble — sweet! They share the basket as the fireflies come out, and Momo yawns a berry-sweet yawn all the way to bed."
(Shape and warmth only — don't reuse the example's characters, objects, or wording.)

Return STRICT JSON: { "title": string, "outline": string }`,
    OutlineSchema,
    { temperature: 0.8 },
  );

/** Compose the prompt stored on the story row for the story_text executor. */
export const buildArcStoryPrompt = (input: {
  outline: string;
  arcTitle: string;
  storyNumber: number;
  skill: string;
}): string =>
  `${input.outline} (Part ${input.storyNumber} of the "${input.arcTitle}" series; gently models: ${input.skill}.)`;
