import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { children } from "@/db/schema";
import { ageInDays } from "@/lib/age";
import { growthPercentile, type Sex } from "@/lib/growth";

/**
 * GET /api/growth?sex=male&weightKg=10.2&lengthCm=76&hcCm=46
 * Any subset of measurements; age comes from the child profile.
 */
export const GET = (req: NextRequest) => {
  const child = db.select().from(children).limit(1).get();
  if (!child) {
    return NextResponse.json({ error: "Set up the child profile first." }, { status: 400 });
  }
  const params = req.nextUrl.searchParams;
  const sex = (params.get("sex") ?? "male") as Sex;
  const days = ageInDays(child.dob);

  const weightKg = params.get("weightKg") ? Number(params.get("weightKg")) : null;
  const lengthCm = params.get("lengthCm") ? Number(params.get("lengthCm")) : null;
  const hcCm = params.get("hcCm") ? Number(params.get("hcCm")) : null;

  const result: Record<string, { z: number; percentile: number } | null> = {};
  if (weightKg) {
    result.weightForAge = growthPercentile(db, { sex, measure: "weight_age", x: days, value: weightKg });
  }
  if (lengthCm) {
    result.lengthForAge = growthPercentile(db, { sex, measure: "length_age", x: days, value: lengthCm });
  }
  if (hcCm) {
    result.headCircForAge = growthPercentile(db, { sex, measure: "hc_age", x: days, value: hcCm });
  }
  if (weightKg && lengthCm) {
    result.weightForLength = growthPercentile(db, {
      sex,
      measure: "weight_length",
      x: lengthCm,
      value: weightKg,
    });
  }

  return NextResponse.json({ ageDays: days, ...result });
};
