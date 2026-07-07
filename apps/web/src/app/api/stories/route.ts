import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, characters, children } from "@/db/schema";
import { enqueue } from "@/lib/jobs";
import { ageInMonths } from "@/lib/age";
import { resolveStyle, ensureStyleRef } from "@/lib/styles";

export const GET = () => {
  const rows = db
    .select({
      id: stories.id,
      title: stories.title,
      prompt: stories.prompt,
      status: stories.status,
      style: stories.style,
      pageCount: stories.pageCount,
      createdAt: stories.createdAt,
      characterName: characters.name,
    })
    .from(stories)
    .innerJoin(characters, eq(stories.characterId, characters.id))
    .orderBy(desc(stories.id))
    .all();
  return NextResponse.json({ stories: rows });
};

const PostSchema = z.object({
  characterId: z.number().int(),
  prompt: z.string().min(3).max(500),
  pageCount: z.number().int().min(4).max(12).default(8),
  // Style-pack key; absent or "surprise" → random pack.
  style: z.string().optional(),
});

export const POST = async (req: NextRequest) => {
  const body = PostSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const child = db.select().from(children).limit(1).get();
  if (!child) {
    return NextResponse.json({ error: "Set up the child profile first." }, { status: 400 });
  }
  const character = db
    .select()
    .from(characters)
    .where(eq(characters.id, body.data.characterId))
    .get();
  if (!character) return NextResponse.json({ error: "unknown character" }, { status: 404 });

  const style = resolveStyle(body.data.style);
  const story = db
    .insert(stories)
    .values({
      childId: child.id,
      characterId: character.id,
      prompt: body.data.prompt,
      style,
      ageMonths: ageInMonths(child.dob),
      pageCount: body.data.pageCount,
    })
    .returning()
    .get();

  ensureStyleRef(db, character.id, style);
  enqueue(db, { type: "story_text", lane: "llm", payload: { storyId: story.id }, priority: 10 });
  return NextResponse.json({ story });
};
