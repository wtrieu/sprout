/**
 * Visual QC for FLUX renders. A small VLM answers targeted yes/no defect
 * questions (much more reliable than holistic "is this good?"); the verdict
 * is computed in code. Failed renders get their seed re-rolled by bumping
 * render_attempts — the orchestrator drives the render→grade→retry cycle.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { callOllamaVisionJson } from "../ollama";

export const QC_MAX_RENDER_ATTEMPTS = 2; // re-rolls per image before we accept it as-is

const DefectSchema = z.object({
  // Description fields FIRST: a small VLM asked to judge directly schema-fills
  // "false" defaults, but one that must first write down what it sees cannot
  // then coherently deny it (verified: gemma3 read text verbatim in a describe
  // probe after passing the same image through a judge-only rubric).
  scene_seen: z.string().max(500),
  text_seen: z.string().max(200),
  limbs_seen: z.string().max(400),
  extra_or_missing_limbs: z.boolean(),
  distorted_face: z.boolean(),
  garbled_area: z.boolean(),
  unwanted_text: z.boolean(),
  note: z.string().max(300),
});

const RefDefectSchema = DefectSchema.extend({
  single_full_body_character: z.boolean(),
});

export type QcVerdict = { pass: boolean; note: string };

// The text verdict is computed in CODE from the transcription — the model's
// own boolean flaked in testing (confabulated "text markers" on clean images).
const hasRealText = (textSeen: string): boolean => {
  const t = textSeen.trim().toLowerCase();
  return t !== "" && t !== "none" && t !== "n/a" && /[a-z0-9]{2,}/i.test(t);
};

const toB64 = (imagesDir: string, relPath: string): string =>
  fs.readFileSync(path.join(imagesDir, relPath)).toString("base64");

const DEFECT_QUESTIONS = `Inspect this children's book illustration for RENDERING DEFECTS only — do not judge artistic taste.

FIRST describe what you actually see (do this carefully — your judgments must follow from these descriptions):
- scene_seen: the scene in one or two sentences.
- text_seen: quote verbatim any actual letters or words readable in the image; write "none" if there are none. (Stars, sparkles, and decorative marks are NOT text.)
- limbs_seen: each figure's arms and hands exactly as drawn — how many arms, where each ends, whether each hand has a plausible shape (fingers or a clean simple mitten). AI images often hide a fused, lumpy, or truncated hand.

THEN judge, based ONLY on what you wrote above:
- extra_or_missing_limbs: wrong number of arms/hands/legs, an arm ending in a shapeless stump or lump, a hand fused into the body or another object, or six+ fingers. A clean simple mitten-hand is fine; a melted or lumpy one is a defect.
- distorted_face: any face melted, duplicated, or missing features in a way that looks broken (not just stylized)?
- garbled_area: any region of nonsensical melted shapes, duplicated body parts, or an object morphing into another?
- unwanted_text: true if text_seen contains readable letters or words.
- note: one short sentence — if any answer is true, say where the problem is; otherwise say "clean".`;

/** Grade a story-page render. */
export const gradePageImage = async (
  imagesDir: string,
  relPath: string,
  model?: string,
): Promise<QcVerdict> => {
  const d = await callOllamaVisionJson(
    `${DEFECT_QUESTIONS}

Return STRICT JSON: { "scene_seen": string, "text_seen": string, "limbs_seen": string, "extra_or_missing_limbs": boolean, "distorted_face": boolean, "garbled_area": boolean, "unwanted_text": boolean, "note": string }`,
    [toB64(imagesDir, relPath)],
    DefectSchema,
    { model },
  );
  const textDefect = hasRealText(d.text_seen);
  const pass = !d.extra_or_missing_limbs && !d.distorted_face && !d.garbled_area && !textDefect;
  return { pass, note: textDefect ? `text in image: "${d.text_seen.slice(0, 80)}"` : d.note };
};

/**
 * Grade a character reference sheet — stricter, because a defective reference
 * poisons every page conditioned on it.
 */
export const gradeRefImage = async (
  imagesDir: string,
  relPath: string,
  model?: string,
): Promise<QcVerdict> => {
  const d = await callOllamaVisionJson(
    `This should be a CHARACTER REFERENCE SHEET: exactly one character, full body visible, on a plain background. ${DEFECT_QUESTIONS}

- single_full_body_character: is there exactly one character, shown full body (head to feet), on a plain uncluttered background?

Return STRICT JSON: { "scene_seen": string, "text_seen": string, "limbs_seen": string, "extra_or_missing_limbs": boolean, "distorted_face": boolean, "garbled_area": boolean, "unwanted_text": boolean, "single_full_body_character": boolean, "note": string }`,
    [toB64(imagesDir, relPath)],
    RefDefectSchema,
    { model },
  );
  const textDefect = hasRealText(d.text_seen);
  const pass =
    d.single_full_body_character &&
    !d.extra_or_missing_limbs &&
    !d.distorted_face &&
    !d.garbled_area &&
    !textDefect;
  return { pass, note: textDefect ? `text in image: "${d.text_seen.slice(0, 80)}"` : d.note };
};
