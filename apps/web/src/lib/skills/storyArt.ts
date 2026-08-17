/**
 * Midjourney prompt packs for curated story illustrations. Modeled on the
 * landing art pipeline (docs/landing-art-pipeline.md): a shared per-pack
 * style DNA opens every prompt, a shared negative closes it, and the page
 * prompt is composed in CODE from the character block + the page's layered
 * scene (foreground scene, background life, the book's hidden friend) — the
 * writer only ever supplies content, so style and character consistency
 * can't drift between pages.
 *
 * Prompt length discipline (2026-08-08): the previous budgets summed to
 * ~115-137 words and shipped books averaged 188 — 2-3x past the window where
 * Midjourney still resolves what it is reading. Everything past that window
 * lands as mis-scaled, mis-placed scenery, which is exactly what the
 * background layer was coming back as. Three rules hold the line now:
 *
 *   1. HARD CEILING. Style DNA <= 20 words, and the composed descriptive text
 *      stays under PROMPT_WORD_CEILING. Per-field budgets in writeBook.ts sum
 *      under it, and artLayerProblems checks the composed total too.
 *   2. THREE SUBJECTS. Character + foreground action + one background element.
 *      Midjourney composes about three reliably; the old brief asked for five
 *      (it wanted a background happening AND a findable object AND the hidden
 *      friend on top of the character and the action).
 *   3. SCALE LIVES IN THE WORDS. "in the background," is a positional
 *      instruction, and Midjourney has no compositional grounding to honour
 *      it — it just blends the tokens. The writer now supplies the background
 *      as a scale-anchored noun phrase ("a tiny distant ..."), which is the
 *      only working lever: the `::0.4` multi-prompt down-weight this module
 *      once applied was removed (2026-08-16) because multi-prompts only exist
 *      through V6.1 — the V7/V8/Niji models actually in use don't parse `::`,
 *      so the tokens landed as literal junk text in the prompt.
 *
 * The hidden friend deliberately does NOT appear in page prompts: "hide this
 * small thing somewhere" asks for negative salience, which a diffusion model
 * cannot do — it either renders it large or drops it. It stays a book-level
 * idea in composeArtNotes, where the parent uses it to choose between
 * generations.
 */
import { desc } from "drizzle-orm";
import type { DB } from "../../db/client";
import { stories } from "../../db/schema";

export type ArtPack = {
  name: string;
  /** Opens every prompt: the whole-book look, Niji/MJ-tuned. */
  styleDna: string;
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
      "gentle children's picture book illustration, soft watercolor and gouache, warm paper texture, loose brushwork, cozy pastel palette, Beatrix Potter tradition",
    negative: "photo, 3d render, hyperrealistic",
    suits: ["everyday-wonder", "animal-lives"],
  },
  "gouache-night": {
    name: "Gouache night",
    styleDna:
      "children's picture book illustration, velvety gouache night scene, deep indigo and warm lamplight amber, soft glow, quiet bedtime mood",
    negative: "photo, 3d render, harsh contrast, neon",
    suits: ["bedtime-winddown"],
  },
  "paper-collage": {
    name: "Paper collage",
    styleDna:
      "children's picture book illustration, cut paper collage like Eric Carle, layered textured paper shapes, bold simple forms, visible grain",
    negative: "photo, 3d render, thin outlines, realistic shading",
  },
  "crayon-storybook": {
    name: "Crayon storybook",
    styleDna:
      "children's picture book illustration, waxy crayon and colored pencil texture, wobbly charming linework, cream paper, sunny naive palette",
    negative: "photo, 3d render, clean vector lines",
    suits: ["funny"],
  },
  "anime-meadow": {
    name: "Anime meadow",
    styleDna:
      "beautiful anime background art, Kyoto Animation style children's book scene, soft diffused lighting, painterly detail, dreamy pastoral warmth",
    negative: "photo, manga panels, screentone, adult characters",
    suits: ["little-quest", "everyday-wonder"],
  },
  linocut: {
    name: "Linocut print",
    styleDna:
      "children's picture book illustration, hand-carved linocut print, bold organic block lines, two-tone ink with one warm accent, folk-art charm",
    negative: "photo, 3d render, fine detail, gradients",
    suits: ["folk-tale"],
  },
  "felt-wool": {
    name: "Felt & wool",
    styleDna:
      "children's picture book illustration, needle-felted wool diorama, soft fuzzy felt texture, handcrafted miniature scene, warm tactile colors",
    negative: "photo of real animals, 3d render, plastic, glossy",
  },
  "pencil-wash": {
    name: "Pencil & wash",
    styleDna:
      "children's picture book illustration, graphite pencil linework with loose watercolor wash, muted tender palette, soft white space, Winnie the Pooh",
    negative: "photo, 3d render, heavy saturation, hard outlines",
    suits: ["everyday-wonder", "bedtime-winddown"],
  },
  "retro-flat": {
    name: "Retro flat",
    styleDna:
      "children's picture book illustration, mid-century retro flat style, simple geometric shapes, four warm colors, subtle print grain, golden-books charm",
    negative: "photo, 3d render, gradients, realistic shading",
    suits: ["funny", "how-it-works"],
  },
  // Two packs tuned for the myth/folk seed material (story engine phase 2).
  "ink-wash": {
    name: "Ink-wash storybook",
    styleDna:
      "children's picture book illustration, East Asian ink wash painting, soft sumi brush strokes, misty negative space, one warm accent color",
    negative: "photo, 3d render, hard outlines, saturated colors, busy detail",
    suits: ["myth-retelling", "folk-tale"],
  },
  "paper-cut-folk": {
    name: "Paper-cut folk",
    styleDna:
      "children's picture book illustration, traditional paper-cut folk art, layered silhouette shapes, delicate cut-out patterns, red and gold on cream",
    negative: "photo, 3d render, realistic shading, thin sketch lines",
    suits: ["myth-retelling", "folk-tale"],
  },
  // Three packs for the nonfiction shelf + big-wonder material (2026-08-07).
  "vintage-naturalist": {
    name: "Vintage naturalist",
    styleDna:
      "children's picture book illustration as a golden-age natural history plate, fine ink linework, soft watercolor tinting, cream archival paper",
    negative: "photo, 3d render, cartoon proportions, neon",
    suits: ["animal-lives", "big-ideas", "history-vignette", "everyday-wonder"],
  },
  "busy-world": {
    name: "Busy world",
    styleDna:
      "cheerful children's picture book illustration in the Richard Scarry tradition, small animal characters mid-errand, cutaway views, bright friendly colors",
    negative: "photo, 3d render, empty backgrounds, realistic shading",
    suits: ["how-it-works", "funny", "little-quest"],
  },
  "luminous-dark": {
    name: "Luminous dark",
    styleDna:
      "children's picture book illustration, luminous gouache on dark indigo, lit from within by starlight, small warm figures, vast gentle scale",
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
};

/**
 * Stylize: the packs carry a deliberate, specific look, so we want Midjourney
 * obeying it rather than embellishing it. Low stylize = follow the prompt.
 */
const STYLIZE = 50;

/**
 * Ceiling for the composed descriptive text (flags excluded). Midjourney's
 * attention falls off past roughly this point; the per-field budgets in
 * writeBook.ts are set to sum under it.
 */
export const PROMPT_WORD_CEILING = 75;

const clause = (s: string): string => s.trim().replace(/\.$/, "");

/** Descriptive words in a composed prompt — flags excluded. */
export const promptWordCount = (prompt: string): number =>
  prompt.split(" --")[0].split(/\s+/).filter(Boolean).length;

/** One page's full, copy-paste-ready Midjourney prompt. */
export const composePagePrompt = (
  packKey: string,
  characterDesc: string,
  scene: string,
  extras: PageArtExtras = {},
): string => {
  const pack = artPacks[packKey] ?? artPacks["watercolor-soft"];
  // The background rides last as a plain clause. Its only defense against
  // muscling into the foreground is the scale-anchored phrasing the writer is
  // held to ("a tiny distant ...") — see the header note on why the old
  // multi-prompt down-weight is gone.
  const background = extras.background?.trim();
  const body = [
    pack.styleDna,
    clause(characterDesc),
    clause(scene),
    ...(background ? [clause(background)] : []),
  ].join(". ");
  return `${body} --ar 3:2 --stylize ${STYLIZE} --no ${SHARED_NEGATIVE}, ${pack.negative}`;
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
    `2. Paste that image's URL into the "Page 1 image URL" box on this screen — every later page's prompt automatically picks it up as --sref, so the whole book holds one look.`,
    `3. Keep ${characterName}'s appearance line untouched at the front of each prompt; that plus --sref is what keeps them recognisable page to page.`,
    `4. Keep --ar 3:2 on all pages. Upscale your picks before saving.`,
    `5. Upload each page's image on this screen when you're happy with it.`,
  ];
  if (hiddenFriend) {
    lines.splice(
      1,
      0,
      `This book's hidden friend: ${hiddenFriend} — it is deliberately NOT in the prompts (asking Midjourney to hide something small only makes it big). Prefer generations with a quiet corner you could later imagine it into, and mention it when you read the book aloud.`,
    );
  }
  return lines.join("\n");
};
