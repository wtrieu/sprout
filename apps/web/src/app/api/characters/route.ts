import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { characters } from "@/db/schema";
import { enqueue } from "@/lib/jobs";

export const GET = () => {
  const rows = db.select().from(characters).orderBy(desc(characters.id)).all();
  return NextResponse.json({ characters: rows });
};

const PostSchema = z.object({
  name: z.string().min(1).max(60),
  appearanceDesc: z.string().min(20).max(600),
});

export const POST = async (req: NextRequest) => {
  const body = PostSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const seed = Math.floor(Math.random() * 100_000) + 1;
  const row = db
    .insert(characters)
    .values({ name: body.data.name, appearanceDesc: body.data.appearanceDesc, seed })
    .returning()
    .get();

  // Canonical reference image renders on the next orchestrator run; priority 1
  // so it always precedes any story pages that will depend on it.
  enqueue(db, {
    type: "char_reference",
    lane: "imagegen",
    payload: { characterId: row.id },
    priority: 1,
  });

  return NextResponse.json({ character: row });
};
