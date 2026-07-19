export type ChapterCopy = {
  id: string;
  eyebrow?: string;
  heading: string;
  body: string;
  chips?: string[];
  align: "left" | "right" | "center";
  hint?: string;
};

/**
 * The seed-to-canopy story. One entry per scroll beat, in order.
 * Beat i sits at progress i / (COPY.length - 1).
 */
export const COPY: ChapterCopy[] = [
  {
    id: "hero",
    eyebrow: "❋ Sprout",
    heading: "Every big story starts this small.",
    body: "A self-hosted companion for the first years — stories, answers, and a memory of it all. Running quietly at home, where your family's life belongs.",
    align: "center",
    hint: "Scroll to begin",
  },
  {
    id: "roots",
    eyebrow: "Private by architecture",
    heading: "Rooted where you live.",
    body: "Sprout grows on your own machine. The stories, the questions, the small facts of a life just beginning — none of it leaves home. No cloud, no accounts, no one reading over your shoulder.",
    align: "left",
  },
  {
    id: "rain",
    eyebrow: "Ask anything, 3 a.m. included",
    heading: "Answers that hold water.",
    body: "Age-aware answers drawn from CDC, WHO, and PubMed — every claim cited, every source checkable. Not the loudest voice on the internet. The most careful one in your house.",
    align: "right",
  },
  {
    id: "sprout",
    eyebrow: "Growth & checkups",
    heading: "Watch them reach for the light.",
    body: "Percentiles plotted, milestones tracked, and a one-page brief before every pediatrician visit — the questions you meant to ask, already written down.",
    align: "left",
  },
  {
    id: "sapling",
    eyebrow: "Weekly activities",
    heading: "Play that grows on what you have.",
    body: "Fresh, age-right activity ideas every week — built only from the materials already in your cupboards. No shopping list. Just an afternoon.",
    align: "right",
  },
  {
    id: "bloom",
    eyebrow: "The journal",
    heading: "A tree that remembers every season.",
    body: "Quick notes, current loves, first words — Sprout keeps the small facts and weaves them back into everything: the stories, the activities, the advice. It grows more yours every day.",
    align: "left",
  },
  {
    id: "night",
    eyebrow: "Bedtime, illustrated",
    heading: "Stories that glow in the dark.",
    body: "A new bedtime story whenever you want one — starring their favorite characters, gently practicing the skill they're reaching for next. Illustrated at home in eight storybook styles, from classic watercolor to starry-night gouache.",
    chips: [
      "Classic watercolor",
      "Paper collage",
      "Crayon sketch",
      "Starry night gouache",
      "Storybook linocut",
      "Felt world",
      "Pencil & wash",
      "Retro flat",
    ],
    align: "center",
  },
  {
    id: "cta",
    heading: "Come grow with us.",
    body: "Your family's companion is already home.",
    align: "center",
  },
];

export const BEAT_COUNT = COPY.length; // 8
export const SEGMENTS = BEAT_COUNT - 1; // 7 scrollable segments
