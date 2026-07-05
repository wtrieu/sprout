import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { children, chatMessages, milestones, visitPreps } from "@/db/schema";
import { ageInMonths, ageInDays } from "@/lib/age";
import { growthPercentile, type Sex } from "@/lib/growth";
import { claudeAvailable } from "@/lib/claude";
import {
  summarizeConcernThemes,
  pickTalkingPoints,
  draftDoctorQuestions,
  writeSnapshot,
  assembleVisitBrief,
} from "@/lib/skills/visitPrep";
import { isLocked } from "@/lib/jobs";

export const GET = () => {
  const rows = db
    .select({
      id: visitPreps.id,
      ageMonths: visitPreps.ageMonths,
      contentMd: visitPreps.contentMd,
      createdAt: visitPreps.createdAt,
    })
    .from(visitPreps)
    .orderBy(desc(visitPreps.id))
    .all();
  return NextResponse.json({ briefs: rows });
};

const PostSchema = z.object({
  sex: z.enum(["male", "female"]).optional(),
  weightKg: z.number().positive().optional(),
  lengthCm: z.number().positive().optional(),
  hcCm: z.number().positive().optional(),
  concerns: z.string().max(2000).optional(),
});

const fmtPercentile = (r: { z: number; percentile: number } | null): string =>
  r ? `P${r.percentile.toFixed(1)} (z ${r.z.toFixed(2)})` : "out of WHO table range";

export const POST = async (req: NextRequest) => {
  const body = PostSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const { sex, weightKg, lengthCm, hcCm, concerns } = body.data;

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
  if ((weightKg || lengthCm || hcCm) && !sex) {
    return NextResponse.json({ error: "sex is required with measurements" }, { status: 400 });
  }
  const months = ageInMonths(child.dob);
  const days = ageInDays(child.dob);

  // Growth section — computed from WHO LMS, never by the model.
  const growthLines: string[] = [];
  if (sex) {
    const s = sex as Sex;
    if (weightKg)
      growthLines.push(
        `Weight ${weightKg} kg — weight-for-age ${fmtPercentile(growthPercentile(db, { sex: s, measure: "weight_age", x: days, value: weightKg }))}`,
      );
    if (lengthCm)
      growthLines.push(
        `Length ${lengthCm} cm — length-for-age ${fmtPercentile(growthPercentile(db, { sex: s, measure: "length_age", x: days, value: lengthCm }))}`,
      );
    if (hcCm)
      growthLines.push(
        `Head circumference ${hcCm} cm — HC-for-age ${fmtPercentile(growthPercentile(db, { sex: s, measure: "hc_age", x: days, value: hcCm }))}`,
      );
    if (weightKg && lengthCm)
      growthLines.push(
        `Weight-for-length ${fmtPercentile(growthPercentile(db, { sex: s, measure: "weight_length", x: lengthCm, value: weightKg }))}`,
      );
  }

  // Milestone frontier: the checklist bucket at/below the current age plus the
  // next one up (same windowing as the weekly activities generator).
  const bucket = db.get<{ age: number } | undefined>(
    sql`SELECT MAX(age_months) as age FROM milestones WHERE age_months <= ${months}`,
  );
  const nextBucket = db.get<{ age: number } | undefined>(
    sql`SELECT MIN(age_months) as age FROM milestones WHERE age_months > ${months}`,
  );
  const relevantMilestones = db
    .select({
      id: milestones.id,
      domain: milestones.domain,
      ageMonths: milestones.ageMonths,
      description: milestones.description,
    })
    .from(milestones)
    .where(sql`age_months IN (${bucket?.age ?? months}, ${nextBucket?.age ?? months})`)
    .all();

  const recentQuestions = db
    .select({ content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.role, "user"))
    .orderBy(desc(chatMessages.id))
    .limit(25)
    .all()
    .map((q) => q.content);

  // Decomposed pipeline (see lib/skills/visitPrep.ts): each step is a small
  // structured call a local model handles reliably; the document is assembled
  // in code. Growth stays fully computed — the model never touches numbers.
  const themes = await summarizeConcernThemes(recentQuestions, concerns, months);
  const talkingPoints = await pickTalkingPoints(relevantMilestones, months);
  const questions = await draftDoctorQuestions({ months, themes, growthLines, concerns });
  const snapshot = await writeSnapshot({
    name: child.name,
    months,
    growthSummary:
      growthLines.length > 0
        ? `tracking around the percentiles just measured — ${growthLines[0]}`
        : null,
    themeCount: themes.length,
  });

  const contentMd = assembleVisitBrief({ snapshot, growthLines, talkingPoints, questions });

  const brief = db
    .insert(visitPreps)
    .values({
      childId: child.id,
      ageMonths: months,
      inputs: { sex, weightKg, lengthCm, hcCm, concerns },
      contentMd,
    })
    .returning()
    .get();

  return NextResponse.json({ brief });
};
