import { describe, expect, it } from "vitest";
import {
  ImageProposalSchema,
  VisualSchema,
  buildVisualsPrompt,
  insertMarkers,
  segmentBody,
  stripVisualMarkers,
  validateVisuals,
  type ImageProposal,
  type Visual,
} from "./visuals";

const SIDEBYSIDE: Visual = {
  kind: "sidebyside",
  slug: "stoa-vs-garden",
  title: "The Stoa against the Garden",
  caption: "Two answers to the same question.",
  columns: [
    { header: "Stoicism", rows: ["Virtue", "The city", "Fate embraced"] },
    { header: "Epicureanism", rows: ["Pleasure", "The garden", "Chance accepted"] },
  ],
  row_labels: ["The good", "Where to live", "Necessity"],
};

const DIAGRAM: Visual = {
  kind: "diagram",
  slug: "succession",
  title: "Who taught whom",
  nodes: [
    { id: "zeno", label: "Zeno of Citium" },
    { id: "cleanthes", label: "Cleanthes" },
    { id: "chrysippus", label: "Chrysippus" },
  ],
  edges: [
    { from: "zeno", to: "cleanthes" },
    { from: "cleanthes", to: "chrysippus", label: "systematized" },
  ],
};

const GEOMAP: Visual = {
  kind: "geomap",
  slug: "schools-map",
  title: "Where the schools taught",
  places: [
    { label: "Athens", lat: 37.98, lon: 23.73 },
    { label: "Rome", lat: 41.89, lon: 12.48 },
  ],
};

const IMAGE: ImageProposal = {
  slug: "zeno-bust",
  query: "Zeno of Citium bust Naples",
  caption: "A Roman copy of the school's founder.",
  why: null,
};

const body = (...lines: string[]) => lines.join("\n");

describe("schemas", () => {
  it("accepts each kind and rejects what the renderer cannot draw", () => {
    for (const v of [SIDEBYSIDE, DIAGRAM, GEOMAP]) {
      expect(VisualSchema.safeParse(v).success).toBe(true);
    }
    expect(VisualSchema.safeParse({ ...GEOMAP, places: [] }).success).toBe(false);
    expect(
      VisualSchema.safeParse({
        ...GEOMAP,
        places: [{ label: "Nowhere", lat: 91, lon: 0 }],
      }).success,
    ).toBe(false);
    expect(VisualSchema.safeParse({ ...DIAGRAM, slug: "Bad Slug" }).success).toBe(false);
    expect(VisualSchema.safeParse({ ...SIDEBYSIDE, columns: SIDEBYSIDE.columns.slice(0, 1) }).success).toBe(
      false,
    );
    expect(ImageProposalSchema.safeParse(IMAGE).success).toBe(true);
    expect(ImageProposalSchema.safeParse({ ...IMAGE, query: "x" }).success).toBe(false);
  });
});

describe("segmentBody / stripVisualMarkers", () => {
  it("splits markdown runs on well-formed marker lines", () => {
    const md = body("### A", "text one", "", "[[visual:succession]]", "", "text two", "[[image:zeno-bust]]");
    expect(segmentBody(md)).toEqual([
      { type: "md", md: "### A\ntext one" },
      { type: "visual", slug: "succession" },
      { type: "md", md: "text two" },
      { type: "image", slug: "zeno-bust" },
    ]);
  });

  it("leaves malformed markers in the markdown run", () => {
    const md = body("a [[visual:inline]] marker", "[[visual:UPPER]]");
    expect(segmentBody(md)).toEqual([{ type: "md", md }]);
  });

  it("strips marker lines for the email paths and collapses the gap", () => {
    const md = body("### A", "text", "", "[[visual:succession]]", "", "more");
    expect(stripVisualMarkers(md)).toBe("### A\ntext\n\nmore");
    expect(stripVisualMarkers("no markers here")).toBe("no markers here");
  });
});

describe("validateVisuals", () => {
  const okBody = body("### A", "text", "", "[[visual:succession]]", "", "### B", "more", "", "[[image:zeno-bust]]");

  it("accepts matching markers and specs", () => {
    expect(validateVisuals("deepdive", okBody, [DIAGRAM], [IMAGE])).toEqual([]);
    expect(validateVisuals("onepager", okBody, [DIAGRAM], [IMAGE])).toEqual([]);
  });

  it("enforces the per-level caps, including none at all for eli10", () => {
    expect(validateVisuals("eli10", "plain words only", [DIAGRAM], []).join(" | ")).toContain(
      "no visuals in the eli10 version",
    );
    const two = body("[[visual:succession]]", "", "[[visual:schools-map]]", "", "words");
    expect(validateVisuals("onepager", two, [DIAGRAM, GEOMAP], []).join(" | ")).toContain(
      "at most 1 visual(s) for a onepager (got 2)",
    );
    expect(validateVisuals("deepdive", two, [DIAGRAM, GEOMAP], []).length).toBe(0);
  });

  it("flags malformed and inline markers", () => {
    const bad = body("see [[visual:succession]] here", "[[Visual: succession]]");
    const problems = validateVisuals("deepdive", bad, [DIAGRAM], []).join(" | ");
    expect(problems).toContain("alone on its own line");
  });

  it("requires every marker to have a spec, and every spec exactly one marker", () => {
    const dangling = body("[[visual:ghost]]", "", "words");
    expect(validateVisuals("deepdive", dangling, [], []).join(" | ")).toContain(
      "[[visual:ghost]] has no matching visual entry",
    );
    expect(validateVisuals("deepdive", "no marker", [DIAGRAM], []).join(" | ")).toContain(
      'visual "succession" must appear exactly once in body_md (found 0)',
    );
    const twice = body("[[image:zeno-bust]]", "", "mid", "", "[[image:zeno-bust]]");
    expect(validateVisuals("deepdive", twice, [], [IMAGE]).join(" | ")).toContain("(found 2)");
  });

  it("flags duplicate slugs across visuals and images", () => {
    const md = body("[[visual:zeno-bust]]", "", "[[image:zeno-bust]]");
    expect(
      validateVisuals("deepdive", md, [{ ...DIAGRAM, slug: "zeno-bust" }], [IMAGE]).join(" | "),
    ).toContain('duplicate slug "zeno-bust"');
  });

  it("checks sidebyside row agreement and diagram edge references", () => {
    const ragged: Visual = {
      ...SIDEBYSIDE,
      columns: [SIDEBYSIDE.columns[0], { header: "Epicureanism", rows: ["Pleasure", "The garden"] }],
    };
    expect(
      validateVisuals("onepager", "[[visual:stoa-vs-garden]]", [ragged], []).join(" | "),
    ).toContain("same number of rows");
    const shortLabels: Visual = { ...SIDEBYSIDE, row_labels: ["The good"] };
    expect(
      validateVisuals("onepager", "[[visual:stoa-vs-garden]]", [shortLabels], []).join(" | "),
    ).toContain("row_labels must match the row count (3)");
    const badEdge: Visual = {
      ...DIAGRAM,
      edges: [{ from: "zeno", to: "plato" }],
    };
    expect(validateVisuals("onepager", "[[visual:succession]]", [badEdge], []).join(" | ")).toContain(
      "edge zeno→plato names a missing node id",
    );
    const dupNode: Visual = {
      ...DIAGRAM,
      nodes: [...DIAGRAM.nodes.slice(0, 2), { id: "zeno", label: "Again" }],
    };
    expect(validateVisuals("onepager", "[[visual:succession]]", [dupNode], []).join(" | ")).toContain(
      'duplicate node id "zeno"',
    );
  });
});

describe("insertMarkers (backfill)", () => {
  const page = body("### The question", "one", "", "### The move", "two", "", "### Where it bites", "three");

  it("inserts after the matched heading, case-insensitively, and appends the unmatched", () => {
    const out = insertMarkers(page, [
      { type: "visual", slug: "succession", afterHeading: "the move" },
      { type: "image", slug: "zeno-bust", afterHeading: "No Such Heading" },
    ]);
    expect(out).toBe(
      body(
        "### The question",
        "one",
        "",
        "### The move",
        "",
        "[[visual:succession]]",
        "two",
        "",
        "### Where it bites",
        "three",
        "",
        "[[image:zeno-bust]]",
      ),
    );
    // The result round-trips through the same validation fresh drafts get.
    expect(validateVisuals("onepager", out, [DIAGRAM], [IMAGE])).toEqual([]);
  });

  it("appends at the end when no heading is given", () => {
    const out = insertMarkers("plain body", [{ type: "visual", slug: "succession", afterHeading: null }]);
    expect(out).toBe("plain body\n\n[[visual:succession]]");
  });
});

describe("buildVisualsPrompt", () => {
  it("carries the page, the caps and the after_heading contract", () => {
    const p = buildVisualsPrompt({ context: "MAP: Philosophy", bodyMd: "### A\nwords", level: "onepager" });
    expect(p).toContain("### A\nwords");
    expect(p).toContain("up to 1 model-drawn visual");
    expect(p).toContain("up to 1 real image");
    expect(p).toContain('"after_heading"');
    expect(p).toContain("Do not rewrite the page.");
  });
});
