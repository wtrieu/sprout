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

/**
 * Setting bank: WHERE tonight's story lives. Chosen in code with variety
 * memory — left to the model, every July book drifts to the same beach with
 * the same fireflies (the seasonal line planted them). Keys are stored on
 * stories.setting for the LRU; the value is the scene brief fed to the writer.
 */
export const settingBank: Record<string, string> = {
  meadow: "a wide grassy meadow with tall wildflowers and humming insects",
  "deep-forest": "a mossy old forest with giant roots, ferns, and dappled light",
  pond: "a quiet lily pond with reeds, dragonflies, and slow ripples",
  garden: "a backyard vegetable garden with rows of plants and a watering can",
  farm: "a small farm with a red barn, haystacks, and sleepy animals",
  "rainy-street": "a cozy street on a rainy evening — umbrellas, puddles, warm windows",
  "snowy-hill": "a soft snowy hillside with animal tracks and pine trees",
  mountain: "a gentle mountain trail with big rocks, wind, and far-off peaks",
  riverbank: "a burbling river bank with smooth stones and overhanging willows",
  treehouse: "a little treehouse high in a leafy oak, with a rope ladder",
  "night-sky-hill": "a bare hilltop under a huge starry sky",
  orchard: "an apple orchard with ladders, baskets, and windfall fruit",
  "city-window": "a city apartment windowsill at dusk, lights coming on below",
  burrow: "a snug underground burrow with root ceilings and lantern light",
  beach: "a sandy shore with tide pools, shells, and gentle waves",
  "winter-den": "a warm den in winter — blankets, firelight, frost on the entrance",
};

export const settingKeys = Object.keys(settingBank);

/** LRU pick over the last 6 stories' settings, minus this run's picks. */
export const pickSetting = (db: DB, exclude: string[] = []): string => {
  const pool0 = settingKeys.filter((k) => !exclude.includes(k));
  const eligible = pool0.length > 0 ? pool0 : settingKeys;
  const recent = db
    .select({ setting: stories.setting })
    .from(stories)
    .orderBy(desc(stories.id))
    .limit(6)
    .all()
    .map((r) => r.setting)
    .filter((s): s is string => !!s);
  const unused = eligible.filter((k) => !recent.includes(k));
  const pool = unused.length > 0 ? unused : eligible;
  return pool[Math.floor(Math.random() * pool.length)];
};

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
