/**
 * Classes — a title earned at visible total-level gates, never a lock.
 *
 * A class = affinity x style. Affinity is the top discipline by XP; style is
 * read off behavior ratios over the whole log. At each gate the player is
 * offered the two best-fitting pairings plus, if they earned a hidden habit
 * achievement, one wildcard. Offers queue and are revealed on the next map
 * screen (never mid-lesson), with a soft 14-day deadline: past it the next
 * map load takes the first option on their behalf, logged `defaulted`.
 *
 * Perks are data on the class def. Only Scout's `fog_bonus` is wired (see
 * game.ts revealedNodeIds); the rest ship inert with their copy, so a perk
 * can only ever nudge a habit.
 */
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { DB } from "../../../db/client";
import {
  atlasAchievements,
  atlasClassOffers,
  atlasDisciplines,
  type AtlasDiscipline,
} from "../../../db/schema";
import { eventData, logEvent, type EventRow } from "../events";
import { loadPlayerState, branchOf, type PlayerNode, type PlayerState } from "./data";

/** Total-level gates (total = sum of the five discipline levels, floor 5). */
export const CLASS_GATES = [10, 20, 35, 55, 80, 120, 160, 200] as const;

/** An offer waits until the log says something: this many events, branches. */
export const SIGNAL_FLOOR = { events: 25, branches: 2 } as const;

export const OFFER_DEADLINE_DAYS = 14;

export type Perk = { id: string; copy: string };

export type ClassOption = {
  classId: string;
  title: string;
  affinity: string;
  style: string;
  blurb: string;
  perk: Perk;
};

const AFFINITIES: Record<AtlasDiscipline, { label: string; blurb: string }> = {
  reasoning: { label: "Analytic", blurb: "pulls arguments apart to see how they stand" },
  evidence: { label: "Empirical", blurb: "trusts what can be checked" },
  language: { label: "Lyrical", blurb: "follows ideas through the words that carry them" },
  systems: { label: "Systemic", blurb: "sees how the parts hold each other up" },
  creativity: { label: "Inventive", blurb: "makes new things out of old questions" },
};

export const STYLES = ["scout", "scholar", "skeptic", "synthesist"] as const;
export type Style = (typeof STYLES)[number];

const STYLE_DEFS: Record<Style, { label: string; blurb: string; perk: Perk }> = {
  scout: {
    label: "Scout",
    blurb: "ranges wide, opening branch after branch",
    perk: {
      id: "fog_bonus",
      copy: "Fog peeks one extra entry in every branch you have not explored yet.",
    },
  },
  scholar: {
    label: "Scholar",
    blurb: "goes for the long version every time",
    perk: {
      id: "deepdive_nudge",
      copy: "Deep dives get a gentle bookmark on the entries you have already studied.",
    },
  },
  skeptic: {
    label: "Skeptic",
    blurb: "tests the answer before believing it",
    perk: {
      id: "quiz_nudge",
      copy: "Entries you have read but not yet verified get a quiet reminder.",
    },
  },
  synthesist: {
    label: "Synthesist",
    blurb: "crosses between branches in a single sitting",
    perk: {
      id: "bridge_nudge",
      copy: "Entries that link two of your branches get a small bridge marker.",
    },
  },
};

/** Hidden-habit wildcards; achievements.ts names these in `wildcard`. */
export const WILDCARD_CLASS_IDS = {
  dawn: "dawn-herald",
  night: "night-watch",
  phoenix: "phoenix",
} as const;

const WILDCARDS: Record<string, ClassOption> = {
  [WILDCARD_CLASS_IDS.dawn]: {
    classId: WILDCARD_CLASS_IDS.dawn,
    title: "Dawn Herald",
    affinity: "Dawn",
    style: "Herald",
    blurb: "reads while the rest of the house is asleep",
    perk: { id: "dawn_nudge", copy: "A quiet good-morning line waits on early maps." },
  },
  [WILDCARD_CLASS_IDS.night]: {
    classId: WILDCARD_CLASS_IDS.night,
    title: "Night Watch",
    affinity: "Night",
    style: "Watch",
    blurb: "keeps the lamp lit long after bedtime should have started",
    perk: { id: "night_nudge", copy: "Late maps get a gentle wind-down line." },
  },
  [WILDCARD_CLASS_IDS.phoenix]: {
    classId: WILDCARD_CLASS_IDS.phoenix,
    title: "Phoenix",
    affinity: "Risen",
    style: "Phoenix",
    blurb: "misses, regroups, and passes anyway",
    perk: { id: "retry_nudge", copy: "A missed quiz comes with an extra-warm retry line." },
  },
};

const pairId = (d: AtlasDiscipline, s: Style) => `${AFFINITIES[d].label.toLowerCase()}-${s}`;

const pairOption = (d: AtlasDiscipline, s: Style): ClassOption => ({
  classId: pairId(d, s),
  title: `${AFFINITIES[d].label} ${STYLE_DEFS[s].label}`,
  affinity: AFFINITIES[d].label,
  style: STYLE_DEFS[s].label,
  blurb: `${STYLE_DEFS[s].label}: ${STYLE_DEFS[s].blurb}. ${AFFINITIES[d].label}: ${AFFINITIES[d].blurb}.`,
  perk: STYLE_DEFS[s].perk,
});

const CLASS_TABLE = new Map<string, ClassOption>([
  ...atlasDisciplines.flatMap((d) =>
    STYLES.map((s): [string, ClassOption] => [pairId(d, s), pairOption(d, s)]),
  ),
  ...Object.entries(WILDCARDS),
]);

export const classDef = (classId: string): ClassOption | null => CLASS_TABLE.get(classId) ?? null;

// -- behavior ----------------------------------------------------------------

/** What counts as "being active" on a day. */
const ACTIVITY_VERBS = ["open_node", "read_rung", "pass_quiz", "fail_quiz"];

/** A ratio at its baseline scores 1.0; baselines put the four styles on one scale. */
export const STYLE_BASELINE: Record<Style, number> = {
  scout: 0.5,
  scholar: 0.25,
  skeptic: 1,
  synthesist: 0.5,
};

export type Behavior = {
  /** Branches opened / branches on the maps touched. */
  scout: number;
  /** Deep-dive reads / all reads. */
  scholar: number;
  /** Quiz attempts / distinct nodes read. */
  skeptic: number;
  /** Active days touching >= 2 branches / active days. */
  synthesist: number;
  eventCount: number;
  branchesTouched: number;
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const behaviorOf = (
  events: readonly EventRow[],
  nodes: readonly PlayerNode[],
): Behavior => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const touched = new Set<number>();
  const maps = new Set<number>();
  const readNodes = new Set<number>();
  const days = new Map<string, Set<number>>();
  let reads = 0;
  let deep = 0;
  let attempts = 0;
  for (const e of events) {
    const node = e.nodeId === null ? undefined : byId.get(e.nodeId);
    if (node && ACTIVITY_VERBS.includes(e.verb)) {
      touched.add(branchOf(node));
      maps.add(node.mapId);
      const day = days.get(dayKey(e.createdAt)) ?? new Set<number>();
      day.add(branchOf(node));
      days.set(dayKey(e.createdAt), day);
    }
    if (e.verb === "read_rung" && node) {
      reads += 1;
      readNodes.add(node.id);
      if (eventData(e).level === "deepdive") deep += 1;
    }
    if (e.verb === "pass_quiz" || e.verb === "fail_quiz") attempts += 1;
  }
  const branchesOnMaps = nodes.filter((n) => n.parentId === null && maps.has(n.mapId)).length;
  const crossDays = [...days.values()].filter((s) => s.size >= 2).length;
  return {
    scout: branchesOnMaps === 0 ? 0 : touched.size / branchesOnMaps,
    scholar: reads === 0 ? 0 : deep / reads,
    skeptic: readNodes.size === 0 ? 0 : attempts / readNodes.size,
    synthesist: days.size === 0 ? 0 : crossDays / days.size,
    eventCount: events.length,
    branchesTouched: touched.size,
  };
};

export const styleScores = (b: Behavior): Record<Style, number> =>
  Object.fromEntries(STYLES.map((s) => [s, b[s] / STYLE_BASELINE[s]])) as Record<Style, number>;

export type Ranked = { discipline: AtlasDiscipline; style: Style; score: number };

/**
 * Every affinity x style pairing, best first: the affinity's share of all
 * discipline XP times the style score. Ties fall to declaration order, so
 * an empty log still ranks deterministically.
 */
export const rankPairings = (state: PlayerState, b: Behavior): Ranked[] => {
  const scores = styleScores(b);
  const totalXp = atlasDisciplines.reduce((sum, d) => sum + state.disciplines[d].xp, 0);
  const share = (d: AtlasDiscipline) => (totalXp === 0 ? 1 : state.disciplines[d].xp / totalXp);
  const all: Ranked[] = atlasDisciplines.flatMap((d) =>
    STYLES.map((s) => ({ discipline: d, style: s, score: share(d) * scores[s] })),
  );
  // Array.sort is stable: equal scores keep declaration order.
  return all.sort((a, b2) => b2.score - a.score);
};

export const meetsSignalFloor = (b: Behavior): boolean =>
  b.eventCount >= SIGNAL_FLOOR.events && b.branchesTouched >= SIGNAL_FLOOR.branches;

/** The first wildcard achievement whose class was never actually chosen. */
export const unconsumedWildcard = (db: DB, playerId: number): ClassOption | null => {
  const chosen = new Set(
    db
      .select({ choice: atlasClassOffers.choice })
      .from(atlasClassOffers)
      .where(
        and(
          eq(atlasClassOffers.playerId, playerId),
          inArray(atlasClassOffers.status, ["accepted", "expired"]),
          isNotNull(atlasClassOffers.choice),
        ),
      )
      .all()
      .map((r) => r.choice),
  );
  const rows = db
    .select({ data: atlasAchievements.data })
    .from(atlasAchievements)
    .where(eq(atlasAchievements.playerId, playerId))
    .orderBy(asc(atlasAchievements.id))
    .all();
  for (const r of rows) {
    if (!r.data) continue;
    try {
      const wildcard = (JSON.parse(r.data) as { wildcard?: unknown }).wildcard;
      if (typeof wildcard === "string" && !chosen.has(wildcard) && WILDCARDS[wildcard]) {
        return WILDCARDS[wildcard]!;
      }
    } catch {
      // Malformed data is data, not a crash.
    }
  }
  return null;
};

/** The three options for a player right now, or null below the signal floor. */
export const buildOptions = (
  db: DB,
  playerId: number,
  state: PlayerState,
): [ClassOption, ClassOption, ClassOption | null] | null => {
  const behavior = behaviorOf(state.events, state.nodes);
  if (!meetsSignalFloor(behavior)) return null;
  const [a, b] = rankPairings(state, behavior);
  return [
    pairOption(a!.discipline, a!.style),
    pairOption(b!.discipline, b!.style),
    unconsumedWildcard(db, playerId),
  ];
};

// -- offers ------------------------------------------------------------------

export type OfferRow = typeof atlasClassOffers.$inferSelect;

export type OfferPayload = {
  id: number;
  gateLevel: number;
  options: Array<ClassOption | null>;
  deadline: Date | null;
  status: OfferRow["status"];
};

export const parseOptions = (row: Pick<OfferRow, "options">): Array<ClassOption | null> => {
  try {
    const parsed = JSON.parse(row.options);
    return Array.isArray(parsed) ? (parsed as Array<ClassOption | null>) : [];
  } catch {
    return [];
  }
};

export const offerPayload = (row: OfferRow): OfferPayload => ({
  id: row.id,
  gateLevel: row.gateLevel,
  options: parseOptions(row),
  deadline: row.deadline,
  status: row.status,
});

export const insertOffer = (
  db: DB,
  playerId: number,
  gateLevel: number,
  options: Array<ClassOption | null>,
): OfferRow | null =>
  db
    .insert(atlasClassOffers)
    .values({ playerId, gateLevel, options: JSON.stringify(options) })
    .onConflictDoNothing()
    .returning()
    .get() ?? null;

/** The next gate above the current total level, or null past the last. */
export const nextGateFor = (total: number): { level: number; at: number } | null => {
  const at = CLASS_GATES.find((g) => g > total);
  return at === undefined ? null : { level: total, at };
};

/**
 * Queue an offer when the player has crossed a gate that has not been
 * offered, there is no undecided offer waiting, and the log has enough
 * signal. Only gates above every earlier offer count (respec offers sit at
 * the level they were bought, so an old gate never re-offers). Safe to call
 * after every event; returns the new row or null.
 */
export const maybeCreateOffer = (db: DB, playerId: number): OfferRow | null => {
  const offers = db
    .select()
    .from(atlasClassOffers)
    .where(eq(atlasClassOffers.playerId, playerId))
    .all();
  if (offers.some((o) => o.status === "queued" || o.status === "revealed")) return null;
  const state = loadPlayerState(db, playerId);
  const floor = offers.reduce((max, o) => Math.max(max, o.gateLevel), 0);
  const gate = [...CLASS_GATES].reverse().find((g) => g <= state.total && g > floor);
  if (gate === undefined) return null;
  const options = buildOptions(db, playerId, state);
  if (!options) return null;
  return insertOffer(db, playerId, gate, options);
};

export type CurrentClass = { id: string; title: string; offerId: number; gateLevel: number; perk: Perk | null };

/** The class from the latest accepted offer; a respec expires it, so null until re-chosen. */
export const currentClass = (db: DB, playerId: number): CurrentClass | null => {
  const row = db
    .select()
    .from(atlasClassOffers)
    .where(and(eq(atlasClassOffers.playerId, playerId), eq(atlasClassOffers.status, "accepted")))
    .orderBy(desc(atlasClassOffers.id))
    .get();
  if (!row?.choice) return null;
  const option = parseOptions(row).find((o) => o?.classId === row.choice) ?? classDef(row.choice);
  return {
    id: row.choice,
    title: option?.title ?? row.choice,
    offerId: row.id,
    gateLevel: row.gateLevel,
    perk: option?.perk ?? null,
  };
};

/** Scout's fog bonus is the one wired perk. */
export const hasFogBonus = (db: DB, playerId: number): boolean =>
  currentClass(db, playerId)?.perk?.id === STYLE_DEFS.scout.perk.id;

export type AcceptResult =
  | { ok: true; offer: OfferRow }
  | { ok: false; error: "not-found" | "not-revealed" | "bad-choice" };

export const acceptOffer = (
  db: DB,
  playerId: number,
  offerId: number,
  choice: string,
  opts: { defaulted?: boolean; now?: Date } = {},
): AcceptResult => {
  const row = db
    .select()
    .from(atlasClassOffers)
    .where(and(eq(atlasClassOffers.id, offerId), eq(atlasClassOffers.playerId, playerId)))
    .get();
  if (!row) return { ok: false, error: "not-found" };
  if (row.status !== "revealed") return { ok: false, error: "not-revealed" };
  const option = parseOptions(row).find((o) => o?.classId === choice);
  if (!option) return { ok: false, error: "bad-choice" };
  const now = opts.now ?? new Date();
  // A newer class replaces the old one; the title lives on in the event log.
  db.update(atlasClassOffers)
    .set({ status: "expired" })
    .where(and(eq(atlasClassOffers.playerId, playerId), eq(atlasClassOffers.status, "accepted")))
    .run();
  const offer = db
    .update(atlasClassOffers)
    .set({ status: "accepted", choice, decidedAt: now })
    .where(eq(atlasClassOffers.id, row.id))
    .returning()
    .get();
  logEvent(db, {
    playerId,
    verb: "accept_class",
    at: now,
    data: {
      offerId: row.id,
      classId: choice,
      title: option.title,
      gateLevel: row.gateLevel,
      ...(opts.defaulted ? { defaulted: true } : {}),
    },
  });
  return { ok: true, offer };
};

/** Past the soft deadline the first option is taken for them. Called on map load. */
export const defaultLapsedOffers = (db: DB, playerId: number, now = new Date()): number => {
  const lapsed = db
    .select()
    .from(atlasClassOffers)
    .where(and(eq(atlasClassOffers.playerId, playerId), eq(atlasClassOffers.status, "revealed")))
    .all()
    .filter((o) => o.deadline && o.deadline.getTime() < now.getTime());
  let count = 0;
  for (const o of lapsed) {
    const first = parseOptions(o)[0];
    if (first && acceptOffer(db, playerId, o.id, first.classId, { defaulted: true, now }).ok) {
      count += 1;
    }
  }
  return count;
};

/** Every class ever accepted, oldest first, straight from the permanent log. */
export const classHistory = (
  events: readonly EventRow[],
): Array<{ classId: string; title: string; gateLevel: number; defaulted: boolean; at: Date }> =>
  events
    .filter((e) => e.verb === "accept_class")
    .map((e) => {
      const d = eventData(e);
      return {
        classId: String(d.classId ?? ""),
        title: String(d.title ?? d.classId ?? ""),
        gateLevel: Number(d.gateLevel ?? 0),
        defaulted: d.defaulted === true,
        at: e.createdAt,
      };
    });
