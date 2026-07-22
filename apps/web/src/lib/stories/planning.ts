/**
 * Story planning ingredients: which milestone theme to model and what season
 * it is. Decisions are made in code with variety memory (avoid recent
 * repeats); the writer only receives the chosen ingredients. Extracted from
 * the retired editorial planner — the nightly candidate generator is the
 * consumer now.
 */
import { desc, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { milestones, stories } from "../../db/schema";

// Month (0-11) → seasonal flavor the story can weave in. Northern hemisphere.
const SEASONAL_FLAVOR = [
  "deep winter — snow, frosty windows, warm blankets, hot cocoa steam",
  "late winter — melting icicles, first mild days, puddles starting",
  "early spring — buds, birdsong, rain showers, muddy boots",
  "spring — blossoms, baby animals, gardens waking up, kites",
  "late spring — long evenings, dandelions, picnic blankets",
  "early summer — sprinklers, strawberries, bare feet in grass",
  "midsummer — beach days, ice cream, fireflies, late golden light",
  "late summer — cicadas, garden harvest, warm nights",
  "early autumn — first crunchy leaves, apples, lighter jackets",
  "autumn — pumpkins, leaf piles, geese flying south, cozy sweaters",
  "late autumn — bare branches, early dusk, candles in windows",
  "early winter — first snow, twinkling lights, mittens and scarves",
];

export const seasonalFlavor = (date: Date = new Date()): string =>
  SEASONAL_FLAVOR[date.getMonth()];

/** Least-recently-used pick: prefer options absent from `recent`. */
export const pickFresh = <T extends string>(options: T[], recent: T[]): T => {
  const unused = options.filter((o) => !recent.includes(o));
  const pool = unused.length > 0 ? unused : options;
  return pool[Math.floor(Math.random() * pool.length)];
};

export type MilestoneTheme = { domain: string; description: string };

/**
 * Milestone frontier: the child's current bucket plus the next one up, minus
 * skills any recent story already modeled.
 */
export const pickMilestoneTheme = (db: DB, months: number): MilestoneTheme | null => {
  const bucket = db.get<{ age: number } | undefined>(
    sql`SELECT MAX(age_months) as age FROM milestones WHERE age_months <= ${months}`,
  );
  const nextBucket = db.get<{ age: number } | undefined>(
    sql`SELECT MIN(age_months) as age FROM milestones WHERE age_months > ${months}`,
  );
  const frontier = db
    .select({ domain: milestones.domain, description: milestones.description })
    .from(milestones)
    .where(sql`age_months IN (${bucket?.age ?? months}, ${nextBucket?.age ?? months})`)
    .all();
  if (frontier.length === 0) return null;

  const recentPromptText = db
    .select({ prompt: stories.prompt })
    .from(stories)
    .orderBy(desc(stories.id))
    .limit(10)
    .all()
    .map((r) => r.prompt)
    .join(" ")
    .toLowerCase();
  const fresh = frontier.filter(
    (m) => !recentPromptText.includes(m.description.slice(0, 25).toLowerCase()),
  );
  const pool = fresh.length > 0 ? fresh : frontier;
  return pool[Math.floor(Math.random() * pool.length)];
};
