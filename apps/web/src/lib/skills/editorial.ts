/**
 * Editorial planner: every night Sprout decides whether (and what) to create
 * without being asked. The DECISIONS — which character, style, and milestone
 * theme — are made in code with variety memory (avoid recent repeats); the
 * model only writes one story outline from the chosen ingredients. Skipped
 * entirely if the family already made a story today, or SPROUT_DAILY_STORY=false.
 */
import { z } from "zod";
import { desc, sql } from "drizzle-orm";
import type { DB } from "../../db/client";
import { characters, children, milestones, stories } from "../../db/schema";
import { ageInMonths, formatAge } from "../age";
import { callClaudeJson } from "../claude";
import { enqueue } from "../jobs";
import { styleKeys, ensureStyleRef } from "../styles";
import { journalContext, personalizationLine } from "./journal";

// Month (0-11) → seasonal flavor the outline can weave in. Northern hemisphere.
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

const OutlineSchema = z.object({
  title: z.string().min(3).max(120),
  outline: z.string().min(60).max(600),
});

/** Least-recently-used pick: prefer options absent from `recent`. */
const pickFresh = <T extends string>(options: T[], recent: T[]): T => {
  const unused = options.filter((o) => !recent.includes(o));
  const pool = unused.length > 0 ? unused : options;
  return pool[Math.floor(Math.random() * pool.length)];
};

export const planTonightsStory = async (db: DB): Promise<string> => {
  if (process.env.SPROUT_DAILY_STORY === "false") return "daily story disabled";

  const child = db.select().from(children).limit(1).get();
  if (!child) return "no child profile — skipping daily story";
  const charList = db.select().from(characters).all();
  if (charList.length === 0) return "no characters — skipping daily story";

  // If the family already made a story today, don't pile on.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = db.get<{ n: number }>(
    sql`SELECT COUNT(*) as n FROM stories WHERE created_at >= ${Math.floor(todayStart.getTime() / 1000)}`,
  );
  if (todayCount && todayCount.n > 0) return "a story was already created today — skipping";

  // Variety memory: the last 10 stories tell us which style, character, and
  // milestone themes to avoid repeating.
  const recent = db
    .select({ style: stories.style, characterId: stories.characterId, prompt: stories.prompt })
    .from(stories)
    .orderBy(desc(stories.id))
    .limit(10)
    .all();

  const months = ageInMonths(child.dob);
  const style = pickFresh(
    styleKeys,
    recent.map((r) => r.style).filter((s): s is string => !!s),
  );
  const characterId = Number(
    pickFresh(
      charList.map((c) => String(c.id)),
      recent.slice(0, 3).map((r) => String(r.characterId)),
    ),
  );
  const character = charList.find((c) => c.id === characterId)!;

  // Milestone frontier, minus skills any recent story already modeled.
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
  const recentPromptText = recent.map((r) => r.prompt).join(" ").toLowerCase();
  const freshFrontier = frontier.filter(
    (m) => !recentPromptText.includes(m.description.slice(0, 25).toLowerCase()),
  );
  const theme = (freshFrontier.length > 0 ? freshFrontier : frontier)[
    Math.floor(Math.random() * (freshFrontier.length > 0 ? freshFrontier : frontier).length)
  ];

  const season = SEASONAL_FLAVOR[new Date().getMonth()];
  const personal = personalizationLine(journalContext(db));

  const plan = await callClaudeJson(
    `Outline tonight's surprise bedtime story for ${child.name}, a ${formatAge(months)}-old. Main character: ${character.name} (${character.appearanceDesc}).

The story gently models: (${theme.domain}) ${theme.description}
Season right now: ${season} — let it color the setting naturally, don't force it.
${personal}

Rules:
- "Gently models" = ${character.name} experiences the skill warmly and low-stakes; never a lesson, never a moral spelled out.
- 3-4 sentences: the small situation, what ${character.name} does, how it winds down calm and sleepy.
- No peril, nothing scary, nothing sad. It must end restful.
- Compose scenes an illustrator can nail: ${character.name} alone or with ONE simple animal friend, no crowds, nothing hand-intricate.

Return STRICT JSON: { "title": string, "outline": string }`,
    OutlineSchema,
    { temperature: 0.9 },
  );

  ensureStyleRef(db, character.id, style);
  const story = db
    .insert(stories)
    .values({
      childId: child.id,
      characterId: character.id,
      title: plan.title,
      style,
      prompt: `${plan.outline} (Tonight's surprise story; gently models: ${theme.description}.)`,
      ageMonths: months,
      pageCount: 8,
    })
    .returning()
    .get();
  enqueue(db, { type: "story_text", lane: "llm", payload: { storyId: story.id }, priority: 15 });

  return `planned tonight's story #${story.id}: "${plan.title}" (${style}, models: ${theme.description.slice(0, 60)})`;
};
