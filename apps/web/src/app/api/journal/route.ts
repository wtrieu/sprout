import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { children, journalEntries, journalKinds, milestones } from "@/db/schema";
import { ageInMonths } from "@/lib/age";

export const GET = () => {
  const entries = db
    .select({
      id: journalEntries.id,
      kind: journalEntries.kind,
      content: journalEntries.content,
      milestoneId: journalEntries.milestoneId,
      data: journalEntries.data,
      ageMonths: journalEntries.ageMonths,
      auto: sql<number>`source_message_id IS NOT NULL`,
      createdAt: journalEntries.createdAt,
    })
    .from(journalEntries)
    .orderBy(desc(journalEntries.id))
    .limit(100)
    .all();

  // Milestone frontier + achieved set, so the UI can render a checklist.
  const child = db.select().from(children).limit(1).get();
  const months = child ? ageInMonths(child.dob) : 0;
  const bucket = db.get<{ age: number } | undefined>(
    sql`SELECT MAX(age_months) as age FROM milestones WHERE age_months <= ${months}`,
  );
  const nextBucket = db.get<{ age: number } | undefined>(
    sql`SELECT MIN(age_months) as age FROM milestones WHERE age_months > ${months}`,
  );
  const frontier = db
    .select({
      id: milestones.id,
      domain: milestones.domain,
      ageMonths: milestones.ageMonths,
      description: milestones.description,
    })
    .from(milestones)
    .where(sql`age_months IN (${bucket?.age ?? months}, ${nextBucket?.age ?? months})`)
    .all();
  const achieved = entries.filter((e) => e.kind === "milestone" && e.milestoneId !== null);

  return NextResponse.json({
    entries,
    frontier,
    achievedIds: achieved.map((e) => e.milestoneId),
  });
};

const PostSchema = z.object({
  kind: z.enum(journalKinds),
  content: z.string().min(2).max(500).optional(),
  milestoneId: z.number().int().optional(),
  data: z.record(z.unknown()).optional(),
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

  let content = body.data.content;
  if (body.data.kind === "milestone") {
    if (!body.data.milestoneId) {
      return NextResponse.json({ error: "milestoneId required" }, { status: 400 });
    }
    const m = db
      .select()
      .from(milestones)
      .where(eq(milestones.id, body.data.milestoneId))
      .get();
    if (!m) return NextResponse.json({ error: "unknown milestone" }, { status: 404 });
    const dupe = db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(sql`kind = 'milestone' AND milestone_id = ${m.id}`)
      .get();
    if (dupe) return NextResponse.json({ error: "already marked achieved" }, { status: 409 });
    content = `Achieved: ${m.description}`;
  }
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });

  const entry = db
    .insert(journalEntries)
    .values({
      childId: child.id,
      kind: body.data.kind,
      content,
      milestoneId: body.data.milestoneId ?? null,
      data: body.data.data ?? null,
      ageMonths: ageInMonths(child.dob),
    })
    .returning()
    .get();
  return NextResponse.json({ entry });
};

export const DELETE = async (req: NextRequest) => {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  db.delete(journalEntries).where(eq(journalEntries.id, id)).run();
  return NextResponse.json({ ok: true });
};
