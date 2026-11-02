/**
 * Shared loaders for the engine: one player's event log, the node table, and
 * the levels derived from them. Everything recomputes on read, like
 * progress.ts — no stored XP, nothing to drift.
 */
import type { DB } from "../../../db/client";
import { atlasNodes } from "../../../db/schema";
import { eventsForPlayer, type EventRow } from "../events";
import {
  deriveTiers,
  revealedByEvents,
  revealedNodeIds,
  disciplineLevels,
  totalLevel,
  type DisciplineLevels,
  type GameNode,
  type NodeTier,
} from "../game";

export type PlayerNode = GameNode & {
  mapId: number;
  position: number;
  title: string;
  rare: boolean;
};

export const loadNodes = (db: DB): PlayerNode[] =>
  db
    .select({
      id: atlasNodes.id,
      mapId: atlasNodes.mapId,
      parentId: atlasNodes.parentId,
      position: atlasNodes.position,
      title: atlasNodes.title,
      discipline: atlasNodes.discipline,
      rare: atlasNodes.rare,
    })
    .from(atlasNodes)
    .all();

export type PlayerState = {
  events: EventRow[];
  nodes: PlayerNode[];
  tiers: Map<number, NodeTier>;
  disciplines: DisciplineLevels;
  total: number;
};

export const loadPlayerState = (db: DB, playerId: number): PlayerState => {
  const events = eventsForPlayer(db, playerId);
  const nodes = loadNodes(db);
  const tiers = deriveTiers(events);
  const disciplines = disciplineLevels(nodes, tiers);
  return { events, nodes, tiers, disciplines, total: totalLevel(disciplines) };
};

/** The branch a node belongs to (a branch is its own). */
export const branchOf = (node: Pick<GameNode, "id" | "parentId">): number =>
  node.parentId ?? node.id;

/**
 * The player's revealed set across every map: derived fog plus the
 * `reveal_node` events, with the Scout perk when they carry it.
 */
export const revealedAcross = (state: PlayerState, scoutBonus: boolean): Set<number> => {
  const byMap = new Map<number, PlayerNode[]>();
  for (const n of state.nodes) byMap.set(n.mapId, [...(byMap.get(n.mapId) ?? []), n]);
  const extra = revealedByEvents(state.events);
  const out = new Set<number>();
  for (const nodes of byMap.values()) {
    for (const id of revealedNodeIds(nodes, state.tiers, { revealed: extra, scoutBonus })) {
      out.add(id);
    }
  }
  return out;
};
