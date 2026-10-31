/**
 * The persona's voice — hand-written lines, no model calls in PR-C.
 *
 * Two system voices (docs/atlas.md "Persona"): the obsessive cartographer, a
 * fussy archivist whose map your finds fill, and the protégé, a naive
 * apprentice whose skill tree is what you've taught it. Humor points at the
 * material and the persona's own obsessions, never at the learner, and
 * everything is family-friendly — the child may see the screen.
 *
 * Lines are picked with a caller-supplied seed so tests are deterministic
 * and the same page render keeps the same line. PR-D replaces none of this:
 * it adds the nightly model pass on top (loot framing, expeditions, gifts).
 */
import type { AtlasPersona } from "../../db/schema";

export type PersonaMoment = "map_greeting" | "quiz_pass" | "quiz_fail" | "creation";

export type PersonaContext = {
  /** Player's display name. */
  name?: string;
  /** The node the moment is about (quiz pass/fail). */
  nodeTitle?: string;
  /** Map-level counts for the greeting. */
  mapTitle?: string;
  unexploredCount?: number;
  masteredCount?: number;
};

type LineFn = (ctx: PersonaContext) => string;

const CARTOGRAPHER: Record<PersonaMoment, LineFn[]> = {
  creation: [
    (c) =>
      `At last — a field assistant. I am decades behind on the filing, ${c.name ?? "colleague"}; do try to keep your margins legible.`,
    (c) =>
      `Welcome, ${c.name ?? "colleague"}. The map is embarrassingly incomplete. That is now partly your problem.`,
  ],
  map_greeting: [
    (c) =>
      c.unexploredCount && c.unexploredCount > 0
        ? `${c.unexploredCount} entries still sit in my files marked "unconfirmed rumor". Pick one; I'll sharpen a pencil.`
        : `Every region charted. I keep re-checking the margins and finding nothing to complain about. Unsettling.`,
    (c) =>
      c.masteredCount && c.masteredCount > 0
        ? `${c.masteredCount} entries properly verified and stamped. The rest are hearsay until you get there.`
        : `Nothing verified yet. A map of rumors is not a map; it is gossip with coordinates.`,
    (c) => `The ${c.mapTitle ?? "field"} shelf again. Good. The dust in the unexplored regions bothers me professionally.`,
  ],
  quiz_pass: [
    (c) => `Verified. "${c.nodeTitle ?? "This entry"}" gets the good ink and a proper stamp. A fine day for the archive.`,
    (c) => `All three confirmed — I'm filing "${c.nodeTitle ?? "this"}" under *actually understood*, a tragically thin folder.`,
    () => `A clean verification! I shall allow myself one (1) celebratory re-shelving.`,
  ],
  quiz_fail: [
    (c) => `Hmm — the record disagrees. Back to the page; "${c.nodeTitle ?? "this entry"}" stays penciled in for now.`,
    () => `Not yet confirmed. No matter: half my files took three expeditions. Read it once more and try again.`,
  ],
};

const PROTEGE: Record<PersonaMoment, LineFn[]> = {
  creation: [
    (c) => `Hello ${c.name ?? "teacher"}! I know zero things. This seems fixable.`,
    (c) => `You'll teach me everything, ${c.name ?? "teacher"}? I promise to only mostly misunderstand it at first.`,
  ],
  map_greeting: [
    (c) =>
      c.unexploredCount && c.unexploredCount > 0
        ? `There are ${c.unexploredCount} things here you haven't taught me yet. I tried guessing one. It went badly.`
        : `You taught me the whole map?! I am insufferable at parties now.`,
    (c) =>
      c.masteredCount && c.masteredCount > 0
        ? `I can properly explain ${c.masteredCount} of these now. The others I explain confidently and wrongly.`
        : `So far I know nothing from this map. Teach me one thing and I'll repeat it to everyone, forever.`,
    (c) => `Back to ${c.mapTitle ?? "the map"}! I reread my notes. Some of them are just drawings of you pointing.`,
  ],
  quiz_pass: [
    (c) => `Wait — I got it right because YOU got it right. "${c.nodeTitle ?? "That one"}" is ours now.`,
    (c) => `Three for three! I immediately tried to use "${c.nodeTitle ?? "it"}" to explain breakfast. It… sort of worked?`,
    () => `New stamp! I'm going to think about this one in the bath, like a proper philosopher.`,
  ],
  quiz_fail: [
    (c) => `Hmm, I repeated what I thought you taught me and it came out sideways. Read "${c.nodeTitle ?? "the page"}" to me again?`,
    () => `Not quite — but my wrong answer was very confident, which I'm told is half of philosophy.`,
  ],
};

const VOICES: Record<AtlasPersona, Record<PersonaMoment, LineFn[]>> = {
  cartographer: CARTOGRAPHER,
  protege: PROTEGE,
};

/** Tiny deterministic hash so a given seed always picks the same line. */
const hashSeed = (seed: string): number => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const personaLine = (
  persona: AtlasPersona,
  moment: PersonaMoment,
  ctx: PersonaContext = {},
  seed = "",
): string => {
  const lines = VOICES[persona][moment];
  return lines[hashSeed(`${persona}:${moment}:${seed}`) % lines.length](ctx);
};

export const PERSONA_LABELS: Record<AtlasPersona, { title: string; pitch: string }> = {
  cartographer: {
    title: "The obsessive cartographer",
    pitch:
      "A fussy archivist who has charted this field forever and cannot finish alone. Your finds fill its map; it grumbles at the unexplored regions.",
  },
  protege: {
    title: "The protégé",
    pitch:
      "A naive apprentice you are teaching. Its skill tree is what you've taught it; it misapplies concepts in funny ways and gets things right only when you did.",
  },
};
