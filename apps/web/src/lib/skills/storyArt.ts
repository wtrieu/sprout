/**
 * Midjourney prompt packs for curated story illustrations. Modeled on the
 * landing art pipeline (docs/landing-art-pipeline.md): a shared per-pack
 * style DNA opens every prompt, a shared negative closes it, and the page
 * prompt is composed in CODE from the character block + the page's layered
 * scene (foreground scene, background life, the book's hidden friend) plus
 * the pack's depth clause — the writer only ever supplies content, so style
 * and character consistency can't drift between pages.
 *
 * Depth clauses (2026-08-07 illustration overhaul): the joy of the best
 * picture books is finding small stories inside the image. Every pack says,
 * in its own visual language, how IT hides second-look richness — so
 * worldbuilding detail arrives style-appropriately (carved motifs in a
 * linocut, glowing windows in a night gouache) instead of as generic clutter.
 */
import { desc } from "drizzle-orm";
import type { DB } from "../../db/client";
import { stories } from "../../db/schema";

export type ArtPack = {
  name: string;
  /** Opens every prompt: the whole-book look, Niji/MJ-tuned. */
  styleDna: string;
  /** How THIS style hides second-look richness — closes every prompt's scene. */
  depth: string;
  /** Per-pack additions to the shared negative. */
  negative: string;
  /** Lane keys this pack especially suits — a soft preference in pickArtPack. */
  suits?: string[];
};

// Keys are stored on stories.style — keep stable (renaming orphans rows).
export const artPacks: Record<string, ArtPack> = {
  "watercolor-soft": {
    name: "Soft watercolor",
    styleDna:
      "gentle children's picture book illustration, soft watercolor and gouache, warm paper texture, loose expressive brushwork, cozy pastel palette, storybook classic in the tradition of Beatrix Potter",
    depth:
      "background alive with small doings, distant creatures on their own errands, half-hidden objects among the leaves rewarding a second look",
    negative: "photo, 3d render, hyperrealistic",
    suits: ["everyday-wonder", "animal-lives"],
  },
  "gouache-night": {
    name: "Gouache night",
    styleDna:
      "children's picture book illustration, velvety gouache night scene, deep indigo and warm lamplight amber, soft glowing highlights, quiet bedtime mood, thick matte paint texture",
    depth:
      "small lit windows each holding its own tiny separate life, gentle nocturnal creatures going about their night in the shadows",
    negative: "photo, 3d render, harsh contrast, neon",
    suits: ["bedtime-winddown"],
  },
  "paper-collage": {
    name: "Paper collage",
    styleDna:
      "children's picture book illustration, cut paper collage style like Eric Carle, layered textured paper shapes, bold simple forms, visible paper grain, bright friendly colors",
    depth:
      "layered paper depth with small cut-paper creatures and patterns tucked between the layers, a quiet second world hiding in the shapes",
    negative: "photo, 3d render, thin outlines, realistic shading",
  },
  "crayon-storybook": {
    name: "Crayon storybook",
    styleDna:
      "children's picture book illustration, waxy crayon and colored pencil texture, wobbly charming linework, childlike warmth, cream paper background, sunny naive palette",
    depth:
      "margins and background scribbled full of tiny jokes and small creatures, child-drawn details hiding everywhere",
    negative: "photo, 3d render, clean vector lines",
    suits: ["funny"],
  },
  "anime-meadow": {
    name: "Anime meadow",
    styleDna:
      "beautiful anime background art, Kyoto Animation style children's book scene, soft diffused lighting, painterly detail, gentle color grading, dreamy pastoral warmth",
    depth:
      "deep layered background with distant figures mid-story, small animals and drifting seeds woven through the scenery",
    negative: "photo, manga panels, screentone, adult characters",
    suits: ["little-quest", "everyday-wonder"],
  },
  linocut: {
    name: "Linocut print",
    styleDna:
      "children's picture book illustration, hand-carved linocut print style, bold organic block lines, two-tone ink with one warm accent color, visible print texture, folk-art charm",
    depth:
      "small carved creatures and folk motifs tucked into corners and borders, bold patterns hiding pictures within pictures",
    negative: "photo, 3d render, fine detail, gradients",
    suits: ["folk-tale"],
  },
  "felt-wool": {
    name: "Felt & wool",
    styleDna:
      "children's picture book illustration, needle-felted wool diorama style, soft fuzzy felt textures, handcrafted miniature scene, warm tactile colors, gentle studio lighting",
    depth:
      "tiny felted props and small woolly creatures hidden around the diorama, handcrafted miniature clutter rewarding a close look",
    negative: "photo of real animals, 3d render, plastic, glossy",
  },
  "pencil-wash": {
    name: "Pencil & wash",
    styleDna:
      "children's picture book illustration, delicate graphite pencil linework with loose watercolor wash, muted tender palette, lots of soft white space, quiet classic storybook feeling like Winnie the Pooh",
    depth:
      "delicate background vignettes, small creatures and quiet happenings sketched lightly behind the main moment",
    negative: "photo, 3d render, heavy saturation, hard outlines",
    suits: ["everyday-wonder", "bedtime-winddown"],
  },
  "retro-flat": {
    name: "Retro flat",
    styleDna:
      "children's picture book illustration, mid-century retro flat style, simple geometric shapes, limited warm palette of 4 colors, subtle print grain, playful vintage golden-books charm",
    depth:
      "playful geometric background busy with small vintage characters mid-errand, hidden shapes and visual jokes in the pattern",
    negative: "photo, 3d render, gradients, realistic shading",
    suits: ["funny", "how-it-works"],
  },
  // Two packs tuned for the myth/folk seed material (story engine phase 2).
  "ink-wash": {
    name: "Ink-wash storybook",
    styleDna:
      "children's picture book illustration, East Asian ink wash painting style, soft sumi and shuimo brush strokes, generous misty negative space, one warm accent color, gentle flowing composition, serene classical storybook mood",
    depth:
      "small distant figures and creatures emerging from the mist, quiet details that surface slowly from the negative space",
    negative: "photo, 3d render, hard outlines, saturated colors, busy detail",
    suits: ["myth-retelling", "folk-tale"],
  },
  "paper-cut-folk": {
    name: "Paper-cut folk",
    styleDna:
      "children's picture book illustration, traditional paper-cut folk art style, layered silhouette shapes with delicate cut-out patterns, warm red and gold accents on cream, festive lantern-light warmth, handcrafted charm",
    depth:
      "intricate cut-out borders hiding tiny animals and lanterns, patterns with small stories cut into them",
    negative: "photo, 3d render, realistic shading, thin sketch lines",
    suits: ["myth-retelling", "folk-tale"],
  },
  // Three packs for the nonfiction shelf + big-wonder material (2026-08-07).
  "vintage-naturalist": {
    name: "Vintage naturalist",
    styleDna:
      "children's picture book illustration in the style of a golden-age natural history plate, fine ink linework with soft watercolor tinting, cream archival paper, careful loving accuracy, antique field-guide charm",
    depth:
      "margins scattered with small true companion studies — eggs, tracks, seeds, leaves around the main scene, a gentle cabinet of curiosities",
    negative: "photo, 3d render, cartoon proportions, neon",
    suits: ["animal-lives", "big-ideas", "history-vignette", "everyday-wonder"],
  },
  "busy-world": {
    name: "Busy world",
    styleDna:
      "cheerful busy children's picture book illustration in the tradition of Richard Scarry, a bustling scene of many small charming animal characters each mid-errand, cutaway views showing the insides of buildings and machines, bright friendly colors, warm organized chaos",
    depth:
      "every corner holds its own tiny story, a dropped hat being chased, a cart being loaded, a cat painting a fence — dozens of small findable details",
    negative: "photo, 3d render, empty backgrounds, realistic shading",
    suits: ["how-it-works", "funny", "little-quest"],
  },
  "luminous-dark": {
    name: "Luminous dark",
    styleDna:
      "children's picture book illustration, deep luminous gouache on near-dark indigo, scene lit from within by starlight, lanterns, or soft bioluminescent glow, vast gentle scale, small warm figures against enormous quiet wonder",
    depth:
      "the darkness full of almost-hidden glowing details, faint constellations forming pictures, tiny glowing creatures, faraway lit windows",
    negative: "photo, 3d render, harsh neon, horror shadows",
    suits: ["big-ideas", "myth-retelling", "bedtime-winddown"],
  },
};

export const artPackKeys = Object.keys(artPacks);

const SHARED_NEGATIVE = "text, words, letters, watermark, logo, signature, frame, border";

/**
 * LRU pick over recent stories' style keys, with a soft lane affinity: when
 * the fresh pool contains packs that name this lane in `suits`, they win most
 * of the time (a nonfiction how-it-works book usually lands in busy-world or
 * retro-flat) — but not always, so the library keeps its range.
 */
export const pickArtPack = (
  db: DB,
  exclude: string[] = [],
  lane?: string | null,
  rand: () => number = Math.random,
): string => {
  const pool0 = artPackKeys.filter((k) => !exclude.includes(k));
  const eligible = pool0.length > 0 ? pool0 : artPackKeys;
  const recent = db
    .select({ style: stories.style })
    .from(stories)
    .orderBy(desc(stories.id))
    .limit(6)
    .all()
    .map((r) => r.style)
    .filter((s): s is string => !!s);
  const unused = eligible.filter((k) => !recent.includes(k));
  const pool = unused.length > 0 ? unused : eligible;
  const suited = lane ? pool.filter((k) => artPacks[k].suits?.includes(lane)) : [];
  const finalPool = suited.length > 0 && rand() < 0.7 ? suited : pool;
  return finalPool[Math.floor(rand() * finalPool.length)];
};

/** The layered extras composed into a page prompt beyond the foreground scene. */
export type PageArtExtras = {
  /** The world going on behind the moment (page-level, from the writer). */
  background?: string;
  /** The book's recurring hidden companion (book-level, from the writer). */
  hiddenFriend?: string;
};

const clause = (s: string): string => s.trim().replace(/\.$/, "");

/** One page's full, copy-paste-ready Midjourney prompt. */
export const composePagePrompt = (
  packKey: string,
  characterDesc: string,
  scene: string,
  extras: PageArtExtras = {},
): string => {
  const pack = artPacks[packKey] ?? artPacks["watercolor-soft"];
  const parts = [pack.styleDna, clause(characterDesc), clause(scene)];
  if (extras.background) parts.push(`in the background, ${clause(extras.background)}`);
  if (extras.hiddenFriend) {
    parts.push(`hidden somewhere small in the scene, ${clause(extras.hiddenFriend)}`);
  }
  parts.push(pack.depth);
  return `${parts.join(". ")}. --ar 3:2 --no ${SHARED_NEGATIVE}, ${pack.negative}`;
};

/** User-facing guidance shown above the prompt pack in the review UI. */
export const composeArtNotes = (
  packKey: string,
  characterName: string,
  hiddenFriend?: string,
): string => {
  const pack = artPacks[packKey] ?? artPacks["watercolor-soft"];
  const lines = [
    `Style: ${pack.name}. All prompts are ready to paste into Midjourney (Niji mode recommended).`,
    `1. Generate page 1 first and pick your favorite — this sets the book's look.`,
    `2. Copy that image's URL and append \`--cref <url> --cw 60\` to every remaining page prompt so ${characterName} stays consistent.`,
    `3. Keep --ar 3:2 on all pages. Upscale your picks before saving.`,
    `4. Upload each page's image on this screen when you're happy with it.`,
  ];
  if (hiddenFriend) {
    lines.splice(
      1,
      0,
      `This book's hidden friend: ${hiddenFriend} — it should appear somewhere small on every page. When choosing between generations, prefer images where you can find it (and rich backgrounds with details worth hunting for).`,
    );
  }
  return lines.join("\n");
};
