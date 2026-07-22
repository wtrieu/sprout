import { asc, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { stories, storyPages } from "../../db/schema";
import { assignMotion } from "./motion";

/**
 * If every page of an approved story has an uploaded image, assign Ken Burns
 * motion to each page and flip the story to ready. Returns the story's new
 * status. Safe to call after every upload — it's a no-op until complete.
 */
export const finalizeStoryIfComplete = (db: DB, storyId: number): string | null => {
  const story = db.select().from(stories).where(eq(stories.id, storyId)).get();
  if (!story) return null;
  if (story.status !== "approved") return story.status;

  const pages = db
    .select()
    .from(storyPages)
    .where(eq(storyPages.storyId, storyId))
    .orderBy(asc(storyPages.pageIndex))
    .all();
  const complete = pages.length > 0 && pages.every((p) => p.imageStatus === "done" && p.imagePath);
  if (!complete) return story.status;

  db.transaction((tx) => {
    for (const page of pages) {
      tx.update(storyPages)
        .set({ motion: assignMotion(page.pageIndex) })
        .where(eq(storyPages.id, page.id))
        .run();
    }
    tx.update(stories).set({ status: "ready" }).where(eq(stories.id, storyId)).run();
  });
  return "ready";
};
