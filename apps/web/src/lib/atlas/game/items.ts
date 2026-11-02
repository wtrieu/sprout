/**
 * Using functional loot. Three kinds today, all data-driven by `kind`:
 *
 *   respec_token   expire the accepted class, queue a fresh offer at the
 *                  current total level (refused until the level has moved
 *                  since the last offer — gates only cross once).
 *   fog_reveal     `reveal_node` events on up to three fogged nodes nearest
 *                  recent activity.
 *   rare_node_key  `reveal_node` on the nearest unrevealed rare node.
 *
 * Reveals are events, so fog stays a render rule derived from the log. A
 * failed use consumes nothing. Cosmetic kinds (frame, map_style,
 * sprite_part) are not "used" — they are equipped (loadout.ts).
 */
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../../../db/client";
import { atlasClassOffers, atlasItems } from "../../../db/schema";
import { logEvent } from "../events";
import { isItemRevealed } from "./achievements";
import {
  buildOptions,
  currentClass,
  hasFogBonus,
  insertOffer,
  type OfferRow,
} from "./classes";
import { loadPlayerState, revealedAcross, type PlayerNode, type PlayerState } from "./data";

export const FOG_REVEAL_COUNT = 3;

const ACTIVITY_VERBS = ["open_node", "read_rung", "pass_quiz", "fail_quiz"];

export type UseItemResult =
  | { ok: true; kind: string; revealed: number[]; offer: OfferRow | null }
  | {
      ok: false;
      error:
        | "not-found"
        | "not-usable"
        | "no-class"
        | "level-unchanged"
        | "offer-pending"
        | "not-enough-signal"
        | "nothing-to-reveal";
    };

/** Where the player was last: the map and branch of their latest activity. */
const anchorOf = (state: PlayerState): PlayerNode | null => {
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  for (let i = state.events.length - 1; i >= 0; i -= 1) {
    const e = state.events[i]!;
    if (e.nodeId !== null && ACTIVITY_VERBS.includes(e.verb) && byId.has(e.nodeId)) {
      return byId.get(e.nodeId)!;
    }
  }
  return null;
};

/** Order candidates by closeness to the anchor: same map, then branch distance, then position. */
const nearestFirst = (state: PlayerState, candidates: PlayerNode[]): PlayerNode[] => {
  const anchor = anchorOf(state);
  const branchIndex = new Map<number, number>();
  const branchesByMap = new Map<number, PlayerNode[]>();
  for (const n of state.nodes) {
    if (n.parentId === null) branchesByMap.set(n.mapId, [...(branchesByMap.get(n.mapId) ?? []), n]);
  }
  for (const list of branchesByMap.values()) {
    list.sort((a, b) => a.position - b.position || a.id - b.id);
    list.forEach((b, i) => branchIndex.set(b.id, i));
  }
  const anchorBranch = anchor ? (anchor.parentId ?? anchor.id) : null;
  const anchorIdx = anchorBranch === null ? 0 : (branchIndex.get(anchorBranch) ?? 0);
  const rank = (n: PlayerNode): [number, number, number, number] => {
    const sameMap = anchor && n.mapId !== anchor.mapId ? 1 : 0;
    const idx = branchIndex.get(n.parentId ?? n.id) ?? 0;
    return [sameMap, sameMap ? 0 : Math.abs(idx - anchorIdx), n.position, n.id];
  };
  return [...candidates].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
    return 0;
  });
};

const fogged = (db: DB, playerId: number, state: PlayerState): PlayerNode[] => {
  const revealed = revealedAcross(state, hasFogBonus(db, playerId));
  return state.nodes.filter((n) => n.parentId !== null && !revealed.has(n.id));
};

export const useItem = (db: DB, playerId: number, itemId: number): UseItemResult => {
  const item = db
    .select()
    .from(atlasItems)
    .where(and(eq(atlasItems.id, itemId), eq(atlasItems.playerId, playerId)))
    .get();
  if (!item) return { ok: false, error: "not-found" };
  // An unopened chest's loot does not exist yet, as far as the player can tell.
  if (!isItemRevealed(db, item)) return { ok: false, error: "not-found" };
  if (item.status !== "owned") return { ok: false, error: "not-usable" };
  const state = loadPlayerState(db, playerId);
  const now = new Date();

  const finish = (revealed: number[], offer: OfferRow | null): UseItemResult => {
    db.update(atlasItems)
      .set({ status: "consumed", consumedAt: now })
      .where(eq(atlasItems.id, item.id))
      .run();
    logEvent(db, {
      playerId,
      verb: "use_item",
      at: now,
      data: { itemId: item.id, kind: item.kind, revealed, ...(offer ? { offerId: offer.id } : {}) },
    });
    return { ok: true, kind: item.kind, revealed, offer };
  };

  const reveal = (nodes: PlayerNode[]): number[] => {
    for (const n of nodes) {
      logEvent(db, {
        playerId,
        verb: "reveal_node",
        mapId: n.mapId,
        nodeId: n.id,
        at: now,
        data: { itemId: item.id, kind: item.kind },
      });
    }
    return nodes.map((n) => n.id);
  };

  if (item.kind === "fog_reveal") {
    const picks = nearestFirst(state, fogged(db, playerId, state)).slice(0, FOG_REVEAL_COUNT);
    if (picks.length === 0) return { ok: false, error: "nothing-to-reveal" };
    return finish(reveal(picks), null);
  }

  if (item.kind === "rare_node_key") {
    const pick = nearestFirst(
      state,
      fogged(db, playerId, state).filter((n) => n.rare),
    )[0];
    if (!pick) return { ok: false, error: "nothing-to-reveal" };
    return finish(reveal([pick]), null);
  }

  if (item.kind === "respec_token") {
    const offers = db
      .select()
      .from(atlasClassOffers)
      .where(eq(atlasClassOffers.playerId, playerId))
      .orderBy(desc(atlasClassOffers.id))
      .all();
    if (offers.some((o) => o.status === "queued" || o.status === "revealed")) {
      return { ok: false, error: "offer-pending" };
    }
    const current = currentClass(db, playerId);
    if (!current) return { ok: false, error: "no-class" };
    // One offer per level: a second respec waits until the level moves.
    if (offers.some((o) => o.gateLevel === state.total)) {
      return { ok: false, error: "level-unchanged" };
    }
    const options = buildOptions(db, playerId, state);
    if (!options) return { ok: false, error: "not-enough-signal" };
    db.update(atlasClassOffers)
      .set({ status: "expired" })
      .where(eq(atlasClassOffers.id, current.offerId))
      .run();
    const offer = insertOffer(db, playerId, state.total, options);
    return finish([], offer);
  }

  return { ok: false, error: "not-usable" };
};
