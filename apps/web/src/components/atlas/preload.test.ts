import { describe, expect, it } from "vitest";
import { pageState, preloadButtonLabel } from "./preload";

const node = (onepager: string | null, eli10: string | null) => ({ rungs: { onepager, eli10 } });
const label = (nodes: ReturnType<typeof node>[], quizless = 0, status = "ready") =>
  preloadButtonLabel(status, nodes.length, pageState(nodes), quizless);

describe("preload button", () => {
  it("offers quizzes on an all-ready map whose one-pagers lack them", () => {
    const nodes = [node("ready", "ready"), node("ready", "ready")];
    expect(pageState(nodes)).toEqual({
      pagesReady: 4,
      pagesDrafting: false,
      pagesMissing: false,
      pagesFailed: false,
    });
    expect(label(nodes, 2)).toBe("Prepare quizzes (2 missing)");
  });

  it("hides on an all-ready map with every quiz in place", () => {
    expect(label([node("ready", "ready")], 0)).toBeNull();
  });

  it("offers the rest while a page is missing or failed, quizzes or not", () => {
    expect(label([node("ready", "ready"), node(null, null)])).toBe("Prepare the rest");
    expect(label([node("ready", null)], 1)).toBe("Prepare the rest");
    expect(label([node("failed", null)])).toBe("Prepare the rest");
  });

  it("treats a failed one-pager as settled, not missing its eli10", () => {
    expect(pageState([node("failed", null)]).pagesMissing).toBe(false);
  });

  it("hides while anything drafts, on an unready map, or with no nodes", () => {
    expect(label([node("drafting", null)], 3)).toBeNull();
    expect(label([node("ready", "drafting")], 3)).toBeNull();
    expect(label([node("ready", "ready")], 3, "drafting")).toBeNull();
    expect(label([node("ready", "ready")], 3, "queued")).toBeNull();
    expect(label([], 3)).toBeNull();
  });
});
