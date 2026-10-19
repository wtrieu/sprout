/**
 * Frontier selection — pure functions over a map's nodes.
 *
 * The weekly note asks "what should I read next?", and the node page's
 * "next door" strip asks the same question about the node being read, so
 * both use one ordering:
 *
 *   1. child       — children of the anchor, in map order
 *   2. sibling     — same parent as the anchor, nearest first (next, then previous)
 *   3. next-branch — the first eligible nodes of the branches after the anchor's
 *   4. fallback    — anything else, in map order (reads like a book)
 *
 * Eligible = unvisited, not previously picked, not skipped, parent not skipped.
 * Map order = each branch by position, then its children by position.
 */

export type FrontierNode = {
  id: number;
  parentId: number | null;
  position: number;
  skipped: boolean;
  visitedAt: Date | null;
  lastOpenedAt: Date | null;
};

export type FrontierReason = "child" | "sibling" | "next-branch" | "fallback";

export type FrontierCandidate = { nodeId: number; reason: FrontierReason };

const byPosition = <T extends { position: number; id: number }>(a: T, b: T) =>
  a.position - b.position || a.id - b.id;

/** The node the reader touched most recently, or null for a fresh map. */
export const anchorNodeId = (nodes: FrontierNode[]): number | null => {
  let best: FrontierNode | null = null;
  for (const n of nodes) {
    if (!n.lastOpenedAt) continue;
    if (!best || !best.lastOpenedAt || n.lastOpenedAt > best.lastOpenedAt) best = n;
  }
  return best?.id ?? null;
};

/** Branches then children, each by position — the order a book would use. */
export const mapOrder = (nodes: FrontierNode[]): FrontierNode[] => {
  const branches = nodes.filter((n) => n.parentId === null).sort(byPosition);
  const childrenOf = new Map<number, FrontierNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const list = childrenOf.get(n.parentId) ?? [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }
  const ordered: FrontierNode[] = [];
  for (const b of branches) {
    ordered.push(b, ...(childrenOf.get(b.id) ?? []).sort(byPosition));
  }
  // Orphans (parent missing) go last so nothing is silently unreachable.
  const seen = new Set(ordered.map((n) => n.id));
  for (const n of [...nodes].sort(byPosition)) if (!seen.has(n.id)) ordered.push(n);
  return ordered;
};

export const frontierCandidates = (
  nodes: FrontierNode[],
  anchorId: number | null,
  exclude: ReadonlySet<number> = new Set(),
): FrontierCandidate[] => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const eligible = (n: FrontierNode): boolean => {
    if (n.visitedAt || n.skipped || exclude.has(n.id) || n.id === anchorId) return false;
    const parent = n.parentId === null ? null : byId.get(n.parentId);
    return !(parent && parent.skipped);
  };

  const out: FrontierCandidate[] = [];
  const taken = new Set<number>();
  const push = (n: FrontierNode, reason: FrontierReason) => {
    if (taken.has(n.id) || !eligible(n)) return;
    taken.add(n.id);
    out.push({ nodeId: n.id, reason });
  };

  const anchor = anchorId === null ? null : (byId.get(anchorId) ?? null);
  if (anchor) {
    // 1. children of the anchor
    nodes
      .filter((n) => n.parentId === anchor.id)
      .sort(byPosition)
      .forEach((n) => push(n, "child"));

    // 2. siblings, nearest first: the ones after, then the ones before
    if (anchor.parentId !== null) {
      const siblings = nodes.filter((n) => n.parentId === anchor.parentId && n.id !== anchor.id);
      siblings
        .filter((n) => n.position > anchor.position)
        .sort(byPosition)
        .forEach((n) => push(n, "sibling"));
      siblings
        .filter((n) => n.position <= anchor.position)
        .sort((a, b) => byPosition(b, a))
        .forEach((n) => push(n, "sibling"));
    }

    // 3. the branches after the anchor's branch, in map order
    const anchorBranchId = anchor.parentId === null ? anchor.id : anchor.parentId;
    const branches = nodes.filter((n) => n.parentId === null).sort(byPosition);
    const idx = branches.findIndex((b) => b.id === anchorBranchId);
    if (idx !== -1) {
      const ordered = mapOrder(nodes);
      const later = new Set(branches.slice(idx + 1).map((b) => b.id));
      ordered
        .filter((n) => later.has(n.parentId === null ? n.id : n.parentId))
        .forEach((n) => push(n, "next-branch"));
    }
  }

  // 4. everything else, in map order
  mapOrder(nodes).forEach((n) => push(n, "fallback"));
  return out;
};

/**
 * The weekly pick: the top candidate once previously picked nodes are
 * excluded, or null when the map is complete.
 */
export const pickFrontierNode = (
  nodes: FrontierNode[],
  opts: { anchorId?: number | null; pickedIds?: Iterable<number> } = {},
): FrontierCandidate | null => {
  const exclude = new Set(opts.pickedIds ?? []);
  const anchor = opts.anchorId === undefined ? anchorNodeId(nodes) : opts.anchorId;
  return frontierCandidates(nodes, anchor, exclude)[0] ?? null;
};
