/**
 * Story craft standards. What separates real children's books from generic
 * generated prose is STRUCTURE — refrains, meter, the rule of three, page-turn
 * pulls, deceleration into sleep. Four authored text forms (spec + exemplar),
 * age-banded word budgets, and mechanical craft checks enforced in code. The
 * writer is the nightly headless Claude run (scripts/nightly-story-candidates.ts);
 * these specs are the contract its drafts are validated against.
 */
import { desc } from "drizzle-orm";
import type { DB } from "../../db/client";
import { stories } from "../../db/schema";

// --- age bands: what "written for a toddler" means at each stage --------------

export type AgeBand = { maxWordsPerPage: number; language: string };

export const ageBand = (months: number): AgeBand => {
  if (months < 18)
    return {
      maxWordsPerPage: 22,
      language:
        "Written for a 1-year-old: naming, sounds, and rhythm matter more than plot. 1-2 very short sentences per page. Concrete nouns the child can point to. Lots of sound words.",
    };
  if (months < 30)
    return {
      maxWordsPerPage: 32,
      language:
        "Written for a young toddler: a thin thread of story, told in short rhythmic sentences. Repetition is a feature. One or two 'stretch words' across the whole book (a delicious new word like 'glimmer' or 'burrow'), used where context makes the meaning obvious.",
    };
  return {
    maxWordsPerPage: 45,
    language:
      "Written for a preschooler: a real little story with a gentle arc, still read aloud — keep the music in the sentences. Up to three sentences per page.",
  };
};

// --- the four forms ------------------------------------------------------------

export type StoryForm = {
  name: string;
  /** What the writer must do — the craft spec. */
  spec: string;
  /** Authored exemplar pages (different character/world; shape only). */
  exemplar: string;
};

export const storyForms: Record<string, StoryForm> = {
  "rhythmic-prose": {
    name: "Rhythmic prose",
    spec: `No rhyme. The music comes from cadence and sound:
- Strong read-aloud rhythm — short beats, deliberate repetition of sentence shapes.
- Sound play on most pages: onomatopoeia ("pit-pat, pit-pat"), soft alliteration.
- Use the rule of three: three tries, three friends, or three sounds before the turn.
- End most pages with a small forward pull (a question, a sound approaching, "and then…") — except the last two pages, which slow down and settle.`,
    exemplar: `EXAMPLE pages from a different book (duckling named Pip, theme: listening to rain):
- "Pit-pat. Pit-pat. The rain tapped on the big green leaf. Pip peeked out. What was that sound?"
- "Pit-pat, PIT-PAT! The rain danced faster. Pip's little feet danced too."
- "Then the rain slowed. Pit… pat. Pit… pat. Pip yawned a wide, wobbly yawn."
- "The leaf dripped its last drip. Pip tucked her beak under her wing. Goodnight, rain. Goodnight, Pip."`,
  },
  refrain: {
    name: "Refrain",
    spec: `Built on a REFRAIN — one short chorus line that appears on EVERY page with exactly one slot changed each time. This is the form toddlers join in with.
- Design one refrain of 4-10 words with a [slot].
- Every page: 1-2 scene sentences, then the refrain with a new slot value.
- Slot values follow a sequence the child can feel (bigger and bigger, one per friend, around the house).
- On the final page the refrain turns sleepy — same words, but soft, aimed at bed.`,
    exemplar: `EXAMPLE from a different book (duckling named Pip, refrain "Splash, splash, who's in the puddle?", theme: greeting friends):
- "Pip found a puddle, round as the moon. Splash, splash — who's in the puddle? A FROG is in the puddle!"
- "The frog wiggled in. Splash, splash — who's in the puddle? A SNAIL is in the puddle!"
- (final page) "The puddle went still and shiny. Splash… splash… who's in the puddle? Just the stars. Time for bed, Pip."`,
  },
  cumulative: {
    name: "Cumulative",
    spec: `A CUMULATIVE list: each page adds ONE new item and repeats the whole list so far, newest first. The repetition IS the story.
- Page 1 introduces the place and the first item.
- Each next page: one short scene sentence, then the growing list in a fixed sentence frame.
- 4-5 items maximum, then the last pages settle everything down (the list appears once more, slow and complete, as everyone sleeps).`,
    exemplar: `EXAMPLE frame from a different book (duckling named Pip building a nest):
- "Pip found a leaf. In Pip's little nest there was… a leaf."
- "A feather floated down. In Pip's little nest there was a feather, and a leaf."
- "Moss! Springy moss. In Pip's little nest there was moss, a feather, and a leaf."
- (final) "And in Pip's little nest there was moss, and a feather, and a leaf… and one sleepy duckling. Shhh."`,
  },
  "lullaby-rhyme": {
    name: "Lullaby rhyme",
    spec: `Soft rhyming couplets (AABB), sung more than told.
- Two short lines per page. BOTH line-endings of every couplet MUST come from the same rhyme pair in the RHYME BANK below — do not invent your own rhymes.
- Build each line naturally toward its ending word: normal word order, no filler words to pad the meter. If a couplet fights you, pick a different pair from the bank.
- Keep meter steady — roughly the same beat count per line, like a rocking chair.
- Quiet vocabulary throughout; the whole book is a wind-down.

RHYME BANK (true rhymes, safe for bedtime — use one pair per couplet, each pair at most once):
night/light · deep/sleep · moon/soon · star/are · sky/by · head/bed · tight/goodnight · day/away · small/all · near/here · gleam/dream · keep/sleep · light/tight · slow/low · rest/nest · dark/park · hum/come · stay/play`,
    exemplar: `EXAMPLE couplets from a different book (a lullaby for a duckling) — see how each line walks plainly toward its bank ending:
- "The pond is still, the reeds are deep, / the little fish have gone to sleep." (deep/sleep)
- "A silver moon, a silver light, / the water whispers soft goodnight." (light/goodnight)`,
  },
  "goodnight-catalog": {
    name: "Goodnight catalog",
    spec: `The Goodnight Moon shape: first SURVEY the room/place, then say goodnight to everything in it, one by one.
- Pages 1-3: name what is in the scene, plainly and warmly ("There is a…", "And a…"). Concrete, pictureable things the child could point to.
- Remaining pages: "Goodnight, [thing]" beats — 2-3 goodnights per page, revisiting the SAME things in the same order they were introduced. No new objects after the survey.
- Include one slightly odd or funny item in the catalog (a mush, a mitten, an old boot) — it's the page kids giggle at.
- The final goodnights leave the scene itself: goodnight sounds, goodnight air, goodnight [character]. Whispered, tiny, done.`,
    exemplar: `EXAMPLE pages from a different book (duckling named Pip in a boathouse):
- "In the little boathouse there was a rope. And a bell. And a bucket full of shells."
- "There was a crooked oar. And a striped wool sock, drying on the door."
- "Goodnight, rope. Goodnight, bell. Goodnight, bucket full of shells."
- "Goodnight, water. Goodnight, air. Goodnight, sounds everywhere. Goodnight, Pip."`,
  },
  "question-answer": {
    name: "Question & answer",
    spec: `The Brown Bear shape: a repeating question asked to one character, whose answer introduces the NEXT character — a friendly chain.
- Design ONE question frame of 5-10 words ("[Name], [Name], what do you see/hear…?") and repeat it exactly, only the name changing.
- Each page: the question to the current friend, then their answer pointing to the next friend ("I see a … looking at me").
- 4-6 friends in the chain, each simple and drawable alone.
- The last friend's answer points back to bed: they see the main character yawning / the moon rising, and everyone settles. The final page answers the question with sleep.`,
    exemplar: `EXAMPLE frame from a different book (duckling named Pip at the pond):
- "Pip, Pip, what do you hear? I hear a frog singing near."
- "Frog, Frog, what do you hear? I hear a cricket ticking clear."
- (final) "Moon, Moon, what do you see? I see one sleepy duckling… fast asleep by the reeds."`,
  },
  "journey-home": {
    name: "Journey home",
    spec: `The out-and-back expedition (Bear Hunt's engine, tuned for bedtime): a little journey through 3 terrains, each with its own repeated MOVEMENT SOUND, then home the same way, faster and softer.
- One travel frame repeated per terrain: "Over/through/across the [terrain] — [sound, sound, sound]."
- Each terrain gets one page out: the frame plus one small wonder noticed there.
- The turn: something gentle signals bedtime (first star, a yawn, the wind going quiet) — NOT a scare. Nothing chases anyone.
- Coming home: the same terrains in reverse in 1-2 pages, sounds softening ("swish… swish…").
- Last page: home, warm, tucked in — the journey's sounds become a lullaby.`,
    exemplar: `EXAMPLE pages from a different book (duckling named Pip):
- "Over the pebbly bank — clickety, clickety, clickety. Pip found a snail with a swirly shell."
- "Through the tall reeds — swish, swish, swish. Pip found a feather, soft as a cloud."
- "Then the first star blinked on. Time to go home, Pip."
- "Back through the reeds — swish… swish… Back over the pebbles — click… click…"
- "Home in the warm nest. Clickety, swish, hush. Goodnight, Pip."`,
  },
};

export const formKeys = Object.keys(storyForms);

/**
 * Variety memory: prefer a form the recent stories haven't used. All four
 * forms are eligible — the writer is always a frontier Claude model now (the
 * lullaby-rhyme gate existed for qwen3, which can't hear phonetics).
 */
export const pickStoryForm = (db: DB, exclude: string[] = []): string => {
  const pool0 = formKeys.filter((f) => !exclude.includes(f));
  const eligible = pool0.length > 0 ? pool0 : formKeys;
  const recent = db
    .select({ form: stories.form })
    .from(stories)
    .orderBy(desc(stories.id))
    .limit(4)
    .all()
    .map((r) => r.form)
    .filter((f): f is string => !!f);
  const unused = eligible.filter((f) => !recent.includes(f));
  const pool = unused.length > 0 ? unused : eligible;
  return pool[Math.floor(Math.random() * pool.length)];
};

// --- mechanical craft checks -----------------------------------------------------

const wordCount = (s: string): number => s.split(/\s+/).filter(Boolean).length;

// Keep in sync with the RHYME BANK in the lullaby-rhyme spec.
const RHYME_PAIRS = [
  ["night", "light"], ["deep", "sleep"], ["moon", "soon"], ["star", "are"],
  ["sky", "by"], ["head", "bed"], ["tight", "goodnight"], ["day", "away"],
  ["small", "all"], ["near", "here"], ["gleam", "dream"], ["keep", "sleep"],
  ["light", "tight"], ["slow", "low"], ["rest", "nest"], ["dark", "park"],
  ["hum", "come"], ["stay", "play"],
];

const lastWord = (line: string): string =>
  (line.trim().split(/\s+/).pop() ?? "").toLowerCase().replace(/[^a-z]/g, "");

const isBankPair = (a: string, b: string): boolean =>
  RHYME_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

/** Code-side craft checks — the ones a machine can verify. */
export const validatePages = (
  result: { pages: { text: string }[] },
  formKey: string,
  band: AgeBand,
): string[] => {
  const problems: string[] = [];
  result.pages.forEach((p, i) => {
    const w = wordCount(p.text);
    if (w > band.maxWordsPerPage + 8) {
      problems.push(`page ${i + 1} is ${w} words — the limit for this age is ${band.maxWordsPerPage}`);
    }
  });
  if (formKey === "lullaby-rhyme") {
    result.pages.forEach((p, i) => {
      const lines = p.text.split(/\s*\/\s*|\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        problems.push(`page ${i + 1} must be a two-line couplet separated by " / "`);
        return;
      }
      const [a, b] = [lastWord(lines[0]), lastWord(lines[1])];
      if (!isBankPair(a, b)) {
        problems.push(
          `page ${i + 1} couplet ends "${a}/${b}" — both endings must be one pair from the RHYME BANK`,
        );
      }
    });
  }
  if (formKey === "refrain" && result.pages.length >= 4) {
    // The refrain must actually recur: some 4+ word phrase shared by most pages.
    const first = result.pages[0].text.toLowerCase();
    const words = first.split(/\s+/).filter(Boolean);
    let recurring = false;
    for (let len = 6; len >= 4 && !recurring; len--) {
      for (let start = 0; start + len <= words.length && !recurring; start++) {
        const phrase = words.slice(start, start + len).join(" ").replace(/[^a-z\s']/g, "");
        if (phrase.split(" ").length < 4) continue;
        const hits = result.pages.filter((p) =>
          p.text.toLowerCase().replace(/[^a-z\s']/g, "").includes(phrase),
        ).length;
        if (hits >= result.pages.length - 2) recurring = true;
      }
    }
    if (!recurring) {
      problems.push(
        "this is a REFRAIN book but no repeated chorus phrase appears across the pages — every page must carry the refrain with one slot changed",
      );
    }
  }
  if (formKey === "goodnight-catalog") {
    const goodnightPages = result.pages.filter((p) => /good\s?night/i.test(p.text)).length;
    if (goodnightPages < Math.floor(result.pages.length / 2)) {
      problems.push(
        `this is a GOODNIGHT CATALOG book but only ${goodnightPages} pages say goodnight — after the opening survey, every page should say goodnight to things by name`,
      );
    }
  }
  if (formKey === "question-answer") {
    const questionPages = result.pages.filter((p) => p.text.includes("?")).length;
    if (questionPages < result.pages.length - 2) {
      problems.push(
        `this is a QUESTION & ANSWER book but only ${questionPages} pages ask the question — the repeated question frame must appear on nearly every page`,
      );
    }
  }
  return problems;
};

