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
        // 70 words/page at the top band — allow room without letting a wall
        // of text through (word budgets are enforced in validatePages).
        text: z.string().min(1).max(650),
        // Visual description only — style words and character appearance are
        // composed in code (storyArt.ts).
        scene: z.string().min(10).max(500),
      }),
    )
    .min(6)
    .max(16),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export type ImportOptions = {
  childId: number;
  ageMonths: number;
  /** Text-form key; null/undefined = free prose (forms are tools, not law). */
  formKey?: string | null;
  artPackKey: string;
  /** The theme/pitch that seeded the story (stored on stories.prompt). */
  theme: string;
  /** Setting-bank key (stories.setting) for variety memory; optional. */
  settingKey?: string;
  /** Genre-lane key (lib/stories/lanes.ts). */
  lane?: string;
  /** Premise tags, for taste memory + interest attribution. */
  tags?: string[];
  lesson?: "none" | "developmental" | "cultural" | "factual";
  /** The premise this book was written from. */
  premiseId?: number;
  /** Generation-engine version stamp (defaults to legacy 1 when omitted). */
  engineVersion?: number;
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
        form: opts.formKey ?? null,
        prompt: opts.theme,
        ageMonths: opts.ageMonths,
        pageCount: candidate.pages.length,
        characterName: candidate.characterName,
        characterDesc: candidate.characterDesc,
        artNotes: composeArtNotes(opts.artPackKey, candidate.characterName),
        setting: opts.settingKey ?? null,
        lane: opts.lane ?? null,
        tags: opts.tags ?? null,
        lesson: opts.lesson ?? null,
        premiseId: opts.premiseId ?? null,
        engineVersion: opts.engineVersion ?? 1,
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
