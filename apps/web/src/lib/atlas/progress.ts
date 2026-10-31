/**
 * Progress composition — the payloads the routes attach for a signed-in
 * player. Pure math lives in game.ts; this file only loads events and nodes
 * and shapes the result. Maps are small (≤60 nodes) and the household's log
 * is short, so everything recomputes on read: no stored XP, nothing to drift.
 */
import { eq } from "drizzle-orm";
import type { DB } from "../../db/client";
import { atlasNodes } from "../../db/schema";
import { eventsForPlayer } from "./events";
import {
  branchLevels,
  deriveTiers,
  disciplineLevels,
  fieldLevel,
  revealedNodeIds,
  tierFor,
  totalLevel,
  type BranchLevel,
  type DisciplineLevels,
  type FieldLevel,
  type GameNode,
  type NodeTier,
} from "./game";
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
    revealed: [...revealedNodeIds(mapNodes, tiers)],
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
