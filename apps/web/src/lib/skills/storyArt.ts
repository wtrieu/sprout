/**
 * Midjourney prompt packs for curated story illustrations. Modeled on the
 * landing art pipeline (docs/landing-art-pipeline.md): a shared per-pack
 * style DNA opens every prompt, a shared negative closes it, and the page
 * prompt is composed in CODE from the character block + scene description —
 * the writer only ever supplies scenes, so style and character consistency
 * can't drift between pages.
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
};

// Keys are stored on stories.style — keep stable (renaming orphans rows).
export const artPacks: Record<string, ArtPack> = {
  "watercolor-soft": {
    name: "Soft watercolor",
    styleDna:
      "gentle children's picture book illustration, soft watercolor and gouache, warm paper texture, loose expressive brushwork, cozy pastel palette, storybook classic in the tradition of Beatrix Potter",
    negative: "photo, 3d render, hyperrealistic",
  },
  "gouache-night": {
    name: "Gouache night",
    styleDna:
      "children's picture book illustration, velvety gouache night scene, deep indigo and warm lamplight amber, soft glowing highlights, quiet bedtime mood, thick matte paint texture",
    negative: "photo, 3d render, harsh contrast, neon",
  },
  "paper-collage": {
    name: "Paper collage",
    styleDna:
      "children's picture book illustration, cut paper collage style like Eric Carle, layered textured paper shapes, bold simple forms, visible paper grain, bright friendly colors",
    negative: "photo, 3d render, thin outlines, realistic shading",
  },
  "crayon-storybook": {
    name: "Crayon storybook",
    styleDna:
      "children's picture book illustration, waxy crayon and colored pencil texture, wobbly charming linework, childlike warmth, cream paper background, sunny naive palette",
    negative: "photo, 3d render, clean vector lines",
  },
  "anime-meadow": {
    name: "Anime meadow",
    styleDna:
      "beautiful anime background art, Kyoto Animation style children's book scene, soft diffused lighting, painterly detail, gentle color grading, dreamy pastoral warmth",
    negative: "photo, manga panels, screentone, adult characters",
  },
};

export const artPackKeys = Object.keys(artPacks);

const SHARED_NEGATIVE = "text, words, letters, watermark, logo, signature, frame, border";

/** LRU pick over recent stories' style keys. */
export const pickArtPack = (db: DB, exclude: string[] = []): string => {
  const pool0 = artPackKeys.filter((k) => !exclude.includes(k));
  const eligible = pool0.length > 0 ? pool0 : artPackKeys;
  const recent = db
    .select({ style: stories.style })
    .from(stories)
    .orderBy(desc(stories.id))
    .limit(4)
    .all()
    .map((r) => r.style)
    .filter((s): s is string => !!s);
  const unused = eligible.filter((k) => !recent.includes(k));
  const pool = unused.length > 0 ? unused : eligible;
  return pool[Math.floor(Math.random() * pool.length)];
};

/** One page's full, copy-paste-ready Midjourney prompt. */
export const composePagePrompt = (
  packKey: string,
  characterDesc: string,
  scene: string,
): string => {
  const pack = artPacks[packKey] ?? artPacks["watercolor-soft"];
  return `${pack.styleDna}. ${characterDesc.trim().replace(/\.$/, "")}. ${scene
    .trim()
    .replace(/\.$/, "")}. --ar 3:2 --no ${SHARED_NEGATIVE}, ${pack.negative}`;
};

/** User-facing guidance shown above the prompt pack in the review UI. */
export const composeArtNotes = (packKey: string, characterName: string): string => {
  const pack = artPacks[packKey] ?? artPacks["watercolor-soft"];
  return [
    `Style: ${pack.name}. All prompts are ready to paste into Midjourney (Niji mode recommended).`,
    `1. Generate page 1 first and pick your favorite — this sets the book's look.`,
    `2. Copy that image's URL and append \`--cref <url> --cw 60\` to every remaining page prompt so ${characterName} stays consistent.`,
    `3. Keep --ar 3:2 on all pages. Upscale your picks before saving.`,
    `4. Upload each page's image on this screen when you're happy with it.`,
  ].join("\n");
};
