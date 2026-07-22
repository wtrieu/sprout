import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { stories, storyPages, characters } from "@/db/schema";

export const GET = () => {
  const rows = db
    .select({
      id: stories.id,
      title: stories.title,
      prompt: stories.prompt,
      status: stories.status,
      style: stories.style,
      form: stories.form,
      ageMonths: stories.ageMonths,
      pageCount: stories.pageCount,
      createdAt: stories.createdAt,
      characterName: sql<string>`coalesce(${characters.name}, ${stories.characterName}, '')`,
      pagesDone: sql<number>`(select count(*) from ${storyPages} where ${storyPages.storyId} = ${stories.id} and ${storyPages.imageStatus} = 'done')`,
    })
    .from(stories)
    .leftJoin(characters, eq(stories.characterId, characters.id))
    .orderBy(desc(stories.id))
    .all();
  return NextResponse.json({ stories: rows });
};
