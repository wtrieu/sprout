/**
 * What is waiting for the next map screen: queued achievements (with their
 * loot), an undecided class offer, and any level-ups since the last one the
 * player saw. Nothing reveals mid-lesson — the node page never reads this;
 * the map does, and POSTs /reveals when the modal opens, which is what flips
 * queued to revealed and starts the offer's soft deadline.
 *
 * Level-ups have no row to flip: levels are derived from the log, never
 * stored. So their watermark lives in the log too — a `reveal_level` event
 * whose `throughEventId` says "every event up to here has had its level-up
 * shown" (the same move as `reveal_loot`, minus the row). The pending
 * level-up is what the whole log earns minus what the acknowledged prefix
 * earned, both on today's node set, so a node added to a branch never shows
 * up as a level change (and never as a drop). With no watermark the baseline
 * is the empty log — level 1 everywhere, the floor every character starts
 * at — the same as achievements, which the base sweep grants retroactively
 * and the first map visit reveals. A brand-new character has nothing to show.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../../../db/client";
import {
  atlasAchievements,
  atlasClassOffers,
  atlasDisciplines,
  type AtlasDiscipline,
} from "../../../db/schema";
import { eventData, logEvent, type EventRow } from "../events";
import { branchLevels, deriveTiers, disciplineLevels, totalLevel } from "../game";
import { itemsByAchievement } from "./achievements";
import { OFFER_DEADLINE_DAYS, offerPayload, parseOptions, type OfferPayload } from "./classes";
import { loadPlayerState, type PlayerNode, type PlayerState } from "./data";

export type PendingAchievement = {
  id: number;
  slug: string;
  title: string;
  flavor: string;
  hidden: boolean;
  items: Array<{ id: number; kind: string; ref: string | null }>;
};

/** The verb that acknowledges a level-up; its data carries the watermark. */
export const LEVEL_ACK_VERB = "reveal_level";

export type LevelChange = { from: number; to: number };

/**
 * Everything that levelled up since the last acknowledged level-up, as one
 * reveal step. Self-describing: `kind` names the step, and the ack carries
 * `throughEventId` back (POST /api/atlas/reveals/level-up) so a level earned
 * after the modal opened is never swallowed by acknowledging this one.
 */
export type PendingLevelUp = {
  kind: "level_up";
  throughEventId: number;
  /** The account-wide total level (sum of the five disciplines). */
  total: LevelChange;
  /** Only disciplines that rose, in the fixed discipline order. */
  disciplines: Array<{ discipline: AtlasDiscipline } & LevelChange>;
  /** Only branches that rose, on any map, in node order. */
  branches: Array<{ nodeId: number; mapId: number; title: string } & LevelChange>;
};

export type Pending = {
  achievements: PendingAchievement[];
  offer: OfferPayload | null;
  levelUp: PendingLevelUp | null;
};

/** The highest acknowledged event id (0 = never acknowledged). Monotone. */
export const levelWatermark = (events: readonly EventRow[]): number => {
  let mark = 0;
  for (const e of events) {
    if (e.verb !== LEVEL_ACK_VERB) continue;
    const through = eventData(e).throughEventId;
    if (typeof through === "number" && Number.isInteger(through) && through > mark) mark = through;
  }
  return mark;
};

const lastEventId = (events: readonly EventRow[]): number =>
  events.reduce((max, e) => Math.max(max, e.id), 0);

const levelsAt = (nodes: readonly PlayerNode[], events: readonly EventRow[], through: number) => {
  const tiers = deriveTiers(events.filter((e) => e.id <= through));
  const disciplines = disciplineLevels(nodes, tiers);
  return { disciplines, total: totalLevel(disciplines), branches: branchLevels(nodes, tiers) };
};

type LevelState = Pick<PlayerState, "events" | "nodes">;

/**
 * The level-up between two points of the log (event ids, inclusive), or
 * null when nothing rose. Both sides use the same node set and the log is
 * append-only, so every change is a rise: levels never drop.
 */
export const levelUpBetween = (
  state: LevelState,
  fromEventId: number,
  throughEventId: number,
): PendingLevelUp | null => {
  if (throughEventId <= fromEventId) return null;
  const before = levelsAt(state.nodes, state.events, fromEventId);
  const after = levelsAt(state.nodes, state.events, throughEventId);
  const disciplines = atlasDisciplines
    .map((d) => ({ discipline: d, from: before.disciplines[d].level, to: after.disciplines[d].level }))
    .filter((c) => c.to > c.from);
  const beforeBranch = new Map(before.branches.map((b) => [b.nodeId, b.level]));
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  const branches = after.branches.flatMap((b) => {
    const from = beforeBranch.get(b.nodeId) ?? 1;
    const node = byId.get(b.nodeId);
    return node && b.level > from
      ? [{ nodeId: b.nodeId, mapId: node.mapId, title: node.title, from, to: b.level }]
      : [];
  });
  if (disciplines.length === 0 && branches.length === 0) return null;
  return {
    kind: "level_up",
    throughEventId,
    total: { from: before.total, to: after.total },
    disciplines,
    branches,
  };
};

/** The level-up waiting to be shown, if any. */
export const pendingLevelUp = (state: LevelState): PendingLevelUp | null =>
  levelUpBetween(state, levelWatermark(state.events), lastEventId(state.events));

/**
 * The modal showed a level-up through `throughEventId`: log `reveal_level`
 * so it never shows again. Clamped to the player's own log (a client can't
 * pre-acknowledge levels not yet earned); at or below the current watermark
 * it is a no-op. Returns what was acknowledged (null when nothing was).
 */
export const acknowledgeLevelUp = (
  db: DB,
  playerId: number,
  throughEventId: number,
  now = new Date(),
): PendingLevelUp | null => {
  const state = loadPlayerState(db, playerId);
  const mark = levelWatermark(state.events);
  const through = Math.min(Math.floor(throughEventId), lastEventId(state.events));
  if (!Number.isFinite(through) || through <= mark) return null;
  const shown = levelUpBetween(state, mark, through);
  logEvent(db, {
    playerId,
    verb: LEVEL_ACK_VERB,
    at: now,
    data: {
      throughEventId: through,
      totalFrom: shown?.total.from ?? null,
      totalTo: shown?.total.to ?? null,
    },
  });
  return shown;
};

export const pendingFor = (db: DB, playerId: number): Pending => {
  const rows = db
    .select()
    .from(atlasAchievements)
    .where(and(eq(atlasAchievements.playerId, playerId), isNull(atlasAchievements.revealedAt)))
    .orderBy(asc(atlasAchievements.id))
    .all();
  const items = itemsByAchievement(
    db,
    playerId,
    rows.map((r) => r.id),
  );
  const offer = db
    .select()
    .from(atlasClassOffers)
    .where(
      and(
        eq(atlasClassOffers.playerId, playerId),
        inArray(atlasClassOffers.status, ["queued", "revealed"]),
      ),
    )
    .orderBy(asc(atlasClassOffers.id))
    .get();
  return {
    achievements: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      flavor: r.flavor,
      hidden: r.hidden,
      items: items.get(r.id) ?? [],
    })),
    offer: offer ? offerPayload(offer) : null,
    levelUp: pendingLevelUp(loadPlayerState(db, playerId)),
  };
};

/**
 * Mark everything queued as revealed (once), log it, and return the set the
 * modal shows: the achievements revealed just now, the undecided offer, and
 * the pending level-up.
 *
 * The level-up is acknowledged only when the caller passes the
 * `levelUpThrough` it actually showed (the payload's `throughEventId`): a
 * modal that does not render level-ups must not swallow them by opening a
 * chest.
 */
export const revealPending = (
  db: DB,
  playerId: number,
  now = new Date(),
  opts: { levelUpThrough?: number } = {},
): Pending => {
  const before = pendingFor(db, playerId);
  for (const a of before.achievements) {
    db.update(atlasAchievements)
      .set({ revealedAt: now })
      .where(and(eq(atlasAchievements.id, a.id), isNull(atlasAchievements.revealedAt)))
      .run();
    logEvent(db, {
      playerId,
      verb: "reveal_loot",
      at: now,
      data: { achievementId: a.id, slug: a.slug, itemIds: a.items.map((i) => i.id) },
    });
  }
  let offer = before.offer;
  if (offer?.status === "queued") {
    const deadline = new Date(now.getTime() + OFFER_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
    const row = db
      .update(atlasClassOffers)
      .set({ status: "revealed", deadline })
      .where(eq(atlasClassOffers.id, offer.id))
      .returning()
      .get();
    logEvent(db, {
      playerId,
      verb: "offer_class",
      at: now,
      data: {
        offerId: row.id,
        gateLevel: row.gateLevel,
        classIds: parseOptions(row).flatMap((o) => (o ? [o.classId] : [])),
        deadline: deadline.toISOString(),
      },
    });
    offer = offerPayload(row);
  }
  if (opts.levelUpThrough !== undefined) {
    acknowledgeLevelUp(db, playerId, opts.levelUpThrough, now);
  }
  return { achievements: before.achievements, offer, levelUp: before.levelUp };
};
