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
 * Map greetings can also carry model-written lines about the map's field
 * (`topicLines`, drafted once per map by lib/atlas/greetings.ts).
 */
import type { AtlasPersona } from "../../db/schema";

export type PersonaMoment =
  | "map_greeting"
  | "quiz_pass"
  | "quiz_fail"
  | "creation"
  | "loot_reveal"
  | "class_offer";

export type PersonaContext = {
  /** Player's display name. */
  name?: string;
  /** The node the moment is about (quiz pass/fail). */
  nodeTitle?: string;
  /** The achievement being revealed (loot_reveal). */
  achievementTitle?: string;
  /** The gate level an offer arrived at (class_offer). */
  gateLevel?: number;
  /** Map-level counts for the greeting. */
  mapTitle?: string;
  unexploredCount?: number;
  masteredCount?: number;
  /** The map node this player touched most recently (greeting). */
  lastNodeTitle?: string;
  /** The map node this player most recently passed a quiz on (greeting). */
  masteredNodeTitle?: string;
  /** An unopened node on the edge of what they've explored (greeting). */
  nextNodeTitle?: string;
  /**
   * Model-written greetings about this map's field, in this persona's voice
   * (lib/atlas/greetings). When present they take half the days.
   */
  topicLines?: string[];
};

/**
 * A line, or null when it needs context the caller didn't have (a greeting
 * that names the last node on a map nobody has opened yet). Null lines drop
 * out of the pick, so every moment keeps at least one context-free line.
 */
type LineFn = (ctx: PersonaContext) => string | null;

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
    (c) => `The ${c.mapTitle ?? "field"} drawers rattle when you walk in. They know there is filing ahead.`,
    // Topic-specific: these name the map's own nodes, so no two maps share them.
    (c) =>
      c.nextNodeTitle
        ? `"${c.nextNodeTitle}" is still a blank on my ${c.mapTitle ?? "field"} sheet. I have drawn a small, sulking sea monster there in protest.`
        : null,
    (c) =>
      c.nextNodeTitle
        ? `Field report requested: "${c.nextNodeTitle}". My current entry reads, in full, "probably important?"`
        : null,
    (c) =>
      c.nextNodeTitle
        ? `I reserved a fresh page for "${c.nextNodeTitle}" some time ago. It is still blank. It is starting to look smug.`
        : null,
    (c) =>
      c.lastNodeTitle
        ? `I've inked over your notes on "${c.lastNodeTitle}". Tidy work; only two smudges, and both of them are mine.`
        : null,
    (c) =>
      c.lastNodeTitle
        ? `Still cross-referencing your findings from "${c.lastNodeTitle}". The index cards have begun to multiply.`
        : null,
    (c) =>
      c.lastNodeTitle && c.nextNodeTitle && c.lastNodeTitle !== c.nextNodeTitle
        ? `From "${c.lastNodeTitle}" the trail runs on to "${c.nextNodeTitle}". I have marked the path in pencil; you supply the ink.`
        : null,
    (c) =>
      c.masteredNodeTitle
        ? `"${c.masteredNodeTitle}" sits stamped and verified in the ${c.mapTitle ?? "field"} ledger. I check on it now and then. Still there. Lovely.`
        : null,
    (c) =>
      c.masteredNodeTitle
        ? `I've had "${c.masteredNodeTitle}" bound in leather. Excessive, perhaps. The archive has standards.`
        : null,
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
  loot_reveal: [
    (c) =>
      `A chest! "${c.achievementTitle ?? "Something"}" earned you a crate of my least-embarrassing supplies. Open it; I will pretend not to hover.`,
    () => `The archive has logged a commendation. Rare. I shall need a larger drawer.`,
    () => `Contents unverified, but promising. Do be careful with the ink.`,
  ],
  class_offer: [
    (c) =>
      `Level ${c.gateLevel ?? "?"} on the ledger. The guild wishes to file you under a proper title. Three drafts, one pen: choose.`,
    () => `A title, at last. I have drafted three; I am quietly partial to the first, but it is your name on the spine.`,
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
    (c) => `Ooh, ${c.mapTitle ?? "this map"}. I saved up a question about it for you. I forgot it. It'll come back.`,
    // Topic-specific: these name the map's own nodes, so no two maps share them.
    (c) =>
      c.nextNodeTitle
        ? `I've been staring at "${c.nextNodeTitle}" all week. My best guess is that it's a kind of sandwich. Please confirm or deny.`
        : null,
    (c) =>
      c.nextNodeTitle
        ? `Is "${c.nextNodeTitle}" next? I already made it a name tag. I spelled it three different ways.`
        : null,
    (c) =>
      c.nextNodeTitle
        ? `Can we do "${c.nextNodeTitle}" today? I tried learning it alone and accidentally reorganized my socks instead.`
        : null,
    (c) =>
      c.lastNodeTitle
        ? `I've been practicing "${c.lastNodeTitle}" since last time. Mostly on the cat. The cat remains unconvinced.`
        : null,
    (c) =>
      c.lastNodeTitle
        ? `I explained "${c.lastNodeTitle}" to a houseplant. It grew a tiny bit, so I think I got it mostly right.`
        : null,
    (c) =>
      c.lastNodeTitle && c.nextNodeTitle && c.lastNodeTitle !== c.nextNodeTitle
        ? `We stopped at "${c.lastNodeTitle}", and "${c.nextNodeTitle}" is right next door. I can see its porch light from here.`
        : null,
    (c) =>
      c.masteredNodeTitle
        ? `"${c.masteredNodeTitle}" is officially ours. I say it out loud sometimes just to feel clever.`
        : null,
    (c) =>
      c.masteredNodeTitle
        ? `Now that I know "${c.masteredNodeTitle}", I'm basically the world expert on ${c.mapTitle ?? "this"}. I'm told there is more of it. Rude.`
        : null,
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
  loot_reveal: [
    (c) =>
      `Look, look — "${c.achievementTitle ?? "something"}" came with a box! I did not shake it. I shook it a little.`,
    () => `A prize! I think I earned this by standing very close to you while you did the work.`,
    () => `Open it, open it! If it is socks I will still be thrilled.`,
  ],
  class_offer: [
    (c) =>
      `We hit level ${c.gateLevel ?? "?"}, and they want to give us a title! There are three. I like the first one's hat, probably.`,
    () => `Pick a class! Nothing locks and you can change it later, which is lucky because I would have picked wrong.`,
  ],
};

const VOICES: Record<AtlasPersona, Record<PersonaMoment, LineFn[]>> = {
  cartographer: CARTOGRAPHER,
  protege: PROTEGE,
};

/** Tiny deterministic hash so a given seed always picks the same line. */
export const hashSeed = (seed: string): number => {
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
  const h = hashSeed(`${persona}:${moment}:${seed}`);
  // Map greetings: on half the days, a line written for this field; on the
  // rest, a template line that knows the player's progress on it.
  const topic = moment === "map_greeting" ? (ctx.topicLines ?? []) : [];
  // The low bit picks the pool, so each pool indexes with the remaining bits
  // (h alone would only ever reach odd template lines on topic maps).
  if (topic.length > 0 && h % 2 === 0) return topic[Math.floor(h / 2) % topic.length];
  const lines = VOICES[persona][moment]
    .map((line) => line(ctx))
    .filter((line): line is string => line !== null);
  return lines[(topic.length > 0 ? Math.floor(h / 2) : h) % lines.length];
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
