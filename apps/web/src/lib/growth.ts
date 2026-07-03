import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { growthLms } from "../db/schema";

export type GrowthMeasure = "weight_age" | "length_age" | "hc_age" | "weight_length";
export type Sex = "male" | "female";

/**
 * LMS z-score: z = ((y/M)^L - 1) / (L*S), or ln(y/M)/S when L = 0.
 * WHO restricts weight-based z-scores beyond ±3 to limit the influence of
 * extreme measurements; for a home dashboard the raw value is fine — we clamp
 * for display instead.
 */
const lmsZ = (y: number, l: number, m: number, s: number): number =>
  l === 0 ? Math.log(y / m) / s : (Math.pow(y / m, l) - 1) / (l * s);

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 approximation). */
const normalCdf = (z: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

/**
 * Compute z-score + percentile for a measurement, interpolating LMS between
 * the two nearest x values (x = age in days, or length in cm for weight_length).
 */
export const growthPercentile = (
  db: DB,
  input: { sex: Sex; measure: GrowthMeasure; x: number; value: number },
): { z: number; percentile: number } | null => {
  const rows = db
    .select()
    .from(growthLms)
    .where(and(eq(growthLms.sex, input.sex), eq(growthLms.measure, input.measure)))
    .all();
  if (rows.length === 0) return null;

  const sorted = rows.sort((a, b) => a.x - b.x);
  if (input.x < sorted[0].x || input.x > sorted[sorted.length - 1].x) return null;

  let lo = sorted[0];
  let hi = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].x <= input.x && sorted[i + 1].x >= input.x) {
      lo = sorted[i];
      hi = sorted[i + 1];
      break;
    }
  }
  const f = hi.x === lo.x ? 0 : (input.x - lo.x) / (hi.x - lo.x);
  const l = lo.l + f * (hi.l - lo.l);
  const m = lo.m + f * (hi.m - lo.m);
  const s = lo.s + f * (hi.s - lo.s);

  const z = lmsZ(input.value, l, m, s);
  return { z, percentile: Math.round(normalCdf(z) * 1000) / 10 };
};
