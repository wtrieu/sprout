import { describe, expect, it } from "vitest";
import {
  anchorNodeId,
  frontierCandidates,
  mapOrder,
  pickFrontierNode,
  type FrontierNode,
} from "./picker";

const node = (
  id: number,
  parentId: number | null,
  position: number,
  extra: Partial<FrontierNode> = {},
): FrontierNode => ({
  id,
  parentId,
  position,
  skipped: false,
  visitedAt: null,
  lastOpenedAt: null,
  ...extra,
});

// Three branches; 1 has three children, 2 has two, 3 has one.
const map = (): FrontierNode[] => [
  node(3, null, 2),
  node(1, null, 0),
  node(2, null, 1),
  node(12, 1, 1),
  node(11, 1, 0),
  node(13, 1, 2),
  node(22, 2, 1),
  node(21, 2, 0),
  node(31, 3, 0),
];

const find = (nodes: FrontierNode[], id: number) => nodes.find((n) => n.id === id)!;

describe("mapOrder", () => {
  it("reads like a book: each branch, then its children, by position", () => {
    expect(mapOrder(map()).map((n) => n.id)).toEqual([1, 11, 12, 13, 2, 21, 22, 3, 31]);
  });

  it("does not mutate the caller's array", () => {
    const nodes = map();
    const before = nodes.map((n) => n.id);
    mapOrder(nodes);
    expect(nodes.map((n) => n.id)).toEqual(before);
  });
});

describe("frontierCandidates", () => {
  it("falls back to book order on a fresh map", () => {
    const c = frontierCandidates(map(), null);
    expect(c.map((x) => x.nodeId)).toEqual([1, 11, 12, 13, 2, 21, 22, 3, 31]);
    expect(c.every((x) => x.reason === "fallback")).toBe(true);
  });

  it("from a child: nearest siblings (next, then previous), then the next branch, then the rest", () => {
    const c = frontierCandidates(map(), 12);
    expect(c.slice(0, 2)).toEqual([
      { nodeId: 13, reason: "sibling" },
      { nodeId: 11, reason: "sibling" },
    ]);
    expect(c[2]).toEqual({ nodeId: 2, reason: "next-branch" });
    expect(c.at(-1)).toEqual({ nodeId: 1, reason: "fallback" });
    expect(c.some((x) => x.nodeId === 12)).toBe(false);
  });

  it("from a branch: its children first, then the next branch", () => {
    const c = frontierCandidates(map(), 1);
    expect(c.slice(0, 3).map((x) => x.nodeId)).toEqual([11, 12, 13]);
    expect(c[0].reason).toBe("child");
    expect(c[3]).toEqual({ nodeId: 2, reason: "next-branch" });
  });

  it("excludes visited, previously picked, skipped, and children of a skipped branch", () => {
    const nodes = map();
    find(nodes, 11).visitedAt = new Date();
    find(nodes, 2).skipped = true;
    const ids = frontierCandidates(nodes, 1, new Set([12])).map((c) => c.nodeId);
    expect(ids).toEqual([13, 3, 31]);
  });
});

describe("pickFrontierNode", () => {
  it("never repeats and returns null once the map is exhausted", () => {
    const nodes = map();
    const picked = new Set<number>();
    const order: number[] = [];
    for (;;) {
      const p = pickFrontierNode(nodes, { anchorId: null, pickedIds: picked });
      if (!p) break;
      picked.add(p.nodeId);
      order.push(p.nodeId);
      if (order.length > 20) throw new Error("runaway");
    }
    expect(order).toHaveLength(9);
    expect(new Set(order).size).toBe(9);
  });

  it("anchors on the most recently opened node", () => {
    const nodes = map();
    find(nodes, 21).lastOpenedAt = new Date("2026-10-01");
    find(nodes, 12).lastOpenedAt = new Date("2026-10-05");
    expect(anchorNodeId(nodes)).toBe(12);
    expect(pickFrontierNode(nodes)).toEqual({ nodeId: 13, reason: "sibling" });
  });

  it("returns null when every node is visited or skipped", () => {
    const nodes = map().map((n) => ({ ...n, visitedAt: new Date() }));
    expect(pickFrontierNode(nodes)).toBeNull();
  });
});
