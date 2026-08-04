import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyPages } from "@/db/schema";
import { deleteStoryImages } from "@/lib/stories/files";
import { rejectReasonKeys } from "@/lib/stories/engine";

const BodySchema = z.object({
  reason: z.enum(rejectReasonKeys as [string, ...string[]]),
  note: z.string().max(500).optional(),
});

/**
 * Soft-reject a draft: keep the text pages as taste evidence (read only by
 * the weekly distiller), delete any uploaded images, and hide the story from
 * the app. True deletion (DELETE on the story) remains for finalized books.
 */
export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: `body must be { reason: one of ${rejectReasonKeys.join("|")}, note? }` },
      { status: 400 },
    );
  }
  const story = db.select().from(stories).where(eq(stories.id, Number(id))).get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (story.status !== "draft") {
    return NextResponse.json(
      { error: `only draft stories can be rejected (status: ${story.status})` },
      { status: 409 },
    );
  }

  const pages = db
    .select({ id: storyPages.id, imagePath: storyPages.imagePath })
    .from(storyPages)
    .where(eq(storyPages.storyId, story.id))
    .all();
  deleteStoryImages(story.id, pages);
  db.transaction((tx) => {
    for (const page of pages) {
      tx.update(storyPages)
        .set({ imagePath: null, imageStatus: "pending" })
        .where(eq(storyPages.id, page.id))
        .run();
    }
    tx.update(stories)
      .set({
        status: "rejected",
        rejectReason: body.data.reason,
        rejectNote: body.data.note ?? null,
      })
      .where(eq(stories.id, story.id))
      .run();
  });
  return NextResponse.json({ rejected: true });
};
