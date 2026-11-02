/**
 * Progress composition — the payloads the routes attach for a signed-in
 * player. Pure math lives in game.ts; this file only loads events and nodes
 * and shapes the result. Maps are small (≤60 nodes) and the household's log
 * is short, so everything recomputes on read: no stored XP, nothing to drift.
 */
import { asc, eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { atlasAchievements, atlasItems, atlasNodes } from "../../db/schema";
import { eventsForPlayer } from "./events";
import {
  branchLevels,
  deriveTiers,
  disciplineLevels,
  fieldLevel,
  revealedByEvents,
  revealedNodeIds,
  tierFor,
  totalLevel,
  type BranchLevel,
  type DisciplineLevels,
  type FieldLevel,
  type GameNode,
  type NodeTier,
} from "./game";
import { isItemRevealed } from "./game/achievements";
import { classHistory, currentClass, hasFogBonus, nextGateFor } from "./game/classes";
import { parseLoadout, type Loadout } from "./game/loadout";
import { pendingFor, type Pending } from "./game/pending";
import { listPlayers, type PlayerRow } from "./players";
import { quizState, type QuizState } from "./quiz";

const gameNodes = (db: DB): Array<GameNode & { mapId: number }> =>
  db
    .select({
      id: atlasNodes.id,
      parentId: atlasNodes.parentId,
      discipline: atlasNodes.discipline,
      mapId: atlasNodes.mapId,
    })
    .from(atlasNodes)
    .all();

export type MapProgress = {
  playerId: number;
  tiers: Record<number, NodeTier>;
  revealed: number[];
  branches: BranchLevel[];
  field: FieldLevel;
  disciplines: DisciplineLevels;
  totalLevel: number;
};

/** Everything the map page needs about one player on one map. */
export const mapProgressFor = (db: DB, playerId: number, mapId: number): MapProgress => {
  const events = eventsForPlayer(db, playerId);
  const tiers = deriveTiers(events);
  const all = gameNodes(db);
  const mapNodes = all.filter((n) => n.mapId === mapId);
  const branches = branchLevels(mapNodes, tiers);
  const disciplines = disciplineLevels(all, tiers);
  return {
    playerId,
    tiers: Object.fromEntries(mapNodes.map((n) => [n.id, tierFor(tiers, n.id)])),
    revealed: [
      ...revealedNodeIds(mapNodes, tiers, {
        revealed: revealedByEvents(events),
        scoutBonus: hasFogBonus(db, playerId),
      }),
    ],
    branches,
    field: fieldLevel(branches),
    disciplines,
    totalLevel: totalLevel(disciplines),
  };
};

export type NodeProgress = { tier: NodeTier; quiz: QuizState };

/** One player's standing on one node: tier stamps plus quiz state. */
export const nodeProgressFor = (db: DB, playerId: number, nodeId: number): NodeProgress => {
  const events = eventsForPlayer(db, playerId);
  return { tier: tierFor(deriveTiers(events), nodeId), quiz: quizState(events, nodeId) };
};

export type PlayerSummary = {
  player: Pick<PlayerRow, "id" | "name" | "persona" | "createdAt">;
  disciplines: DisciplineLevels;
  totalLevel: number;
};

/** Every character in the household, with their account-wide levels. */
export const playerSummaries = (db: DB): PlayerSummary[] => {
  const all = gameNodes(db);
  return listPlayers(db).map((p) => {
    const tiers = deriveTiers(eventsForPlayer(db, p.id));
    const disciplines = disciplineLevels(all, tiers);
    return {
      player: { id: p.id, name: p.name, persona: p.persona, createdAt: p.createdAt },
      disciplines,
      totalLevel: totalLevel(disciplines),
    };
  });
};

/** Node count a map greeting can grumble about: unexplored = never opened. */
export const mapGreetingCounts = (
  db: DB,
  playerId: number,
  mapId: number,
): { unexploredCount: number; masteredCount: number } => {
  const tiers = deriveTiers(eventsForPlayer(db, playerId));
  const mapNodes = db
    .select({ id: atlasNodes.id })
    .from(atlasNodes)
    .where(eq(atlasNodes.mapId, mapId))
    .all();
  let unexploredCount = 0;
  let masteredCount = 0;
  for (const n of mapNodes) {
    const t = tierFor(tiers, n.id);
    if (!t.seen) unexploredCount += 1;
    if (t.mastered) masteredCount += 1;
  }
  return { unexploredCount, masteredCount };
};

export type PlayerGameView = {
  /** The accepted class (id + title), or null before the first offer is taken. */
  class: { id: string; title: string } | null;
  loadout: Loadout | null;
};

export const playerGameView = (db: DB, player: PlayerRow): PlayerGameView => {
  const cls = currentClass(db, player.id);
  return {
    class: cls ? { id: cls.id, title: cls.title } : null,
    loadout: parseLoadout(player.loadout),
  };
};

/** The map GET's engine additions: what is queued and where the next gate is. */
export const mapGamePayload = (
  db: DB,
  player: PlayerRow,
  totalLevelNow: number,
): { pending: Pending; nextGate: { level: number; at: number } | null } & PlayerGameView => ({
  pending: pendingFor(db, player.id),
  nextGate: nextGateFor(totalLevelNow),
  ...playerGameView(db, player),
});

/** The /me additions: everything granted (revealedAt says what the UI may show), items, class history. */
export const meGamePayload = (db: DB, player: PlayerRow) => {
  const events = eventsForPlayer(db, player.id);
  const total = totalLevel(disciplineLevels(gameNodes(db), deriveTiers(events)));
  const achievements = db
    .select({
      id: atlasAchievements.id,
      slug: atlasAchievements.slug,
      title: atlasAchievements.title,
      flavor: atlasAchievements.flavor,
      hidden: atlasAchievements.hidden,
      source: atlasAchievements.source,
      grantedAt: atlasAchievements.grantedAt,
      revealedAt: atlasAchievements.revealedAt,
    })
    .from(atlasAchievements)
    .where(eq(atlasAchievements.playerId, player.id))
    .orderBy(asc(atlasAchievements.id))
    .all();
  const items = db
    .select({
      id: atlasItems.id,
      achievementId: atlasItems.achievementId,
      kind: atlasItems.kind,
      ref: atlasItems.ref,
      status: atlasItems.status,
      createdAt: atlasItems.createdAt,
    })
    .from(atlasItems)
    .where(eq(atlasItems.playerId, player.id))
    .orderBy(asc(atlasItems.id))
    .all()
    // Loot from an unopened chest stays invisible until the reveal.
    .filter((i) => isItemRevealed(db, i));
  return {
    ...playerGameView(db, player),
    achievements,
    items,
    classHistory: classHistory(events),
    totalLevel: total,
    nextGate: nextGateFor(total),
  };
};
