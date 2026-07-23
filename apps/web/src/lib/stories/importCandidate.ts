/**
 * Shared import path for story candidates: everything Claude writes passes
 * through here — Zod shape validation, mechanical craft checks, then a
 * transactional insert of the draft story + pages with composed Midjourney
 * prompts. Used by scripts/nightly-story-candidates.ts and the manual
 * story:import CLI.
 */
import { z } from "zod";
import type { DB } from "../../db/client";
import { stories, storyPages } from "../../db/schema";
import { ageBand, validatePages } from "../skills/storyText";
import { composeArtNotes, composePagePrompt } from "../skills/storyArt";
import { normalizePageText } from "./text";

export { normalizePageText };

export const CandidateSchema = z.object({
  title: z.string().min(3).max(120),
  characterName: z.string().min(2).max(60),
  characterDesc: z.string().min(20).max(400),
  pages: z
    .array(
      z.object({
        text: z.string().min(1).max(400),
        // Visual description only — style words and character appearance are
        // composed in code (storyArt.ts).
        scene: z.string().min(10).max(500),
      }),
    )
    .min(6)
    .max(12),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export type ImportOptions = {
  childId: number;
  ageMonths: number;
  formKey: string;
  artPackKey: string;
  /** The theme/outline that seeded the story (stored on stories.prompt). */
  theme: string;
  /** Setting-bank key (stories.setting) for variety memory; optional. */
  settingKey?: string;
};


export type ImportResult =
  | { ok: true; storyId: number; title: string }
  | { ok: false; problems: string[] };

export const importCandidate = (db: DB, raw: unknown, opts: ImportOptions): ImportResult => {
  const parsed = CandidateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const candidate = {
    ...parsed.data,
    pages: parsed.data.pages.map((p) => ({ ...p, text: normalizePageText(p.text) })),
  };

  const craftProblems = validatePages(candidate, opts.formKey, ageBand(opts.ageMonths));
  if (craftProblems.length > 0) return { ok: false, problems: craftProblems };

  const storyId = db.transaction((tx) => {
    const story = tx
      .insert(stories)
      .values({
        childId: opts.childId,
        title: candidate.title,
        style: opts.artPackKey,
        form: opts.formKey,
        prompt: opts.theme,
        ageMonths: opts.ageMonths,
        pageCount: candidate.pages.length,
        characterName: candidate.characterName,
        characterDesc: candidate.characterDesc,
        artNotes: composeArtNotes(opts.artPackKey, candidate.characterName),
        setting: opts.settingKey ?? null,
        status: "draft",
      })
      .returning()
      .get();
    candidate.pages.forEach((page, i) => {
      tx.insert(storyPages)
        .values({
          storyId: story.id,
          pageIndex: i,
          text: page.text,
          illustrationPrompt: composePagePrompt(
            opts.artPackKey,
            candidate.characterDesc,
            page.scene,
          ),
        })
        .run();
    });
    return story.id;
  });

  return { ok: true, storyId, title: candidate.title };
};
