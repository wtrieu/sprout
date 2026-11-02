/**
 * Achievements, base half — a small hand-written, deterministic rule set over
 * the event log (the nightly model pass in engine.ts adds the hidden
 * one-offs on top). Every rule is a pure function of `(events, nodes)`, so
 * it can fire the moment an event earns it and still be swept again at
 * night without double-granting: the unique (playerId, slug) index makes a
 * grant idempotent by construction.
 *
 * A grant stores the achievement, rolls its loot box (loot.ts), and logs
 * `grant_achievement`. Nothing is shown here: grants queue (revealedAt null)
 * and surface on the next map screen, never mid-lesson.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "../../../db/client";
import {
  atlasAchievements,
  atlasDisciplines,
  atlasItems,
  atlasPlayers,
  type AtlasAchievementSource,
  type AtlasPersona,
} from "../../../db/schema";
import { eventData, logEvent, type EventRow } from "../events";
import { branchLevels, fieldLevel, type NodeTier } from "../game";
import { WILDCARD_CLASS_IDS } from "./classes";
import { loadPlayerState, type PlayerNode } from "./data";
import { lootSeed, rollLoot, type LootDrop } from "./loot";

export type RuleContext = {
  events: readonly EventRow[];
  nodes: readonly PlayerNode[];
  tiers: Map<number, NodeTier>;
};

export type BaseRule = {
  slug: string;
  title: string;
  hidden: boolean;
  /** A class id this achievement unlocks as the third offer option. */
  wildcard?: string;
  /** The persona-voiced line. */
  flavor: Record<AtlasPersona, string>;
  /** Basis event ids when earned, null when not. */
  check: (ctx: RuleContext) => number[] | null;
};

const RUNG_LEVELS = ["eli10", "onepager", "deepdive"];

const reads = (events: readonly EventRow[]) =>
  events.filter(
    (e) =>
      e.verb === "read_rung" && RUNG_LEVELS.includes(String(eventData(e).level ?? "")),
  );

const firstOf = (events: readonly EventRow[], verb: string): number[] | null => {
  const hit = events.find((e) => e.verb === verb);
  return hit ? [hit.id] : null;
};

/** Nodes with a pass, and the pass events that mastered them first. */
const firstPasses = (events: readonly EventRow[]): EventRow[] => {
  const seen = new Set<number>();
  const out: EventRow[] = [];
  for (const e of events) {
    if (e.verb !== "pass_quiz" || e.nodeId === null || seen.has(e.nodeId)) continue;
    seen.add(e.nodeId);
    out.push(e);
  }
  return out;
};

const masteries = (count: number) => (ctx: RuleContext) => {
  const passes = firstPasses(ctx.events);
  return passes.length >= count ? passes.slice(0, count).map((e) => e.id) : null;
};

/** Reads whose local hour satisfies `inWindow`; earned at three. */
const readsAtHour = (inWindow: (hour: number) => boolean) => (ctx: RuleContext) => {
  const hits = reads(ctx.events).filter((e) => inWindow(e.createdAt.getHours()));
  return hits.length >= 3 ? hits.slice(0, 3).map((e) => e.id) : null;
};

/** Twelve rules: counts over the log, levels off the same tier fold, and three hidden habits. */
export const BASE_RULES: readonly BaseRule[] = [
  {
    slug: "first-open",
    title: "First Footstep",
    hidden: false,
    flavor: {
      cartographer: "You opened an entry. I have noted the date, the hour, and my cautious optimism.",
      protege: "You opened something! I wrote it down so I will remember to be excited.",
    },
    check: (ctx) => firstOf(ctx.events, "open_node"),
  },
  {
    slug: "first-stamp",
    title: "First Stamp",
    hidden: false,
    flavor: {
      cartographer: "A rung read to the bottom. The archive grants you its first, grudging stamp.",
      protege: "You read a whole page and I learned from it! Stamp stamp stamp.",
    },
    check: (ctx) => {
      const first = reads(ctx.events)[0];
      return first ? [first.id] : null;
    },
  },
  {
    slug: "first-mastery",
    title: "Verified",
    hidden: false,
    flavor: {
      cartographer: "Quiz passed, entry verified. It is now fact rather than rumor. Savor that.",
      protege: "You passed the quiz, so now I know it too. That is how this works, right?",
    },
    check: (ctx) => firstOf(ctx.events, "pass_quiz"),
  },
  {
    slug: "five-masteries",
    title: "Five Entries Deep",
    hidden: false,
    flavor: {
      cartographer: "Five verified entries. The shelf no longer leans; it merely tilts.",
      protege: "Five things I definitely know now! I counted twice. Three times.",
    },
    check: masteries(5),
  },
  {
    slug: "fifteen-masteries",
    title: "Fifteen and Counting",
    hidden: false,
    flavor: {
      cartographer: "Fifteen verified entries. I have had to buy a second drawer.",
      protege: "Fifteen! My skill tree is getting top-heavy. Good problem.",
    },
    check: masteries(15),
  },
  {
    slug: "first-deep-dive",
    title: "Into the Deep",
    hidden: false,
    flavor: {
      cartographer: "You read the long version, voluntarily. Rare. Frame this moment.",
      protege: "You went all the way down! Did you see anything? Was it dark?",
    },
    check: (ctx) => {
      const hit = reads(ctx.events).find((e) => eventData(e).level === "deepdive");
      return hit ? [hit.id] : null;
    },
  },
  {
    slug: "branch-50",
    title: "Halfway Charted",
    hidden: false,
    flavor: {
      cartographer: "A branch past level 50. The margins finally have something to say.",
      protege: "One whole branch is past halfway! I can feel it in my roots.",
    },
    check: (ctx) =>
      branchLevels(ctx.nodes, ctx.tiers).some((b) => b.level >= 50) ? [] : null,
  },
  {
    slug: "first-cape",
    title: "Cape Earned",
    hidden: false,
    flavor: {
      cartographer: "A whole field at level 99. I am issuing a cape and pretending I am not moved.",
      protege: "Every branch at 99! There is a cape. A real one. I am holding it very carefully.",
    },
    check: (ctx) => {
      const byMap = new Map<number, PlayerNode[]>();
      for (const n of ctx.nodes) byMap.set(n.mapId, [...(byMap.get(n.mapId) ?? []), n]);
      for (const nodes of byMap.values()) {
        const branches = branchLevels(nodes, ctx.tiers);
        const field = fieldLevel(branches);
        if (field.capeEarned) return [];
      }
      return null;
    },
  },
  {
    slug: "all-disciplines",
    title: "Well-Rounded",
    hidden: false,
    flavor: {
      cartographer: "A verified entry in all five disciplines. Balanced, if suspiciously so.",
      protege: "Reasoning, evidence, language, systems, creativity: I know a bit of each now!",
    },
    check: (ctx) => {
      const covered = new Set<string>();
      for (const n of ctx.nodes) {
        if (n.discipline && ctx.tiers.get(n.id)?.mastered) covered.add(n.discipline);
      }
      return atlasDisciplines.every((d) => covered.has(d)) ? [] : null;
    },
  },
  {
    slug: "dawn-reader",
    title: "Dawn Reader",
    hidden: true,
    wildcard: WILDCARD_CLASS_IDS.dawn,
    flavor: {
      cartographer: "Three readings before six in the morning. Even the dust was still asleep.",
      protege: "You read before the sun was up! I was awake too. Sort of. Mostly.",
    },
    check: readsAtHour((h) => h < 6),
  },
  {
    slug: "night-owl",
    title: "Night Owl",
    hidden: true,
    wildcard: WILDCARD_CLASS_IDS.night,
    flavor: {
      cartographer: "Three readings after eleven at night. The lamp and I salute you. Now sleep.",
      protege: "Late-night reading! I whispered so I wouldn't wake the footnotes.",
    },
    check: readsAtHour((h) => h >= 23),
  },
  {
    slug: "comeback",
    title: "The Comeback",
    hidden: true,
    wildcard: WILDCARD_CLASS_IDS.phoenix,
    flavor: {
      cartographer: "Three misses, then a pass on the same entry. The record shows grit.",
      protege: "You missed three times and then got it! I was cheering the whole time.",
    },
    check: (ctx) => {
      const fails = new Map<number, number>();
      for (const e of ctx.events) {
        if (e.nodeId === null) continue;
        if (e.verb === "fail_quiz") fails.set(e.nodeId, (fails.get(e.nodeId) ?? 0) + 1);
        else if (e.verb === "pass_quiz" && (fails.get(e.nodeId) ?? 0) >= 3) return [e.id];
      }
      return null;
    },
  },
];

/** Slugs the base rules own; the model pass may not squat on them. */
export const BASE_SLUGS: ReadonlySet<string> = new Set(BASE_RULES.map((r) => r.slug));

export type GrantInput = {
  slug: string;
  title: string;
  flavor: string;
  source: AtlasAchievementSource;
  hidden: boolean;
  data?: Record<string, unknown>;
};

export type GrantedAchievement = {
  id: number;
  slug: string;
  title: string;
  hidden: boolean;
  items: Array<LootDrop & { id: number }>;
};

/** Refs of every cosmetic the player has ever been given (consumed or not). */
export const ownedRefs = (db: DB, playerId: number): string[] =>
  db
    .select({ ref: atlasItems.ref })
    .from(atlasItems)
    .where(eq(atlasItems.playerId, playerId))
    .all()
    .flatMap((r) => (r.ref ? [r.ref] : []));

export const slugsOf = (db: DB, playerId: number): Set<string> =>
  new Set(
    db
      .select({ slug: atlasAchievements.slug })
      .from(atlasAchievements)
      .where(eq(atlasAchievements.playerId, playerId))
      .all()
      .map((r) => r.slug),
  );

/**
 * Store one achievement and its loot, once. Insert-or-ignore on the unique
 * (playerId, slug) index: a second call returns null and writes nothing.
 */
export const grantAchievement = (
  db: DB,
  playerId: number,
  input: GrantInput,
): GrantedAchievement | null =>
  // One transaction: an achievement can never exist without its loot.
  db.transaction((tx) => {
    const t = tx as unknown as DB;
    const row = t
      .insert(atlasAchievements)
      .values({
        playerId,
        slug: input.slug,
        title: input.title,
        flavor: input.flavor,
        source: input.source,
        hidden: input.hidden,
        data: input.data ? JSON.stringify(input.data) : null,
      })
      .onConflictDoNothing()
      .returning()
      .get();
    if (!row) return null;
    const drops = rollLoot(lootSeed(playerId, input.slug), ownedRefs(t, playerId), {
      hidden: input.hidden,
    });
    const items = drops.map((d) => ({
      ...d,
      id: t
        .insert(atlasItems)
        .values({ playerId, achievementId: row.id, kind: d.kind, ref: d.ref })
        .returning({ id: atlasItems.id })
        .get().id,
    }));
    logEvent(t, {
      playerId,
      verb: "grant_achievement",
      data: {
        achievementId: row.id,
        slug: input.slug,
        source: input.source,
        hidden: input.hidden,
        items: items.map((i) => ({ id: i.id, kind: i.kind, ref: i.ref })),
      },
    });
    return { id: row.id, slug: row.slug, title: row.title, hidden: row.hidden, items };
  });

/**
 * Loot is invisible until its chest is opened: an item is usable and
 * visible when it came from no achievement or from a revealed one.
 */
export const isItemRevealed = (db: DB, item: { achievementId: number | null }): boolean => {
  if (item.achievementId === null) return true;
  const a = db
    .select({ revealedAt: atlasAchievements.revealedAt })
    .from(atlasAchievements)
    .where(eq(atlasAchievements.id, item.achievementId))
    .get();
  // A deleted achievement nulls the link (set null), so a missing row is also free loot.
  return !a || a.revealedAt !== null;
};

/**
 * Evaluate every base rule for one player and grant what is newly earned.
 * Called after every event write (hooks.ts) and swept by the nightly run;
 * safe to call as often as you like.
 */
export const checkBaseAchievements = (
  db: DB,
  playerId: number,
): GrantedAchievement[] => {
  const player = db.select().from(atlasPlayers).where(eq(atlasPlayers.id, playerId)).get();
  if (!player) return [];
  const persona = player.persona;
  const state = loadPlayerState(db, playerId);
  const have = slugsOf(db, playerId);
  const granted: GrantedAchievement[] = [];
  for (const rule of BASE_RULES) {
    if (have.has(rule.slug)) continue;
    const basis = rule.check(state);
    if (!basis) continue;
    const g = grantAchievement(db, playerId, {
      slug: rule.slug,
      title: rule.title,
      flavor: rule.flavor[persona],
      source: "base",
      hidden: rule.hidden,
      data: { basisEventIds: basis, ...(rule.wildcard ? { wildcard: rule.wildcard } : {}) },
    });
    if (g) granted.push(g);
  }
  return granted;
};

/** Items belonging to a set of achievements, grouped for payloads. */
export const itemsByAchievement = (
  db: DB,
  playerId: number,
  achievementIds: number[],
): Map<number, Array<{ id: number; kind: string; ref: string | null }>> => {
  const map = new Map<number, Array<{ id: number; kind: string; ref: string | null }>>();
  if (achievementIds.length === 0) return map;
  const rows = db
    .select()
    .from(atlasItems)
    .where(
      and(eq(atlasItems.playerId, playerId), inArray(atlasItems.achievementId, achievementIds)),
    )
    .all();
  for (const r of rows) {
    if (r.achievementId === null) continue;
    const list = map.get(r.achievementId) ?? [];
    list.push({ id: r.id, kind: r.kind, ref: r.ref });
    map.set(r.achievementId, list);
  }
  return map;
};
