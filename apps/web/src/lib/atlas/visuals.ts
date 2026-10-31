/**
 * Visuals — model-drawn diagrams, side-by-sides and maps inside rungs.
 *
 * The model never draws pixels or markup: a "model-drawn" visual is a small
 * typed JSON spec (zod-validated) that code renders to SVG — the same
 * decompose / select-don't-generate / assemble-in-code rule the readings
 * follow. Model-emitted SVG or HTML would go through dangerouslySetInnerHTML
 * and is an XSS hole; a typed spec cannot be.
 *
 * A visual or image is placed in body_md by a marker alone on its own line —
 * `[[visual:slug]]` / `[[image:slug]]` — the one exception to the markdown
 * subset. The stored body is never rewritten at render time: the renderer
 * splits on markers (segmentBody) and a marker with no matching stored
 * visual / verified image renders nothing, which is how a rejected image
 * degrades. stripVisualMarkers() is for the paths that feed mdToHtml
 * directly (emails).
 *
 * Unlike the quiz (PR-C's mastery gate), visuals never fail a rung: still
 * broken after the repair pass, they are dropped and the page ships without
 * them.
 */
import { z } from "zod";
import type { AtlasRungLevel } from "../../db/schema";

// --- schemas -----------------------------------------------------------------

export const VISUAL_SLUG_RE = /^[a-z0-9-]{1,40}$/;

const slug = z.string().regex(VISUAL_SLUG_RE, "slug must be [a-z0-9-], at most 40 chars");

const visualBase = {
  slug,
  title: z.string().trim().min(2).max(80),
  caption: z.string().trim().max(200).nullish(),
  // Backfill only: the exact "###" heading this visual goes under. Fresh
  // drafts place markers themselves and leave it unset.
  after_heading: z.string().trim().max(120).nullish(),
};

export const SideBySideSchema = z.object({
  ...visualBase,
  kind: z.literal("sidebyside"),
  columns: z
    .array(
      z.object({
        header: z.string().trim().min(1).max(60),
        rows: z.array(z.string().trim().min(1).max(120)).min(2).max(6),
      }),
    )
    .min(2)
    .max(3),
  row_labels: z.array(z.string().trim().min(1).max(40)).max(6).nullish(),
});

export const DiagramSchema = z.object({
  ...visualBase,
  kind: z.literal("diagram"),
  nodes: z
    .array(z.object({ id: z.string().trim().min(1).max(24), label: z.string().trim().min(1).max(40) }))
    .min(2)
    .max(9),
  edges: z
    .array(
      z.object({
        from: z.string().trim().min(1).max(24),
        to: z.string().trim().min(1).max(24),
        label: z.string().trim().max(30).nullish(),
      }),
    )
    .min(1)
    .max(12),
});

export const GeomapSchema = z.object({
  ...visualBase,
  kind: z.literal("geomap"),
  places: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        lat: z.number().min(-85).max(85),
        lon: z.number().min(-180).max(180),
      }),
    )
    .min(1)
    .max(8),
});

export const VisualSchema = z.discriminatedUnion("kind", [
  SideBySideSchema,
  DiagramSchema,
  GeomapSchema,
]);
export type Visual = z.infer<typeof VisualSchema>;

export const ImageProposalSchema = z.object({
  slug,
  // The exact subject, as Wikimedia Commons search terms.
  query: z.string().trim().min(3).max(120),
  caption: z.string().trim().min(3).max(240),
  why: z.string().trim().max(240).nullish(),
  after_heading: z.string().trim().max(120).nullish(),
});
export type ImageProposal = z.infer<typeof ImageProposalSchema>;

/** The visuals-only backfill call (rungs written before visuals existed). */
export const VisualsBackfillSchema = z.object({
  visuals: z.array(VisualSchema).max(3).nullish(),
  images: z.array(ImageProposalSchema).max(2).nullish(),
});

export const VISUAL_CAPS: Record<AtlasRungLevel, { visuals: number; images: number }> = {
  eli10: { visuals: 0, images: 0 },
  onepager: { visuals: 1, images: 1 },
  deepdive: { visuals: 3, images: 2 },
};

// --- markers -------------------------------------------------------------------

const MARKER_LINE_RE = /^\[\[(visual|image):([a-z0-9-]{1,40})\]\]$/;
/** Anything that was meant to be a marker, however mangled. */
const MARKER_HINT_RE = /\[\[\s*(?:visual|image)\s*:/i;

export type MarkerType = "visual" | "image";

export type BodySegment =
  | { type: "md"; md: string }
  | { type: MarkerType; slug: string };

/** Split a rung body into markdown runs and well-formed marker lines. */
export const segmentBody = (md: string): BodySegment[] => {
  const segments: BodySegment[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) segments.push({ type: "md", md: text });
    buffer = [];
  };
  for (const line of md.split("\n")) {
    const m = MARKER_LINE_RE.exec(line.trim());
    if (m) {
      flush();
      segments.push({ type: m[1] as MarkerType, slug: m[2] });
    } else {
      buffer.push(line);
    }
  }
  flush();
  return segments;
};

/** Every well-formed marker in the body, in order. */
export const bodyMarkers = (md: string): Array<{ type: MarkerType; slug: string }> =>
  segmentBody(md).filter((s): s is { type: MarkerType; slug: string } => s.type !== "md");

/** For the paths that feed mdToHtml directly (emails): markers removed. */
export const stripVisualMarkers = (md: string): string =>
  md
    .split("\n")
    .filter((line) => !MARKER_LINE_RE.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// --- validation ------------------------------------------------------------------

/**
 * Everything the zod shapes can't see: marker ↔ spec agreement, per-level
 * caps, and per-kind structure. Rides the same one-repair-pass as the body;
 * still broken after repair, the visuals are dropped (never the rung).
 */
export const validateVisuals = (
  level: AtlasRungLevel,
  bodyMd: string,
  visuals: readonly Visual[],
  images: readonly ImageProposal[],
): string[] => {
  const problems: string[] = [];
  const caps = VISUAL_CAPS[level];

  if (visuals.length > caps.visuals) {
    problems.push(
      caps.visuals === 0
        ? `no visuals in the ${level} version`
        : `at most ${caps.visuals} visual(s) for a ${level} (got ${visuals.length})`,
    );
  }
  if (images.length > caps.images) {
    problems.push(
      caps.images === 0
        ? `no images in the ${level} version`
        : `at most ${caps.images} image(s) for a ${level} (got ${images.length})`,
    );
  }

  for (const line of bodyMd.split("\n")) {
    if (MARKER_HINT_RE.test(line) && !MARKER_LINE_RE.test(line.trim())) {
      problems.push(
        `marker must be [[visual:slug]] or [[image:slug]] alone on its own line (got "${line.trim().slice(0, 60)}")`,
      );
    }
  }

  const seen = new Set<string>();
  for (const s of [...visuals.map((v) => v.slug), ...images.map((i) => i.slug)]) {
    if (seen.has(s)) problems.push(`duplicate slug "${s}"`);
    seen.add(s);
  }

  const markers = bodyMarkers(bodyMd);
  const visualSlugs = new Set(visuals.map((v) => v.slug));
  const imageSlugs = new Set(images.map((i) => i.slug));
  const count = (type: MarkerType, s: string) =>
    markers.filter((m) => m.type === type && m.slug === s).length;
  for (const m of markers) {
    const known = m.type === "visual" ? visualSlugs : imageSlugs;
    if (!known.has(m.slug)) problems.push(`[[${m.type}:${m.slug}]] has no matching ${m.type} entry`);
  }
  for (const v of visuals) {
    const n = count("visual", v.slug);
    if (n !== 1) problems.push(`visual "${v.slug}" must appear exactly once in body_md (found ${n})`);
  }
  for (const i of images) {
    const n = count("image", i.slug);
    if (n !== 1) problems.push(`image "${i.slug}" must appear exactly once in body_md (found ${n})`);
  }

  for (const v of visuals) {
    if (v.kind === "sidebyside") {
      const rows = v.columns[0].rows.length;
      if (v.columns.some((c) => c.rows.length !== rows)) {
        problems.push(`sidebyside "${v.slug}": every column must have the same number of rows`);
      }
      if (v.row_labels && v.row_labels.length !== rows) {
        problems.push(`sidebyside "${v.slug}": row_labels must match the row count (${rows})`);
      }
    }
    if (v.kind === "diagram") {
      const ids = new Set<string>();
      for (const n of v.nodes) {
        if (ids.has(n.id)) problems.push(`diagram "${v.slug}": duplicate node id "${n.id}"`);
        ids.add(n.id);
      }
      for (const e of v.edges) {
        if (!ids.has(e.from) || !ids.has(e.to)) {
          problems.push(`diagram "${v.slug}": edge ${e.from}→${e.to} names a missing node id`);
        }
      }
    }
  }
  return problems;
};

// --- backfill marker insertion -----------------------------------------------------

export type MarkerPlacement = { type: MarkerType; slug: string; afterHeading: string | null };

const headingKey = (s: string) => s.replace(/^###\s*/, "").trim().toLowerCase();

/**
 * Insert marker lines into an existing body (the backfill path): each goes
 * directly after its matched "###" heading, unmatched ones at the end. The
 * body text itself is never altered — only marker lines are added.
 */
export const insertMarkers = (bodyMd: string, placements: MarkerPlacement[]): string => {
  const lines = bodyMd.split("\n");
  const tail: string[] = [];
  const byLine = new Map<number, string[]>();
  for (const p of placements) {
    const marker = `[[${p.type}:${p.slug}]]`;
    const at = p.afterHeading
      ? lines.findIndex((l) => /^###\s+\S/.test(l) && headingKey(l) === headingKey(p.afterHeading!))
      : -1;
    if (at === -1) tail.push(marker);
    else byLine.set(at, [...(byLine.get(at) ?? []), marker]);
  }
  const out: string[] = [];
  lines.forEach((line, i) => {
    out.push(line);
    for (const marker of byLine.get(i) ?? []) out.push("", marker);
  });
  for (const marker of tail) out.push("", marker);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

// --- prompt blocks ---------------------------------------------------------------

const VISUAL_SHAPES = `Each visual is one of:
- { "kind": "sidebyside", "slug": string, "title": string, "caption": string | null, "columns": [2-3 of { "header": string, "rows": [2-6 short strings] }], "row_labels": [strings] | null } — every column has the same number of rows; cells under 120 characters.
- { "kind": "diagram", "slug": string, "title": string, "caption": string | null, "nodes": [2-9 of { "id": string, "label": string under 40 chars }], "edges": [1-12 of { "from": id, "to": id, "label": string under 30 chars | null }] } — who taught whom, what leads to what, how the parts relate.
- { "kind": "geomap", "slug": string, "title": string, "caption": string | null, "places": [1-8 of { "label": string, "lat": number, "lon": number }] } — real coordinates, for where things happened or spread.
Every "slug" is lowercase [a-z0-9-] and unique across visuals and images.`;

export const visualRules = (level: AtlasRungLevel): string => {
  const caps = VISUAL_CAPS[level];
  return `VISUALS: you may also propose up to ${caps.visuals} model-drawn visual${caps.visuals === 1 ? "" : "s"} — ONLY where a picture beats prose: a "sidebyside" for rival positions, a "geomap" when geography or spread matters, a "diagram" for structure. An empty list is a fine answer and usually the right one.
${VISUAL_SHAPES}
Place each visual in body_md with a marker line — [[visual:slug]] alone on its own line, exactly once, where it belongs. Marker lines are the one exception to the markdown rules. Code draws the visual and labels it as model-drawn.`;
};

export const imageRules = (level: AtlasRungLevel): string => {
  const caps = VISUAL_CAPS[level];
  return `IMAGES: you may also propose up to ${caps.images} real image${caps.images === 1 ? "" : "s"} — a photograph, painting, manuscript, map or artifact that genuinely belongs on this page and very likely exists on Wikipedia or Wikimedia Commons. Never a diagram-as-image, never generated art. Each is { "slug": string, "query": the exact subject as Commons search terms, "caption": what it is and why it is on this page, "why": string | null }. Place each with [[image:slug]] alone on its own line, exactly once. The image is machine-verified against Wikimedia Commons and silently dropped when nothing trustworthy matches, so name famous, well-photographed subjects.`;
};

/** The visuals-only backfill call, for rungs written before visuals existed. */
export const buildVisualsPrompt = (input: {
  context: string;
  bodyMd: string;
  level: AtlasRungLevel;
}): string => {
  const caps = VISUAL_CAPS[input.level];
  return `You wrote the page below for a personal atlas of ideas kept by one curious adult. Now decide whether it deserves visuals.

${input.context}

THE PAGE (every "###" heading is an anchor you can place a visual under):
${input.bodyMd}

Propose up to ${caps.visuals} model-drawn visual${caps.visuals === 1 ? "" : "s"} and up to ${caps.images} real image${caps.images === 1 ? "" : "s"} — ONLY where a picture beats the prose that is already there: a "sidebyside" for rival positions, a "geomap" when geography or spread matters, a "diagram" for structure. Empty lists are a fine answer and often the right one.
${VISUAL_SHAPES}
An image is { "slug": string, "query": the exact subject as Wikimedia Commons search terms, "caption": what it is and why it is on this page, "why": string | null } — a real photograph, painting, manuscript, map or artifact, never generated art; it is machine-verified and silently dropped when nothing trustworthy matches.
Instead of markers, give every visual and image an "after_heading": the exact text of the "###" heading it belongs under (null for the end of the page). Do not rewrite the page.

Return JSON only: { "visuals": [ ... ], "images": [ ... ] }`;
};
