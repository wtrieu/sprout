import fs from "node:fs";
import path from "node:path";

export const IMAGES_DIR = path.resolve(
  process.cwd(),
  process.env.IMAGES_DIR ?? "../../data/images",
);

/** Resolve a stored imagePath under IMAGES_DIR, or null if it escapes it. */
export const resolveImagePath = (imagePath: string): string | null => {
  const abs = path.resolve(IMAGES_DIR, imagePath);
  return abs.startsWith(IMAGES_DIR + path.sep) ? abs : null;
};

/** Directory that holds a story's user-uploaded illustrations. */
export const storyUploadDir = (storyId: number): string =>
  path.join(IMAGES_DIR, "uploads", `story-${storyId}`);

/**
 * Best-effort removal of a story's image files: every page's imagePath plus
 * the story's upload directory (FLUX-era pages live under stories/<id>/,
 * uploads under uploads/story-<id>/).
 */
export const deleteStoryImages = (
  storyId: number,
  pages: { imagePath: string | null }[],
): void => {
  for (const page of pages) {
    if (!page.imagePath) continue;
    const abs = resolveImagePath(page.imagePath);
    if (abs) fs.rmSync(abs, { force: true });
  }
  fs.rmSync(storyUploadDir(storyId), { recursive: true, force: true });
  fs.rmSync(path.join(IMAGES_DIR, "stories", String(storyId)), { recursive: true, force: true });
};
