/**
 * Game math — pure functions from the event log to tiers and levels.
 *
 * Mastery has three layers (docs/atlas.md "Mastery: three layers"):
 *   1. branches level 1–99, XP scaled to the branch's node count, so a small
 *      branch and a large one both mean "fully mastered" at 99;
 *   2. a field shows the sum of its branch levels over 99 × branches;
 *   3. disciplines are the account-wide spine: every node is tagged to one,
 *      their XP pools cross maps, and the total level is their sum.
 *
 * Everything derives from an append-only event log, so every number here is
 * monotone over time: levels never drop, by construction. Each stamp counts
 * once per player per node — re-reads and quiz re-takes change nothing.
 *
 * The constants below are the tuning surface; change them and every level
 * recomputes (there is no stored XP anywhere).
 */
import { atlasDisciplines, type AtlasDiscipline } from "../../db/schema";
import { eventData, type EventRow } from "./events";

/** XP per stamp, once per node per player. A fully mastered node is 100. */
export const STAMP_XP = { eli10: 10, onepager: 20, deepdive: 30, quiz: 40 } as const;
export const NODE_MAX_XP =
  STAMP_XP.eli10 + STAMP_XP.onepager + STAMP_XP.deepdive + STAMP_XP.quiz;

export const MAX_LEVEL = 99;

/** The slice of an event the math reads; EventRow satisfies it. */
export type GameEvent = Pick<EventRow, "verb" | "nodeId" | "data">;

/** The slice of a node the math reads. */
export type GameNode = {
  id: number;
  parentId: number | null;
  discipline: AtlasDiscipline | null;
};

/** The Balatro stickers on one node, for one player. */
export type NodeTier = {
  seen: boolean;
  eli10: boolean;
  onepager: boolean;
  deepdive: boolean;
  mastered: boolean;
};

const BLANK_TIER: NodeTier = {
  seen: false,
  eli10: false,
  onepager: false,
  deepdive: false,
  mastered: false,
};

const RUNG_STAMPS = ["eli10", "onepager", "deepdive"] as const;

/**
 * Fold the log into per-node tiers. Reading a rung or passing a quiz also
 * marks the node seen (you were on the page). Unknown verbs pass through
 * untouched — they are someone else's data, not an error.
 */
export const deriveTiers = (events: readonly GameEvent[]): Map<number, NodeTier> => {
  const tiers = new Map<number, NodeTier>();
  const tier = (nodeId: number): NodeTier => {
    const t = tiers.get(nodeId) ?? { ...BLANK_TIER };
    tiers.set(nodeId, t);
    return t;
  };
  for (const e of events) {
    if (e.nodeId === null || e.nodeId === undefined) continue;
    if (e.verb === "open_node") tier(e.nodeId).seen = true;
    else if (e.verb === "read_rung") {
      const level = eventData(e).level;
      if (typeof level === "string" && (RUNG_STAMPS as readonly string[]).includes(level)) {
        const t = tier(e.nodeId);
        t[level as (typeof RUNG_STAMPS)[number]] = true;
        t.seen = true;
      }
    } else if (e.verb === "pass_quiz") {
      const t = tier(e.nodeId);
      t.mastered = true;
      t.seen = true;
    }
  }
  return tiers;
};

export const tierFor = (tiers: Map<number, NodeTier>, nodeId: number): NodeTier =>
  tiers.get(nodeId) ?? BLANK_TIER;

export const nodeXp = (tier: NodeTier): number =>
  (tier.eli10 ? STAMP_XP.eli10 : 0) +
  (tier.onepager ? STAMP_XP.onepager : 0) +
  (tier.deepdive ? STAMP_XP.deepdive : 0) +
  (tier.mastered ? STAMP_XP.quiz : 0);

/**
 * Branch levels ride a square root so early reads move the needle fast and
 * 99 lands exactly at full mastery of every node in the branch.
 */
export const levelFromFraction = (fraction: number): number => {
  const f = Math.min(1, Math.max(0, fraction));
  return 1 + Math.floor((MAX_LEVEL - 1) * Math.sqrt(f));
};

export type BranchLevel = { nodeId: number; level: number; xp: number; maxXp: number };

/** Per-branch levels: the branch node itself counts (it has rungs too). */
export const branchLevels = (
  nodes: readonly GameNode[],
  tiers: Map<number, NodeTier>,
): BranchLevel[] =>
  nodes
    .filter((n) => n.parentId === null)
    .map((branch) => {
      const members = nodes.filter((n) => n.id === branch.id || n.parentId === branch.id);
      const xp = members.reduce((sum, n) => sum + nodeXp(tierFor(tiers, n.id)), 0);
      const maxXp = members.length * NODE_MAX_XP;
      return {
        nodeId: branch.id,
        xp,
        maxXp,
        level: levelFromFraction(maxXp === 0 ? 0 : xp / maxXp),
      };
    });

export type FieldLevel = { total: number; max: number; capeEarned: boolean };

/** `Philosophy 412 / 594`: the sum of branch levels over 99 × branches. */
export const fieldLevel = (branches: readonly BranchLevel[]): FieldLevel => {
  const total = branches.reduce((sum, b) => sum + b.level, 0);
  const max = branches.length * MAX_LEVEL;
  return { total, max, capeEarned: branches.length > 0 && total === max };
};

/**
 * Discipline XP rides an absolute curve (not scaled to node counts) so the
 * spine stays stable and comparable as fields are added: reaching level n
 * costs 50·n·(n−1) XP — level 2 at 100 (one mastered node), level 10 at
 * 4,500 — capped at 99.
 */
export const xpForLevel = (level: number): number => 50 * level * (level - 1);

export const disciplineLevelFor = (xp: number): number => {
  let level = 1;
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= xp) level += 1;
  return level;
};

export type DisciplineLevels = Record<AtlasDiscipline, { xp: number; level: number }>;

/** Account-wide: pass every node of every map, not just one map's. */
export const disciplineLevels = (
  nodes: readonly GameNode[],
  tiers: Map<number, NodeTier>,
): DisciplineLevels => {
  const xp = Object.fromEntries(atlasDisciplines.map((d) => [d, 0])) as Record<
    AtlasDiscipline,
    number
  >;
  for (const n of nodes) {
    if (!n.discipline) continue;
    xp[n.discipline] += nodeXp(tierFor(tiers, n.id));
  }
  return Object.fromEntries(
    atlasDisciplines.map((d) => [d, { xp: xp[d], level: disciplineLevelFor(xp[d]) }]),
  ) as DisciplineLevels;
};

/** The account-wide total: the sum of the five discipline levels. */
export const totalLevel = (disciplines: DisciplineLevels): number =>
  atlasDisciplines.reduce((sum, d) => sum + disciplines[d].level, 0);

/** Nodes the log revealed directly (a fog_reveal / rare_node_key item). */
export const revealedByEvents = (events: readonly GameEvent[]): Set<number> => {
  const ids = new Set<number>();
  for (const e of events) {
    if (e.verb === "reveal_node" && e.nodeId !== null && e.nodeId !== undefined) ids.add(e.nodeId);
  }
  return ids;
};

export type FogOptions = {
  /** Nodes revealed by `reveal_node` events; see `revealedByEvents`. */
  revealed?: Iterable<number>;
  /** The Scout perk: one extra peek into every branch still unexplored. */
  scoutBonus?: boolean;
};

/**
 * Fog is a render rule, never stored state: branch titles are always on the
 * map (they are its regions); a child is revealed once this player has
 * opened it, its branch, or any sibling, or a `reveal_node` event named it.
 * Everything else is a `?` tile — still clickable (no hard locks), and
 * opening it reveals it, so fog never regrows (events only append).
 *
 * The Scout perk is a breadth nudge: once any branch on the map has been
 * touched, every branch still untouched shows one extra child (first in
 * node order). A touched branch is already fully revealed by the sibling
 * rule, so the peek goes where the fog actually is. Derived, never stored.
 */
export const revealedNodeIds = (
  nodes: readonly GameNode[],
  tiers: Map<number, NodeTier>,
  options: FogOptions = {},
): Set<number> => {
  const revealed = new Set<number>(options.revealed ?? []);
  const seen = (id: number) => tierFor(tiers, id).seen;
  const branchTouched = new Map<number, boolean>();
  for (const n of nodes) {
    if (n.parentId === null) {
      if (seen(n.id)) branchTouched.set(n.id, true);
    } else if (seen(n.id)) branchTouched.set(n.parentId, true);
  }
  for (const n of nodes) {
    if (n.parentId === null) {
      revealed.add(n.id);
      continue;
    }
    if (seen(n.id) || branchTouched.get(n.parentId)) revealed.add(n.id);
  }
  if (options.scoutBonus && branchTouched.size > 0) {
    const peeked = new Set<number>();
    for (const n of nodes) {
      if (n.parentId === null || branchTouched.get(n.parentId) || peeked.has(n.parentId)) continue;
      peeked.add(n.parentId);
      revealed.add(n.id);
    }
  }
  return revealed;
};
