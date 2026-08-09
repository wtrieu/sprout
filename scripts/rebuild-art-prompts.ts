/**
 * Rebuild the Midjourney prompts of books that are still waiting to be
 * illustrated, after the 2026-08-08 prompt overhaul.
 *
 * Why this exists: before migration 0011 only the COMPOSED prompt was stored,
 * so a composer change could not reach books already in the queue. Those books
 * shipped prompts averaging 188 descriptive words — 2.5x the window where
 * Midjourney still resolves what it is reading, which is what was coming back
 * as mis-scaled, misplaced background scenery.
 *
 * Three steps per book:
 *   1. EXTRACT the writer's raw layers back out of the stored prompt (the old
 *      composer's markers are unambiguous — validated against all 47 queued
 *      pages before this script was written).
 *   2. COMPRESS them to the new budgets with one model call per book. One call
 *      rather than one per page, so the model can keep the recurring
 *      background thread coherent across the whole book.
 *   3. RECOMPOSE with the current composer and write back, persisting the raw
 *      layers this time so the next composer change needs no extraction.
 *
 * Read-only by default. Pass --apply to write.
 *   pnpm --filter web exec tsx ../../scripts/rebuild-art-prompts.ts
 *   pnpm --filter web exec tsx ../../scripts/rebuild-art-prompts.ts --apply
 */
import "./env";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { stories, storyPages } from "../apps/web/src/db/schema";
import {
  composeArtNotes,
  composePagePrompt,
  promptWordCount,
  PROMPT_WORD_CEILING,
} from "../apps/web/src/lib/skills/storyArt";
import { callClaudeForJson, storyModels } from "../apps/web/src/lib/stories/claudeCli";

const apply = process.argv.includes("--apply");
/** Books not yet illustrated. 'ready' books are already drawn — never touch them. */
const TARGET_STATUS = ["draft", "approved"] as const;

// Markers written by the two previous composer generations.
const BG_MARKER = " in the background, ";
const FRIEND_MARKERS = ["tucked somewhere tiny, ", "hidden somewhere small in the scene, "];

type Layers = { scene: string; background: string };

/** Pull the writer's raw layers back out of an old composed prompt. */
const extractLayers = (prompt: string, characterDesc: string): Layers | null => {
  const body = prompt.split(" --ar")[0];
  const desc = characterDesc.trim().replace(/\.$/, "");
  const charAt = body.indexOf(desc);
  const bgAt = body.indexOf(BG_MARKER);
  if (charAt === -1 || bgAt === -1) return null;
  const scene = body.slice(charAt + desc.length, bgAt).replace(/^\.\s*/, "").trim();
  const afterBg = body.slice(bgAt + BG_MARKER.length);
  const friendAt = FRIEND_MARKERS.map((m) => afterBg.indexOf(m)).find((i) => i !== -1) ?? -1;
  const background = (friendAt === -1 ? afterBg : afterBg.slice(0, friendAt))
    .replace(/\.\s*$/, "")
    .trim();
  return scene && background ? { scene, background } : null;
};

/** The hidden friend was only ever stored inside the artNotes prose. */
const extractHiddenFriend = (artNotes: string | null): string | null => {
  const m = artNotes?.match(/This book's hidden friend: (.+?) —/);
  return m ? m[1].trim() : null;
};

const TrimmedSchema = z.object({
  characterDesc: z.string().min(10),
  pages: z.array(z.object({ scene: z.string().min(3), background: z.string().min(3) })),
});

const buildTrimPrompt = (title: string, characterDesc: string, layers: Layers[]): string =>
  `You are trimming the illustration briefs of a finished children's picture book so they fit what an image model can actually draw. The story text is done and is NOT changing — only these picture briefs.

THE PROBLEM: these briefs were written to a much longer budget. Composed with the book's style and character blocks they run about 190 words per page. Midjourney holds roughly three subjects and stops resolving what it reads past ~70 words, so everything past that lands as mis-scaled scenery in the wrong place.

REWRITE the character block and each page's two fields to the new budget. Keep the same character and the same moments and the same recurring background thread — you are compressing, not reinventing.
- "characterDesc" — AT MOST 18 words. The book's canonical appearance block; it is pasted verbatim into EVERY page's prompt, so it is the most expensive field in the book. Keep species/kind, the one silhouette-defining shape, at most three colors, and the single most distinctive accessory. Cut everything else, including size comparisons and facial detail.
- "scene" — AT MOST 18 words. That page's foreground moment only: setting, what the character is doing, light. Concrete pictureable nouns, telegram style. Do NOT describe the character's appearance (a separate block covers it) and do NOT name an art style. Drop "Mood:" labels — fold the mood into the words if it fits, otherwise lose it.
- "background" — AT MOST 10 words, and exactly ONE thing. Write it as a scale-anchored noun phrase that OPENS with its own size and distance: "a tiny distant lighthouse", "one small far-off boat". Never write "in the background". If the old background had several happenings, keep only the one that carries the book's recurring thread and cut the rest — a second element here is exactly what was breaking these pictures.

BOOK: ${title}
CURRENT CHARACTER BLOCK (${characterDesc.split(/\s+/).length} words): ${characterDesc}

PAGES (in order):
${layers.map((l, i) => `${i + 1}. scene: ${l.scene}\n   background: ${l.background}`).join("\n")}

Return ONLY a JSON object, no prose before or after:
{ "characterDesc": string, "pages": [ { "scene": string, "background": string } ] }
Exactly ${layers.length} pages, in the same order.`;

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

const main = () => {
  const rows = db
    .select()
    .from(stories)
    .where(inArray(stories.status, [...TARGET_STATUS]))
    .all();

  if (rows.length === 0) {
    console.log("no draft/approved books in the queue — nothing to rebuild");
    return;
  }
  console.log(
    `${apply ? "REBUILDING" : "DRY RUN —"} ${rows.length} book(s) in the queue (${TARGET_STATUS.join("/")})\n`,
  );

  const model = storyModels().writer;
  let rebuilt = 0;
  let skipped = 0;

  for (const story of rows) {
    const pages = db
      .select()
      .from(storyPages)
      .where(inArray(storyPages.storyId, [story.id]))
      .all()
      .sort((a, b) => a.pageIndex - b.pageIndex);

    const label = `#${story.id} "${story.title ?? "untitled"}" [${story.style}]`;
    if (pages.some((p) => p.imagePath)) {
      console.log(`${label}: has rendered images already — skipped`);
      skipped += 1;
      continue;
    }
    if (!story.characterDesc) {
      console.log(`${label}: no characterDesc — cannot extract layers, skipped`);
      skipped += 1;
      continue;
    }

    // Pages already carrying raw layers (post-0011 imports) need no extraction.
    const extracted = pages.map((p) =>
      p.scene && p.background
        ? { scene: p.scene, background: p.background }
        : extractLayers(p.illustrationPrompt, story.characterDesc!),
    );
    if (extracted.some((l) => l === null)) {
      console.log(`${label}: ${extracted.filter((l) => !l).length} page(s) unparseable — skipped`);
      skipped += 1;
      continue;
    }
    const layers = extracted as Layers[];
    const before = pages.map((p) => promptWordCount(p.illustrationPrompt));

    let trimmed: Layers[];
    let trimmedCharacterDesc: string;
    try {
      const raw = callClaudeForJson(
        buildTrimPrompt(story.title ?? "untitled", story.characterDesc, layers),
        { model },
      );
      const parsed = TrimmedSchema.parse(raw);
      if (parsed.pages.length !== layers.length) {
        throw new Error(`got ${parsed.pages.length} pages, expected ${layers.length}`);
      }
      trimmed = parsed.pages;
      trimmedCharacterDesc = parsed.characterDesc;
    } catch (err) {
      console.log(`${label}: trim call failed (${err instanceof Error ? err.message : err}) — skipped`);
      skipped += 1;
      continue;
    }

    const composed = trimmed.map((l) =>
      composePagePrompt(story.style ?? "watercolor-soft", trimmedCharacterDesc, l.scene, {
        background: l.background,
      }),
    );
    const after = composed.map(promptWordCount);
    const over = after.filter((n) => n > PROMPT_WORD_CEILING).length;

    console.log(
      `${label}: ${pages.length}p  ${Math.round(before.reduce((a, b) => a + b, 0) / before.length)} → ${Math.round(
        after.reduce((a, b) => a + b, 0) / after.length,
      )} words/page (max ${Math.max(...after)})${over > 0 ? `  ⚠️ ${over} page(s) still over ${PROMPT_WORD_CEILING}` : ""}`,
    );
    console.log(
      `    character:         ${trimmedCharacterDesc} (${words(story.characterDesc)}w → ${words(trimmedCharacterDesc)}w)\n` +
        `    page 1 scene:      ${trimmed[0].scene} (${words(trimmed[0].scene)}w)\n` +
        `    page 1 background: ${trimmed[0].background} (${words(trimmed[0].background)}w)`,
    );

    if (!apply) continue;

    const hiddenFriend = story.hiddenFriend ?? extractHiddenFriend(story.artNotes);
    db.transaction((tx) => {
      pages.forEach((page, i) => {
        tx.update(storyPages)
          .set({
            scene: trimmed[i].scene,
            background: trimmed[i].background,
            illustrationPrompt: composed[i],
          })
          .where(inArray(storyPages.id, [page.id]))
          .run();
      });
      tx.update(stories)
        .set({
          characterDesc: trimmedCharacterDesc,
          hiddenFriend,
          // Rewritten so the --cref instructions from the old notes go away.
          artNotes: composeArtNotes(
            story.style ?? "watercolor-soft",
            story.characterName ?? "the character",
            hiddenFriend ?? undefined,
          ),
        })
        .where(inArray(stories.id, [story.id]))
        .run();
    });
    rebuilt += 1;
  }

  console.log(
    `\n${apply ? `rebuilt ${rebuilt} book(s)` : "dry run — nothing written"}${skipped > 0 ? `, skipped ${skipped}` : ""}`,
  );
  if (!apply) console.log("re-run with --apply to write.");
};

main();
