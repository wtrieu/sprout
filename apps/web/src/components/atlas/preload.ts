/**
 * Map-page preload state, derived from the rung status rows (the row is the
 * job status). Pure so the "Prepare the rest" visibility is unit-testable.
 */

type RungStatus = string | null;
type PreloadNode = { rungs: { eli10: RungStatus; onepager: RungStatus } };

export type PageState = {
  /** Ready eli10 + one-pager rungs, out of nodes.length * 2. */
  pagesReady: number;
  pagesDrafting: boolean;
  /**
   * A node lacks a one-pager, or lacks an eli10 that could still be written
   * (a failed one-pager settles the node — no eli10 comes from it).
   */
  pagesMissing: boolean;
  pagesFailed: boolean;
};

export const pageState = (nodes: PreloadNode[]): PageState => {
  const levels = nodes.flatMap((n) => [n.rungs.eli10, n.rungs.onepager]);
  return {
    pagesReady: levels.filter((s) => s === "ready").length,
    pagesDrafting: levels.some((s) => s === "drafting"),
    pagesMissing: nodes.some(
      (n) => n.rungs.onepager === null || (n.rungs.eli10 === null && n.rungs.onepager !== "failed"),
    ),
    pagesFailed: levels.some((s) => s === "failed"),
  };
};

/**
 * The preload button's label, or null when it should not show. It shows on a
 * ready map with nothing drafting and something left to prepare: a missing or
 * failed page, or a ready one-pager still without its quiz.
 */
export const preloadButtonLabel = (
  mapStatus: string,
  nodeCount: number,
  pages: PageState,
  quizlessCount: number,
): string | null => {
  if (mapStatus !== "ready" || nodeCount === 0 || pages.pagesDrafting) return null;
  if (pages.pagesFailed || pages.pagesMissing) return "Prepare the rest";
  if (quizlessCount > 0) return `Prepare quizzes (${quizlessCount} missing)`;
  return null;
};
