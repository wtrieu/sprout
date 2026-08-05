import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { stories } from "@/db/schema";
import { nudgeInterestsByTags } from "@/lib/stories/interests";

/**
 * Read-complete beacon from the bedtime reader. Re-reads are the purest
 * taste signal a toddler can give — from the second read on, matching
 * interests get reinforced.
 */
export const POST = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const story = db.select().from(stories).where(eq(stories.id, Number(id))).get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (story.status !== "ready") return NextResponse.json({ ok: false });
  const updated = db
    .update(stories)
    .set({ readCount: sql`${stories.readCount} + 1`, lastReadAt: new Date() })
    .where(eq(stories.id, story.id))
    .returning()
    .get();
  if (updated.readCount >= 2) nudgeInterestsByTags(db, story.tags ?? [], 1);
  return NextResponse.json({ ok: true, readCount: updated.readCount });
};
