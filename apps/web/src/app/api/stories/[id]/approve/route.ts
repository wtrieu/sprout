import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories } from "@/db/schema";

export const POST = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const story = db.select().from(stories).where(eq(stories.id, Number(id))).get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (story.status !== "draft") {
    return NextResponse.json(
      { error: `only draft stories can be approved (status: ${story.status})` },
      { status: 409 },
    );
  }
  const updated = db
    .update(stories)
    .set({ status: "approved" })
    .where(eq(stories.id, story.id))
    .returning()
    .get();
  return NextResponse.json({ story: updated });
};
