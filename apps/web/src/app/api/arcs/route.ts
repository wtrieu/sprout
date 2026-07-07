import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { children, characters, milestones, stories, storyArcs } from "@/db/schema";
import { enqueue, isLocked } from "@/lib/jobs";
import { ageInMonths } from "@/lib/age";
import { claudeAvailable } from "@/lib/claude";
import {
  selectArcThemes,
  planThroughline,
  outlineStory,
  buildArcStoryPrompt,
} from "@/lib/skills/storyArc";
import { resolveStyle, ensureStyleRef } from "@/lib/styles";

export const GET = () => {
  const arcs = db.select().from(storyArcs).orderBy(desc(storyArcs.id)).all();
  const rows = arcs.map((arc) => ({
    ...arc,
    stories: db
      .select({
        id: stories.id,
        arcIndex: stories.arcIndex,
        title: stories.title,
        prompt: stories.prompt,
        status: stories.status,
      })
      .from(stories)
      .where(eq(stories.arcId, arc.id))
      .orderBy(asc(stories.arcIndex))
      .all(),
  }));
  return NextResponse.json({ arcs: rows });
};

const PostSchema = z.object({
  characterId: z.number().int(),
  storyCount: z.number().int().min(2).max(5).default(3),
  focus: z.string().max(300).optional(),
  // Style-pack key; absent or "surprise" → random. One style per series.
  style: z.string().optional(),
});

export const POST = async (req: NextRequest) => {
  const body = PostSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }

  if (!claudeAvailable() && isLocked(db)) {
    return NextResponse.json(
      { error: "Sprout is busy generating (nightly batch or story images). Try again in a few minutes." },
      { status: 503 },
    );
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

  const months = ageInMonths(child.dob);

  // Milestone frontier: current checklist bucket + the next one up.
  const bucket = db.get<{ age: number } | undefined>(
    sql`SELECT MAX(age_months) as age FROM milestones WHERE age_months <= ${months}`,
  );
  const nextBucket = db.get<{ age: number } | undefined>(
    sql`SELECT MIN(age_months) as age FROM milestones WHERE age_months > ${months}`,
  );
  const relevantMilestones = db
    .select({ domain: milestones.domain, description: milestones.description })
    .from(milestones)
    .where(sql`age_months IN (${bucket?.age ?? months}, ${nextBucket?.age ?? months})`)
    .all();

  const { storyCount, focus } = body.data;

  // Stepwise planning (see lib/skills/storyArc.ts): themes are SELECTED from
  // the checklist, the through-line is one small creative call, and each
  // outline is its own call with the previous outlines as context — a local
  // model plans one story at a time far more reliably than a whole series.
  const themes = await selectArcThemes(relevantMilestones, storyCount, months, focus);
  const throughline = await planThroughline({
    characterName: character.name,
    characterDesc: character.appearanceDesc,
    months,
    themes,
    focus,
  });

  const outlines: Array<{ title: string; outline: string }> = [];
  for (let i = 0; i < themes.length; i++) {
    outlines.push(
      await outlineStory({
        characterName: character.name,
        months,
        throughline,
        theme: themes[i],
        storyNumber: i + 1,
        storyCount: themes.length,
        previousOutlines: outlines,
      }),
    );
  }

  const style = resolveStyle(body.data.style);
  ensureStyleRef(db, character.id, style);

  const arc = db
    .insert(storyArcs)
    .values({
      childId: child.id,
      characterId: character.id,
      title: throughline.arc_title,
      focus: focus ?? null,
      style,
      ageMonths: months,
    })
    .returning()
    .get();

  outlines.forEach((s, i) => {
    const story = db
      .insert(stories)
      .values({
        childId: child.id,
        characterId: character.id,
        arcId: arc.id,
        arcIndex: i,
        title: s.title,
        style,
        prompt: buildArcStoryPrompt({
          outline: s.outline,
          arcTitle: throughline.arc_title,
          storyNumber: i + 1,
          skill: themes[i].skill,
        }),
        ageMonths: months,
        pageCount: 8,
      })
      .returning()
      .get();
    enqueue(db, { type: "story_text", lane: "llm", payload: { storyId: story.id }, priority: 20 + i });
  });

  return NextResponse.json({ arc: { ...arc, planned: outlines.length } });
};
