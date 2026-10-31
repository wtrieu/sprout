import { describe, expect, it } from "vitest";
import {
  MAX_LEVEL,
  NODE_MAX_XP,
  STAMP_XP,
  branchLevels,
  deriveTiers,
  disciplineLevelFor,
  disciplineLevels,
  fieldLevel,
  levelFromFraction,
  nodeXp,
  revealedNodeIds,
  tierFor,
  totalLevel,
  xpForLevel,
  type GameEvent,
  type GameNode,
} from "./game";

const ev = (verb: string, nodeId: number | null, data?: Record<string, unknown>): GameEvent => ({
  verb,
  nodeId,
  data: data ? JSON.stringify(data) : null,
});

/** One branch (1) with children 2 and 3; another branch (4) with child 5. */
const NODES: GameNode[] = [
  { id: 1, parentId: null, discipline: "reasoning" },
  { id: 2, parentId: 1, discipline: "reasoning" },
  { id: 3, parentId: 1, discipline: "language" },
  { id: 4, parentId: null, discipline: "systems" },
  { id: 5, parentId: 4, discipline: null },
];

describe("deriveTiers", () => {
  it("folds opens, reads and quiz passes into stamps", () => {
    const tiers = deriveTiers([
      ev("open_node", 2),
      ev("read_rung", 2, { level: "onepager" }),
      ev("read_rung", 3, { level: "deepdive" }),
      ev("pass_quiz", 2),
    ]);
    expect(tierFor(tiers, 2)).toEqual({
      seen: true,
      eli10: false,
      onepager: true,
      deepdive: false,
      mastered: true,
    });
    // Reading implies the page was open, even without an open_node event.
    expect(tierFor(tiers, 3).seen).toBe(true);
    expect(tierFor(tiers, 1).seen).toBe(false);
  });

  it("counts each stamp once, ignores unknown verbs and levels", () => {
    const tiers = deriveTiers([
      ev("read_rung", 2, { level: "onepager" }),
      ev("read_rung", 2, { level: "onepager" }),
      ev("read_rung", 2, { level: "sideways" }),
      ev("eureka", 2, { note: "future verb" }),
      ev("fail_quiz", 2, { score: 1 }),
      ev("open_node", null),
    ]);
    expect(nodeXp(tierFor(tiers, 2))).toBe(STAMP_XP.onepager);
    expect(tierFor(tiers, 2).mastered).toBe(false);
  });
});

describe("levels", () => {
  it("levelFromFraction is monotone with exact endpoints", () => {
    expect(levelFromFraction(0)).toBe(1);
    expect(levelFromFraction(1)).toBe(MAX_LEVEL);
    let prev = 0;
    for (let i = 0; i <= 100; i += 1) {
      const level = levelFromFraction(i / 100);
      expect(level).toBeGreaterThanOrEqual(prev);
      prev = level;
    }
  });

  it("a branch at full mastery is 99; early reads move fast", () => {
    const full = deriveTiers(
      [1, 2, 3].flatMap((id) => [
        ev("read_rung", id, { level: "eli10" }),
        ev("read_rung", id, { level: "onepager" }),
        ev("read_rung", id, { level: "deepdive" }),
        ev("pass_quiz", id),
      ]),
    );
    const [b1, b4] = branchLevels(NODES, full);
    expect(b1).toEqual({ nodeId: 1, xp: 3 * NODE_MAX_XP, maxXp: 3 * NODE_MAX_XP, level: 99 });
    expect(b4.level).toBe(1);
    // One one-pager out of 300 XP is already level 25, not level 7.
    const one = deriveTiers([ev("read_rung", 2, { level: "onepager" })]);
    expect(branchLevels(NODES, one)[0].level).toBeGreaterThan(20);
  });

  it("field totals sum branch levels over 99 per branch", () => {
    const tiers = deriveTiers([ev("read_rung", 2, { level: "onepager" })]);
    const branches = branchLevels(NODES, tiers);
    const field = fieldLevel(branches);
    expect(field.max).toBe(2 * MAX_LEVEL);
    expect(field.total).toBe(branches[0].level + branches[1].level);
    expect(field.capeEarned).toBe(false);
  });

  it("discipline XP pools across branches and maps on an absolute curve", () => {
    expect(xpForLevel(2)).toBe(100);
    expect(disciplineLevelFor(0)).toBe(1);
    expect(disciplineLevelFor(99)).toBe(1);
    expect(disciplineLevelFor(100)).toBe(2);
    expect(disciplineLevelFor(4500)).toBe(10);
    const tiers = deriveTiers([
      // Node 1 and 2 are both "reasoning": one mastered node + one one-pager.
      ev("read_rung", 1, { level: "eli10" }),
      ev("read_rung", 1, { level: "onepager" }),
      ev("read_rung", 1, { level: "deepdive" }),
      ev("pass_quiz", 1),
      ev("read_rung", 2, { level: "onepager" }),
      // Node 5 is untagged: XP counts toward no discipline.
      ev("pass_quiz", 5),
    ]);
    const d = disciplineLevels(NODES, tiers);
    expect(d.reasoning.xp).toBe(NODE_MAX_XP + STAMP_XP.onepager);
    expect(d.reasoning.level).toBe(2);
    expect(d.language.xp).toBe(0);
    expect(totalLevel(d)).toBe(2 + 1 + 1 + 1 + 1);
  });
});

describe("fog", () => {
  it("branches always show; a child reveals via itself, its branch, or a sibling", () => {
    const none = revealedNodeIds(NODES, deriveTiers([]));
    expect([...none].sort()).toEqual([1, 4]);

    // Opening child 2 reveals its sibling 3, not the other branch's child 5.
    const sibling = revealedNodeIds(NODES, deriveTiers([ev("open_node", 2)]));
    expect(sibling.has(2)).toBe(true);
    expect(sibling.has(3)).toBe(true);
    expect(sibling.has(5)).toBe(false);

    // Opening branch 4 reveals its children.
    const viaBranch = revealedNodeIds(NODES, deriveTiers([ev("open_node", 4)]));
    expect(viaBranch.has(5)).toBe(true);
  });
});
