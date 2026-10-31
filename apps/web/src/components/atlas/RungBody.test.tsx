import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Visual } from "@/lib/atlas/visuals";
import type { AtlasImageData } from "./AtlasImage";
import { AtlasVisual } from "./AtlasVisual";
import { RungBody } from "./RungBody";

const SIDEBYSIDE: Visual = {
  kind: "sidebyside",
  slug: "stoa-vs-garden",
  title: "The Stoa against the Garden",
  columns: [
    { header: "Stoicism", rows: ["Virtue", "The city"] },
    { header: "Epicureanism", rows: ["Pleasure", "The garden"] },
  ],
  row_labels: ["The good", "Where to live"],
};

const DIAGRAM: Visual = {
  kind: "diagram",
  slug: "succession",
  title: "Who taught whom",
  nodes: [
    { id: "zeno", label: "Zeno of Citium" },
    { id: "cleanthes", label: "Cleanthes" },
    { id: "chrysippus", label: "Chrysippus of Soli" },
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

const IMAGE: AtlasImageData = {
  id: 1,
  slug: "zeno-bust",
  query: "Zeno of Citium bust",
  caption: "A Roman copy of the school's founder.",
  url: "https://upload.wikimedia.org/zeno.jpg",
  thumbUrl: "https://upload.wikimedia.org/thumb/zeno-640.jpg",
  descUrl: "https://commons.wikimedia.org/wiki/File:Zeno.jpg",
  author: "Paolo Monti",
  license: "CC BY-SA 4.0",
  width: 2000,
  height: 1500,
};

describe("AtlasVisual", () => {
  it("renders every kind as labeled SVG or grid, never raw model markup", () => {
    for (const v of [SIDEBYSIDE, DIAGRAM, GEOMAP]) {
      const html = renderToStaticMarkup(<AtlasVisual visual={v} />);
      expect(html).toContain("model-drawn");
      expect(html).toContain(v.title);
    }
    const diagram = renderToStaticMarkup(<AtlasVisual visual={DIAGRAM} />);
    expect(diagram).toContain("<svg");
    expect(diagram).toContain("systematized");
    // Three layered columns: each node box is a rect.
    expect(diagram.match(/<rect/g)).toHaveLength(3);
    const geomap = renderToStaticMarkup(<AtlasVisual visual={GEOMAP} />);
    expect(geomap).toContain("Athens");
    // The land outline is drawn behind the labeled points.
    expect((geomap.match(/<path/g) ?? []).length).toBeGreaterThan(50);
  });
});

describe("RungBody", () => {
  const md = [
    "### The question",
    "Some prose.",
    "",
    "[[visual:succession]]",
    "",
    "More prose.",
    "",
    "[[image:zeno-bust]]",
    "",
    "[[image:rejected-one]]",
    "",
    "[[visual:ghost]]",
  ].join("\n");

  it("interleaves markdown with matched visuals and images, dropping dangling markers", () => {
    const html = renderToStaticMarkup(
      <RungBody md={md} visualsJson={JSON.stringify([DIAGRAM])} images={[IMAGE]} />,
    );
    expect(html).toContain("The question");
    expect(html).toContain("Who taught whom");
    expect(html).toContain("thumb/zeno-640.jpg");
    expect(html).toContain("Paolo Monti · CC BY-SA 4.0 · Wikimedia Commons");
    // Dangling markers (a rejected image, an unknown visual) render nothing.
    expect(html).not.toContain("rejected-one");
    expect(html).not.toContain("ghost");
    expect(html).not.toContain("[[");
  });

  it("survives malformed visuals json", () => {
    const html = renderToStaticMarkup(<RungBody md="plain" visualsJson="{not json" images={[]} />);
    expect(html).toContain("plain");
  });
});
