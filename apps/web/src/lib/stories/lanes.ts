/**
 * Genre lanes: the commissioned-library replacement for the single hardcoded
 * bedtime template. Each lane is a contract the book call receives — what must
 * be true, how it should move, and what it is ALLOWED to do that the old
 * global prompt banned. The old bedtime rules (end asleep, deceleration,
 * join-in beat) live only inside the bedtime-winddown lane now.
 * Same registry pattern as storyForms (lib/skills/storyText.ts).
 */

export type StoryLane = {
  name: string;
  /** What must be true for a book in this lane. */
  contract: string;
  /** How the book should move. */
  pacing: string;
  /** Permissions the old template denied — spelled out so the writer uses them. */
  allowed: string;
  /** The funny lane refuses lessons outright. */
  lessonAllowed: boolean;
};

/**
 * The floor under every lane, regardless of genre: gentle-for-the-age is
 * global; sleepy is not.
 */
export const GLOBAL_FLOOR = `Nothing genuinely frightening, no real menace, no grief. Tension always lands in a warm resolution. Prose is written to be read aloud — rhythm and mouth-feel matter on every page.`;

// Keys are stored on stories.lane and premises.lane — keep stable.
export const storyLanes: Record<string, StoryLane> = {
  "bedtime-winddown": {
    name: "Bedtime wind-down",
    contract: `A going-to-sleep book. The story ends with the main character asleep and safe. One "join in" beat somewhere in the middle (a sound to make together or something to find in the picture), never on the last two pages. No peril anywhere.`,
    pacing: `The last two pages decelerate: shorter, softer, quieter. No exclamation marks there. The whole book slopes gently downhill toward sleep.`,
    allowed: `This is the one lane where sleepy IS the point — lean into hush, dimness, and slowness.`,
    lessonAllowed: true,
  },
  "myth-retelling": {
    name: "Myth retelling",
    contract: `A retelling of a real myth from a real tradition, gentled for this age but specific — name the tradition's true images and objects, never generic "long ago" mush. Keep the bones of the actual tale.`,
    pacing: `Mythic and unhurried: let the big images (a moon palace, a sky bridge, a race across a river) get a whole page each.`,
    allowed: `Mild suspense with a warm resolution — gentle stakes, safe landings. Wonder and bigness the bedtime template never permitted.`,
    lessonAllowed: true,
  },
  "folk-tale": {
    name: "Folk tale",
    contract: `A world folk tale retold, or a new tale in a genuine folk-tale shape (repetition, bargains, clever reversals). Trickster tales are welcome: mischief, not menace — the trick delights everyone, including the tricked, by the end.`,
    pacing: `Folk-tale rhythm: patterned repetition building to a satisfying turn.`,
    allowed: `Cleverness, mild mischief, and a wink at the listener. Characters may be silly or grumpy without being scary.`,
    lessonAllowed: true,
  },
  pourquoi: {
    name: "Pourquoi (why) story",
    contract: `A "why" story: it opens on something true and observable (the moon changes shape, the bear has a white V on its chest, the sea is salty) and invents a warm, satisfying reason. The final page returns to the real observable thing so the child can point at it.`,
    pacing: `Question first, journey to the answer, then the small "so THAT's why" landing.`,
    allowed: `Real-world hooks and playful invented logic — the book teaches noticing, not facts.`,
    lessonAllowed: true,
  },
  "little-quest": {
    name: "Little quest",
    contract: `An out-and-back adventure. The main character wants something real (small but genuinely wanted), goes out to get it, meets 2-3 obstacles or helpers, and comes home satisfied. The want must be resolved — no shaggy-dog endings.`,
    pacing: `Forward motion out, a turn at the far point, and a quicker, warmer trip home.`,
    allowed: `A real want, real (small) obstacles, and mild suspense with safe landings — the engine the bedtime template removed.`,
    lessonAllowed: true,
  },
  "history-vignette": {
    name: "History vignette",
    contract: `A true moment from history made small and warm: first flight, lighthouse keepers, cave painters, trade ships. Stay truthful in the essentials — real names and real objects where they fit — while shrinking the frame to one child-sized scene.`,
    pacing: `Slow, sensory, close-up: what it smelled like, sounded like, felt like to be there.`,
    allowed: `Real people, real machines, real places — the concrete past instead of an invented meadow.`,
    lessonAllowed: true,
  },
  "fantasy-world": {
    name: "Fantasy world",
    contract: `Set in the family's persistent invented world — use the world bible provided (places, recurring characters, rules, tone) and stay consistent with its canon. The story adds one small new true thing to the world.`,
    pacing: `Familiar-place comfort with one new discovery per book.`,
    allowed: `Continuity: characters and places the child already knows may return.`,
    lessonAllowed: true,
  },
  funny: {
    name: "Funny",
    contract: `Giggle-first and absurd. Something is wonderfully wrong (a hat that refuses to stay on, soup that sings) and it escalates. NO lesson, no moral, nothing to learn — if a page starts teaching, cut it. The ending is a laugh, not a message.`,
    pacing: `Escalation in threes, then the biggest silliest beat, then one small topper.`,
    allowed: `Absurdity, exclamation marks, loud pages, undignified noises — permission to be silly.`,
    lessonAllowed: false,
  },
  "everyday-wonder": {
    name: "Everyday wonder",
    contract: `A close-to-home noticing story: something ordinary (rain on a window, a snail on the path, laundry on the line) seen slowly enough to become marvelous. Nearest to a quiet realist picture book.`,
    pacing: `Small and unhurried; the wonder accumulates rather than arrives.`,
    allowed: `Plotlessness — pure attention is enough here.`,
    lessonAllowed: true,
  },
};

export const laneKeys = Object.keys(storyLanes);

/** One-line-per-lane menu for the premise-stage prompt. */
export const laneMenu = (): string =>
  laneKeys
    .map((k) => `- ${k}: ${storyLanes[k].name} — ${storyLanes[k].contract.split(".")[0]}.`)
    .join("\n");

/** The full contract block the book call receives for its lane. */
export const laneContract = (laneKey: string): string => {
  const lane = storyLanes[laneKey] ?? storyLanes["everyday-wonder"];
  return `THE LANE — this book is a ${lane.name} book:
${lane.contract}
Pacing: ${lane.pacing}
Allowed here: ${lane.allowed}
Global floor (every lane): ${GLOBAL_FLOOR}`;
};
