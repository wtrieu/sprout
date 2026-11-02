/**
 * The Atlas event log — the single input to every reward.
 *
 * Events are append-only: nothing here updates or deletes a row, which is
 * what makes "levels never drop" true by construction (XP is a monotone
 * function of an append-only log). The verb column is plain TEXT: new verbs
 * are data, not code. Readers must never switch exhaustively on a verb —
 * unknown verbs flow through untouched so PR-D, PR2 and PR3 can add theirs
 * without a schema or code change here.
 *
 * The legacy node/rung columns (visitedAt, readCount, …) keep being written
 * by the routes — the picker and the weekly note still read them as the
 * shared "atlas memory" — but all per-player UI derives from events only.
 */
import { asc, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { atlasEvents, atlasNodes, atlasRungs } from "../../db/schema";

/**
 * The verbs PR-C and PR-D write. A reference list, not a contract: the schema
 * accepts any verb, and code treats this as documentation plus typo-safety
 * at call sites, never as an exhaustive set.
 */
export const KNOWN_VERBS = [
  "create_character",
  "choose_persona",
  "open_node",
  "read_rung",
  "pass_quiz",
  "fail_quiz",
  "skip_branch",
  "unskip_branch",
  // PR-D: the engine's verbs. Rewards, offers and reveals are events too.
  "grant_achievement",
  "reveal_loot",
  "offer_class",
  "accept_class",
  "use_item",
  "reveal_node",
  "equip",
  // PR2: the weekly note's own record, one household-wide event per player
  // ({ pickId, nodeId, weekStart, via, household: true }); not a player action.
  "frontier_note",
] as const;
export type KnownVerb = (typeof KNOWN_VERBS)[number];

export type EventRow = typeof atlasEvents.$inferSelect;

export type LogEventInput = {
  playerId: number;
  verb: KnownVerb | (string & {});
  mapId?: number | null;
  nodeId?: number | null;
  data?: Record<string, unknown> | null;
  /** Event time; defaults to now. The legacy import backdates with this. */
  at?: Date;
};

export const logEvent = (db: DB, input: LogEventInput): EventRow =>
  db
    .insert(atlasEvents)
    .values({
      playerId: input.playerId,
      verb: input.verb,
      mapId: input.mapId ?? null,
      nodeId: input.nodeId ?? null,
      data: input.data ? JSON.stringify(input.data) : null,
      createdAt: input.at ?? new Date(),
    })
    .returning()
    .get();

export const eventsForPlayer = (db: DB, playerId: number): EventRow[] =>
  db
    .select()
    .from(atlasEvents)
    .where(eq(atlasEvents.playerId, playerId))
    .orderBy(asc(atlasEvents.id))
    .all();

/** Parse an event's JSON payload; malformed data is data, never a crash. */
export const eventData = (e: Pick<EventRow, "data">): Record<string, unknown> => {
  if (!e.data) return {};
  try {
    const parsed = JSON.parse(e.data);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/**
 * Import pre-player progress as events: every visited node becomes an
 * open_node at its visitedAt, every read rung a read_rung at its readAt,
 * all marked { imported: true }. Runs once, for the first character created
 * (the caller checks the players table was empty) — the second character
 * starts fresh. Returns how many events were written.
 */
export const importLegacyProgress = (db: DB, playerId: number): number => {
  let count = 0;
  const nodes = db
    .select({
      id: atlasNodes.id,
      mapId: atlasNodes.mapId,
      visitedAt: atlasNodes.visitedAt,
    })
    .from(atlasNodes)
    .all();
  const mapOf = new Map(nodes.map((n) => [n.id, n.mapId]));
  for (const n of nodes) {
    if (!n.visitedAt) continue;
    logEvent(db, {
      playerId,
      verb: "open_node",
      mapId: n.mapId,
      nodeId: n.id,
      data: { imported: true },
      at: n.visitedAt,
    });
    count += 1;
  }
  const rungs = db
    .select({ nodeId: atlasRungs.nodeId, level: atlasRungs.level, readAt: atlasRungs.readAt })
    .from(atlasRungs)
    .all();
  for (const r of rungs) {
    if (!r.readAt) continue;
    logEvent(db, {
      playerId,
      verb: "read_rung",
      mapId: mapOf.get(r.nodeId) ?? null,
      nodeId: r.nodeId,
      data: { level: r.level, imported: true },
      at: r.readAt,
    });
    count += 1;
  }
  return count;
};
