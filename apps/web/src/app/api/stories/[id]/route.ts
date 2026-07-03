import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyPages, characters } from "@/db/schema";

export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const story = db.select().from(stories).where(eq(stories.id, Number(id))).get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  const character = db
    .select()
    .from(characters)
    .where(eq(characters.id, story.characterId))
    .get();
  const pages = db
    .select()
    .from(storyPages)
    .where(eq(storyPages.storyId, story.id))
    .orderBy(asc(storyPages.pageIndex))
    .all();
  return NextResponse.json({ story, character, pages });
};
