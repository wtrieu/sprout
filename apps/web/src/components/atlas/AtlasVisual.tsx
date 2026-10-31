/**
 * Renderers for the model-drawn visuals (lib/atlas/visuals.ts): typed JSON
 * specs drawn by code — never model-emitted markup — and labeled as
 * model-drawn on every figure.
 */
import type { Visual } from "@/lib/atlas/visuals";
import { WORLD_OUTLINE_PATHS } from "@/lib/atlas/worldOutline";

type SideBySide = Extract<Visual, { kind: "sidebyside" }>;
type Diagram = Extract<Visual, { kind: "diagram" }>;
type Geomap = Extract<Visual, { kind: "geomap" }>;

// --- side-by-side ---------------------------------------------------------------

const SideBySideView = ({ v }: { v: SideBySide }) => {
  const rows = v.columns[0].rows.length;
  const hasLabels = !!v.row_labels && v.row_labels.length === rows;
  const template = `${hasLabels ? "minmax(72px,0.6fr) " : ""}repeat(${v.columns.length}, minmax(0,1fr))`;
  return (
    <div
      className="grid gap-px overflow-hidden rounded-md border border-neutral-800 bg-neutral-800 text-sm"
      style={{ gridTemplateColumns: template }}
    >
      {hasLabels && <div className="bg-neutral-900" />}
      {v.columns.map((c) => (
        <div key={c.header} className="bg-neutral-900 px-3 py-2 font-medium text-amber-400">
          {c.header}
        </div>
      ))}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="contents">
          {hasLabels && (
            <div className="bg-neutral-950 px-3 py-2 text-xs text-neutral-500">{v.row_labels![r]}</div>
          )}
          {v.columns.map((c) => (
            <div key={c.header} className="bg-neutral-950 px-3 py-2 text-neutral-300">
              {c.rows[r]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// --- diagram --------------------------------------------------------------------

const BOX_W = 150;
const BOX_H = 46;
const COL_GAP = 64;
const ROW_GAP = 26;
const PAD = 8;

const wrapLabel = (s: string): string[] => {
  if (s.length <= 20) return [s];
  const lines: string[] = [];
  let line = "";
  for (const w of s.split(" ")) {
    if (line && `${line} ${w}`.length > 20) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
};

/** Layered left→right by longest path; a cycle degrades to insertion order. */
const layoutDiagram = (v: Diagram) => {
  const depth = new Map<string, number>(v.nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < v.nodes.length; pass++) {
    let changed = false;
    for (const e of v.edges) {
      const d = (depth.get(e.from) ?? 0) + 1;
      if (d < v.nodes.length && d > (depth.get(e.to) ?? 0)) {
        depth.set(e.to, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const columns = new Map<number, string[]>();
  for (const n of v.nodes) {
    const d = depth.get(n.id) ?? 0;
    columns.set(d, [...(columns.get(d) ?? []), n.id]);
  }
  const depths = [...columns.keys()].sort((a, b) => a - b);
  const maxRows = Math.max(...depths.map((d) => columns.get(d)!.length));
  const height = maxRows * BOX_H + (maxRows - 1) * ROW_GAP + 2 * PAD;
  const pos = new Map<string, { x: number; y: number }>();
  depths.forEach((d, col) => {
    const ids = columns.get(d)!;
    const colHeight = ids.length * BOX_H + (ids.length - 1) * ROW_GAP;
    const y0 = (height - colHeight) / 2;
    ids.forEach((id, row) => {
      pos.set(id, { x: PAD + col * (BOX_W + COL_GAP), y: y0 + row * (BOX_H + ROW_GAP) });
    });
  });
  const width = PAD * 2 + depths.length * BOX_W + (depths.length - 1) * COL_GAP;
  return { pos, width, height };
};

const DiagramView = ({ v }: { v: Diagram }) => {
  const { pos, width, height } = layoutDiagram(v);
  const labels = new Map(v.nodes.map((n) => [n.id, n.label]));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={v.title}>
      <defs>
        <marker id="atlas-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0.5L7.5 4L0 7.5Z" fill="#737373" />
        </marker>
      </defs>
      {v.edges.map((e, i) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        const forward = b.x > a.x;
        const x1 = forward ? a.x + BOX_W : a.x + BOX_W / 2;
        const y1 = forward ? a.y + BOX_H / 2 : a.y + (b.y > a.y ? BOX_H : 0);
        const x2 = forward ? b.x - 2 : b.x + BOX_W / 2;
        const y2 = forward ? b.y + BOX_H / 2 : b.y + (b.y > a.y ? -2 : BOX_H + 2);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#737373" strokeWidth="1.2" markerEnd="url(#atlas-arrow)" />
            {e.label && (
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 4}
                textAnchor="middle"
                fontSize="9.5"
                fill="#a3a3a3"
                stroke="#0a0a0a"
                strokeWidth="3"
                paintOrder="stroke"
              >
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {v.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const lines = wrapLabel(n.label);
        return (
          <g key={n.id}>
            <rect x={p.x} y={p.y} width={BOX_W} height={BOX_H} rx="8" fill="#171717" stroke="#404040" />
            {lines.map((line, i) => (
              <text
                key={i}
                x={p.x + BOX_W / 2}
                y={p.y + BOX_H / 2 + (i - (lines.length - 1) / 2) * 13 + 4}
                textAnchor="middle"
                fontSize="11.5"
                fill="#e5e5e5"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
};

// --- geomap ---------------------------------------------------------------------

/** Equirectangular, matching worldOutline.ts: x = lon + 180, y = 90 - lat. */
const geoViewBox = (pts: Array<{ x: number; y: number }>) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const padX = Math.max(10, (maxX - minX) * 0.35);
  const padY = Math.max(7, (maxY - minY) * 0.35);
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  // Hold a readable aspect by growing the smaller side around its centre.
  const target = 1.9;
  let w = maxX - minX;
  let h = maxY - minY;
  if (w / h < target) {
    const cx = (minX + maxX) / 2;
    w = h * target;
    minX = cx - w / 2;
  } else {
    const cy = (minY + maxY) / 2;
    h = w / target;
    minY = cy - h / 2;
  }
  w = Math.min(w, 360);
  h = Math.min(h, 180);
  minX = Math.max(0, Math.min(minX, 360 - w));
  minY = Math.max(0, Math.min(minY, 180 - h));
  return { x: minX, y: minY, w, h };
};

const GeomapView = ({ v }: { v: Geomap }) => {
  const pts = v.places.map((p) => ({ x: p.lon + 180, y: 90 - p.lat, label: p.label }));
  const vb = geoViewBox(pts);
  const r = Math.max(0.35, vb.w * 0.009);
  const fs = Math.max(0.9, vb.w * 0.026);
  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className="h-auto w-full rounded-md"
      role="img"
      aria-label={v.title}
    >
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#0a0a0a" />
      {WORLD_OUTLINE_PATHS.map((d, i) => (
        <path key={i} d={d} fill="#262626" stroke="#525252" strokeWidth={vb.w * 0.0018} />
      ))}
      {pts.map((p) => {
        const flip = p.x > vb.x + vb.w * 0.8;
        return (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r={r} fill="#f59e0b" stroke="#0a0a0a" strokeWidth={r * 0.35} />
            <text
              x={flip ? p.x - r * 1.8 : p.x + r * 1.8}
              y={p.y + fs * 0.35}
              textAnchor={flip ? "end" : "start"}
              fontSize={fs}
              fill="#e5e5e5"
              stroke="#0a0a0a"
              strokeWidth={fs * 0.22}
              paintOrder="stroke"
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

// --- the figure -------------------------------------------------------------------

export const AtlasVisual = ({ visual }: { visual: Visual }) => (
  <figure className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
    <div className="flex items-center justify-between gap-3 border-b border-neutral-800/70 px-4 py-2">
      <figcaption className="text-sm font-medium text-neutral-200">{visual.title}</figcaption>
      <span
        className="shrink-0 rounded-full border border-amber-500/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-500/80"
        title="Drawn by the model, not from a source — trust the shape, check the details."
      >
        model-drawn
      </span>
    </div>
    <div className="p-4">
      {visual.kind === "sidebyside" && <SideBySideView v={visual} />}
      {visual.kind === "diagram" && <DiagramView v={visual} />}
      {visual.kind === "geomap" && <GeomapView v={visual} />}
    </div>
    {visual.caption && <p className="px-4 pb-3 text-xs text-neutral-500">{visual.caption}</p>}
  </figure>
);
