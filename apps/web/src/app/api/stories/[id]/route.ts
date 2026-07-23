import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyPages, characters } from "@/db/schema";
import { deleteStoryImages } from "@/lib/stories/files";

export const GET = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const story = db.select().from(stories).where(eq(stories.id, Number(id))).get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  const character = story.characterId
    ? db.select().from(characters).where(eq(characters.id, story.characterId)).get()
    : story.characterName
      ? { name: story.characterName, appearanceDesc: story.characterDesc }
      : null;
  const pages = db
    .select()
    .from(storyPages)
    .where(eq(storyPages.storyId, story.id))
    .orderBy(asc(storyPages.pageIndex))
    .all();
  return NextResponse.json({ story, character: character ?? null, pages });
};

const PatchSchema = z.object({ favorite: z.boolean() });

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const body = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "body must be { favorite: boolean }" }, { status: 400 });
  }
  const story = db
    .update(stories)
    .set({ favorite: body.data.favorite })
    .where(eq(stories.id, Number(id)))
    .returning()
    .get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ story });
};

export const DELETE = async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const story = db.select().from(stories).where(eq(stories.id, Number(id))).get();
  if (!story) return NextResponse.json({ error: "not found" }, { status: 404 });
  const pages = db
    .select({ imagePath: storyPages.imagePath })
    .from(storyPages)
    .where(eq(storyPages.storyId, story.id))
    .all();
  deleteStoryImages(story.id, pages);
  db.delete(stories).where(eq(stories.id, story.id)).run(); // pages cascade
  return NextResponse.json({ deleted: true });
};
