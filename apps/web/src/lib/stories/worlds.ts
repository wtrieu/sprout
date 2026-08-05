/**
 * The world bible: ONE persistent invented world that the `fantasy-world` lane
 * is always set in. Chosen by the owner on 2026-08-04 from the three concepts
 * in docs/world-bible-concepts.md (winner: concept 3, The Nine Cloud
 * Villages) — co-designed, not imposed.
 *
 * The world itself is checked-in code (hand-editable in a PR, like the seed
 * corpus). What accretes lives beside it in a plain markdown canon log
 * (data/world-canon.md): every published fantasy-world book appends one line,
 * so the world deepens instead of resetting nightly, and a parent can delete a
 * line that stopped being true.
 *
 * Node-only (fs) — import from scripts, API routes, and server libs; never
 * from client components.
 */
import fs from "node:fs";
import path from "node:path";
import type { SeedVocab } from "./seeds/types";

export type WorldEntry = {
  name: string;
  /** One sentence — what a writer needs to use it correctly. */
  note: string;
};

export type World = {
  /** Stable key stored on premises.world_ref — keep stable. */
  key: string;
  name: string;
  /** One line: what the world IS, for the premise-stage menu. */
  premise: string;
  tone: string;
  places: WorldEntry[];
  characters: WorldEntry[];
  /** How the world works — the physics a book must not contradict. */
  rules: string[];
  /** Cultural stretch words this world can carry (romanization only). */
  vocab?: SeedVocab[];
};

export const nineCloudVillages: World = {
  key: "nine-cloud-villages",
  name: "The Nine Cloud Villages",
  premise:
    "Nine small villages ride nine slow clouds in a loose ring around one mountain; neighbours visit by kite-bridge and the tea is always almost ready.",
  tone: `Sky-borne, unhurried, and a little funny. The Taiwanese inflection is texture, never a lesson — an a-má's umbrella, a bowl of tang-yuan on a cold night, tea that has been almost ready since morning. High places are cosy here rather than vertiginous, and the whole sky is safe: the worst thing that happens is inconvenient weather.`,
  places: [
    {
      name: "First Cloud",
      note: "The oldest village, its houses woven out of morning mist; everything there is a little damp and smells like clean laundry.",
    },
    {
      name: "The Kite-Bridge Yards",
      note: "Where the bridge-kites are flown, mended, and argued about; the ground is a happy mess of paper, string, and paste.",
    },
    {
      name: "The Mountain's Shoulder",
      note: "The one solid place in the world — a broad stone ledge where clouds stop to rest, and the only place with pebbles.",
    },
    {
      name: "The Tea Terrace",
      note: "Pots the size of bathtubs on a terrace of Fourth Cloud; the steam drifts down and joins the cloud it is standing on.",
    },
    {
      name: "Ninth Cloud",
      note: "The youngest village, still learning to hold its shape — its edges go fuzzy when it is excited or tired.",
    },
  ],
  characters: [
    {
      name: "Grandmother Rain (A-má)",
      note: "Keeper of First Cloud's weather. Her umbrella opens into whatever weather a story needs — but only ever gentle weather, and she takes her time deciding.",
    },
    {
      name: "Bo",
      note: "A cloud-shepherd kid whose entire flock is one (1) very small cumulus. Practical, easily distracted, excellent at knots.",
    },
    {
      name: "Puff",
      note: "Bo's small cumulus. Wanders, sulks, hides in kitchens, comes back. Cannot speak; is extremely expressive anyway.",
    },
    {
      name: "The Wind Postman",
      note: "Delivers letters between the villages, and now and then — apologetically — delivers a whole village to a new view.",
    },
  ],
  rules: [
    "Nine villages, nine clouds, one ring, one mountain. The ring drifts, so which village is your neighbour changes from week to week; visiting is a small event.",
    "Nothing falls. Cloud-stuff holds a house, a kettle, a sleeping child. Nobody in these villages is ever afraid of the edge.",
    "Weather is geography: a village can spend a week being fog, or wake up inside a rainbow. Weather is inconvenient here, never dangerous.",
    "You visit by kite-bridge, flown from the Kite-Bridge Yards. A bridge takes two people to fly — one to hold and one to run — so nobody crosses alone.",
    "The Mountain's Shoulder is the only solid ground. Things that must not blow away get left there.",
    "Tea is always almost ready. Nothing in the Nine Villages is urgent, and no one is ever hurried out of a doorway.",
  ],
  vocab: [
    {
      word: "grandmother",
      romanization: "a-má",
      gloss: "grandma (Taiwanese Hokkien)",
      script: "阿嬤",
    },
    {
      word: "sweet rice balls",
      romanization: "tang-yuan",
      gloss: "warm sweet rice-ball soup, eaten on cold nights",
      script: "湯圓",
    },
  ],
};

export const worlds: Record<string, World> = {
  [nineCloudVillages.key]: nineCloudVillages,
};

/** The single world the fantasy-world lane uses. A second only if appetite emerges. */
export const defaultWorld = nineCloudVillages;

export const worldKeys: ReadonlySet<string> = new Set(Object.keys(worlds));

export const getWorld = (key: string | null | undefined): World | null =>
  (key && worlds[key]) || null;

// ---------------------------------------------------------------------------
// canon log (data/world-canon.md)
// ---------------------------------------------------------------------------

/** How many canon lines ride into a prompt — prompt weight stays bounded. */
export const CANON_PROMPT_LINES = 24;

export const worldCanonPath = (): string =>
  process.env.WORLD_CANON_PATH ?? path.resolve(process.cwd(), "../../data/world-canon.md");

const CANON_HEADER = `# World canon

One line per published book, appended automatically when a fantasy-world story
goes ready. Hand-editable: cut any line that stopped being true, reword any
line that reads badly. The last ${CANON_PROMPT_LINES} lines of a world's
section ride into the premise and book prompts.
`;

const readCanonFile = (): string => {
  try {
    return fs.readFileSync(worldCanonPath(), "utf8");
  } catch {
    return "";
  }
};

/**
 * The canon lines for one world, oldest first. Sections are `## <worldKey>`
 * headings; entries are markdown list items under them.
 */
export const readCanon = (worldKey: string): string[] => {
  const lines: string[] = [];
  let inSection = false;
  for (const raw of readCanonFile().split("\n")) {
    const heading = raw.match(/^##\s+(\S+)/);
    if (heading) {
      inSection = heading[1] === worldKey;
      continue;
    }
    if (!inSection) continue;
    const entry = raw.match(/^-\s+(.*\S)\s*$/);
    if (entry) lines.push(entry[1]);
  }
  return lines;
};

/**
 * Append one canon line for a world, creating the file/section as needed.
 * Returns false when an identical line is already recorded (finalize is safe
 * to call more than once for the same story).
 */
export const appendCanon = (worldKey: string, line: string): boolean => {
  const entry = line.replace(/\s+/g, " ").trim();
  if (!entry) return false;
  if (readCanon(worldKey).includes(entry)) return false;

  const file = worldCanonPath();
  let text = readCanonFile();
  if (!text.trim()) text = CANON_HEADER;
  if (!new RegExp(`^##\\s+${worldKey}\\b`, "m").test(text)) {
    text = `${text.replace(/\s*$/, "")}\n\n## ${worldKey}\n`;
  }

  // Insert at the end of this world's section, so sections stay grouped.
  const out: string[] = [];
  const lines = text.split("\n");
  let inSection = false;
  let inserted = false;
  for (const raw of lines) {
    const heading = raw.match(/^##\s+(\S+)/);
    if (heading && inSection && !inserted) {
      out.push(`- ${entry}`, "");
      inserted = true;
    }
    if (heading) inSection = heading[1] === worldKey;
    out.push(raw);
  }
  if (!inserted) {
    while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
    out.push(`- ${entry}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${out.join("\n").replace(/\s*$/, "")}\n`, "utf8");
  return true;
};

const firstSentence = (text: string, max = 200): string => {
  const clean = text.replace(/\s+/g, " ").trim();
  const cut = clean.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? clean;
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
};

const isoDay = (when: Date): string => when.toISOString().slice(0, 10);

/**
 * The canon line a published book contributes: traceable to the story, and
 * readable on its own as a fact about the world.
 */
export const canonLineFor = (
  story: { id: number; title: string | null; characterName: string | null; prompt: string },
  when: Date = new Date(),
): string => {
  const who = story.characterName ? `${story.characterName} — ` : "";
  return `[#${story.id} ${isoDay(when)}] "${story.title ?? "untitled"}": ${who}${firstSentence(story.prompt)}`;
};

// ---------------------------------------------------------------------------
// prompt blocks
// ---------------------------------------------------------------------------

const canonList = (worldKey: string): string[] =>
  readCanon(worldKey).slice(-CANON_PROMPT_LINES);

const bullets = (entries: WorldEntry[]): string =>
  entries.map((e) => `\n- ${e.name} — ${e.note}`).join("");

/**
 * The world itself, described once. Both prompt stages get the same facts —
 * they differ only in what they ask the model to DO with them, so stage A can
 * never propose a premise the book stage would have to contradict.
 */
const worldBody = (world: World): string => {
  const canon = canonList(world.key);
  return `${world.premise}
TONE: ${world.tone}
HOW IT WORKS (never contradict these): ${world.rules.map((r) => `\n- ${r}`).join("")}
PLACES: ${bullets(world.places)}
WHO LIVES HERE (any of them may appear or stay offstage; when they appear they behave as described): ${bullets(
    world.characters,
  )}${
    canon.length > 0
      ? `\nCANON SO FAR (true because earlier books made it true — build on it, never contradict it): ${canon
          .map((c) => `\n- ${c}`)
          .join("")}`
      : ""
  }`;
};

/**
 * The world brief for the premise stage, so stage A proposes fantasy-world
 * premises that are actually set in this world.
 */
export const worldBrief = (world: World = defaultWorld): string =>
  `THE PERSISTENT WORLD — every "fantasy-world" premise is set in ${world.name}, the one invented world this library keeps returning to. Propose AT MOST ONE fantasy-world premise tonight, set "worldRef" to "${world.key}", and make it feel like a return visit rather than a tour of the place.
${worldBody(world)}`;

/** The full world block the book call receives when its premise is set here. */
export const worldBlock = (world: World): string =>
  `THE WORLD — this book is set in ${world.name}, this family's one persistent invented world. A returning reader must recognise it, so stay consistent with everything below.
${worldBody(world)}
USE one or two of the places; you may invent a small new corner, never a new region.
THIS BOOK ADDS ONE SMALL NEW TRUE THING to the world — one place, habit, custom, or small fact a later book could pick up. Let it arrive inside the story; never announce it.`;
