/**
 * Generates the committed placeholder sprite parts and their manifest:
 *
 *   pnpm --filter web run sprite:placeholders
 *
 * Writes apps/web/public/sprite/classic/manifest.json and one transparent
 * 64×64 PNG per part/animation/frame at
 * `<slot>/<id>-<anim>-<frame>.png`. Geometric stand-ins only — the real
 * parts come from the separate atlas-sprites repo in the same format, and
 * `sprite/parts.test.ts` validates both mechanically. Run once and commit
 * the output; the runtime never decodes PNGs in Node.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const W = 64;
const H = 64;
const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../apps/web/public/sprite/classic",
);

// One indexed palette (31 of the 32 allowed). Swap groups point at names.
const PALETTE: Array<[string, string]> = [
  ["outline", "#2b2233"],
  ["skin-base", "#e8b48a"],
  ["skin-shade", "#c98a63"],
  ["skin-light", "#f6d0ae"],
  ["hair-base", "#6b4a2f"],
  ["hair-shade", "#4a3220"],
  ["hair-light", "#8c6743"],
  ["eye", "#1d1a2b"],
  ["white", "#ffffff"],
  ["mouth", "#a84a4a"],
  ["blush", "#e58f8f"],
  ["tunic-base", "#3f7d58"],
  ["tunic-shade", "#2d5c41"],
  ["tunic-light", "#5fa77a"],
  ["belt", "#7a5230"],
  ["boot", "#4b3a2e"],
  ["cape-base", "#8b2f4a"],
  ["cape-shade", "#62203a"],
  ["cape-light", "#b5506c"],
  ["brass", "#c9a23c"],
  ["brass-shade", "#8f6f1f"],
  ["flame", "#ffcf4a"],
  ["glow", "#fff1a8"],
  ["glass", "#cfe8f0"],
  ["leaf", "#4f9a3d"],
  ["leaf-shade", "#357128"],
  ["leaf-light", "#7cc45e"],
  ["spark", "#ffe27a"],
  ["spark-light", "#fff7c9"],
  ["spark-pink", "#ff9ed1"],
  ["chain", "#8a8f99"],
];
const HEX = Object.fromEntries(PALETTE) as Record<string, string>;

type Canvas = Array<string | null>; // palette name per pixel, row-major
const blank = (): Canvas => new Array(W * H).fill(null);
const put = (c: Canvas, x: number, y: number, color: string | null) => {
  if (x < 0 || y < 0 || x >= W || y >= H) throw new Error(`pixel ${x},${y} off canvas`);
  c[y * W + x] = color;
};
const rect = (c: Canvas, x0: number, y0: number, x1: number, y1: number, color: string) => {
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) put(c, x, y, color);
};
/** Paint an ASCII block with its top-left at (x0, y0); '.' is transparent. */
const stamp = (c: Canvas, x0: number, y0: number, rows: string[], legend: Record<string, string>) => {
  rows.forEach((row, dy) => {
    [...row].forEach((ch, dx) => {
      if (ch === ".") return;
      const color = legend[ch];
      if (!color) throw new Error(`no legend for '${ch}'`);
      put(c, x0 + dx, y0 + dy, color);
    });
  });
};

// Anchors, shared with the manifest below. These are the authoritative
// values measured from the approved atlas-sprites base_body_v1 (2026-11-07);
// the canonical copy lives at atlas-sprites/base/anchors_64.json.
// Pose: 3/4 front view facing viewer-left, left arm forward at waist height.
// `grip` is where held items align: 6px screen-left of leftHand on the same
// row. Item layers paint the hand-to-grip extension themselves, so the BARE
// body does not cover the grip: it MUST leave that pixel transparent. This is
// enforced for every style/frame in parts.test.ts, not via the manifest
// (`grip` is in `anchors` only, never in a slot's keepClear/mustCover).
// Hair may paint one row above headTopRow (its region starts at headTopRow-1).
const ANCHORS = {
  headTopRow: 4,
  shoulderRow: 29,
  leftHand: { x: 23, y: 34 },
  rightHand: { x: 37, y: 42 },
  footRow: 58,
  grip: { x: 17, y: 34 },
};

const SLOTS = [
  // Behind the body, so the hands may be overlapped here: the body draws over.
  { id: "aura-back", region: [0, 0, 63, 63], keepClear: [], mustCover: [] },
  { id: "cape", region: [14, 28, 49, 61], keepClear: [], mustCover: [] },
  {
    id: "body",
    region: [16, 4, 47, 63],
    keepClear: [],
    mustCover: ["headTopRow", "shoulderRow", "leftHand", "rightHand", "footRow"],
  },
  { id: "outfit", region: [16, 29, 47, 52], keepClear: ["leftHand", "rightHand"], mustCover: [] },
  { id: "hair", region: [18, 3, 45, 24], keepClear: ["leftHand", "rightHand"], mustCover: [] },
  { id: "item", region: [4, 30, 59, 63], keepClear: ["leftHand", "rightHand"], mustCover: [] },
  { id: "aura-front", region: [0, 0, 63, 63], keepClear: ["leftHand", "rightHand"], mustCover: [] },
] as const;

type Frames = Canvas[];
type Part = {
  id: string;
  slot: string;
  swap: string[];
  grantedBy: string | null;
  anims: Record<string, Frames>;
};

// ---- body ---------------------------------------------------------------
const bodyFrame = (mood: "open" | "squint" | "happy" | "happyBlush"): Canvas => {
  const c = blank();
  // Head: x 22..40, head-top row 4 down to a chin outline on row 22.
  rect(c, 24, 4, 38, 4, "outline");
  rect(c, 23, 22, 39, 22, "outline");
  for (let y = 5; y <= 21; y += 1) {
    put(c, y < 6 ? 23 : 22, y, "outline");
    put(c, y < 6 ? 39 : 40, y, "outline");
    rect(c, y < 6 ? 24 : 23, y, y < 6 ? 38 : 39, y, "skin-base");
    rect(c, 38, y, 39, y, "skin-shade");
  }
  rect(c, 23, 7, 24, 11, "skin-light");
  // Face.
  const eyes: Record<string, Array<[number, number, number, number]>> = {
    open: [[26, 12, 27, 13], [34, 12, 35, 13]],
    squint: [[26, 13, 27, 13], [34, 13, 35, 13]],
    happy: [[25, 12, 27, 12], [34, 12, 36, 12]],
    happyBlush: [[25, 12, 27, 12], [34, 12, 36, 12]],
  };
  for (const [x0, y0, x1, y1] of eyes[mood]) rect(c, x0, y0, x1, y1, "eye");
  if (mood === "happy" || mood === "happyBlush") {
    rect(c, 29, 18, 32, 19, "mouth");
  } else {
    rect(c, 29, 18, 32, 18, "mouth");
  }
  if (mood === "happyBlush") {
    rect(c, 24, 15, 25, 16, "blush");
    rect(c, 37, 15, 38, 16, "blush");
  }
  // Neck, then shoulders on row 29.
  rect(c, 28, 23, 33, 28, "skin-shade");
  rect(c, 21, 29, 40, 29, "outline");
  // Torso x 25..36.
  for (let y = 30; y <= 44; y += 1) {
    put(c, 25, y, "outline");
    put(c, 36, y, "outline");
    rect(c, 26, y, 35, y, "skin-base");
    rect(c, 34, y, 35, y, "skin-shade");
  }
  // Left arm forward at waist height; its hand is (23,34). The grip point
  // (17,34) is deliberately left unpainted: held items extend to it.
  for (let y = 30; y <= 35; y += 1) {
    put(c, 21, y, "outline");
    rect(c, 22, y, 24, y, "skin-base");
  }
  rect(c, 21, 36, 24, 36, "outline");
  // Right arm hangs; its hand is (37,42).
  for (let y = 30; y <= 43; y += 1) {
    rect(c, 37, y, 39, y, "skin-base");
    put(c, 40, y, "outline");
  }
  rect(c, 37, 44, 40, 44, "outline");
  // Legs and boots; foot row 58.
  for (let y = 45; y <= 55; y += 1) {
    put(c, 25, y, "outline");
    rect(c, 26, y, 30, y, "skin-base");
    put(c, 31, y, "outline");
    put(c, 32, y, "outline");
    rect(c, 33, y, 35, y, "skin-base");
    put(c, 36, y, "outline");
  }
  rect(c, 23, 56, 31, 58, "boot");
  rect(c, 32, 56, 38, 58, "boot");
  return c;
};

// ---- outfit -------------------------------------------------------------
const tunicFrame = (): Canvas => {
  const c = blank();
  rect(c, 25, 29, 27, 29, "tunic-base");
  rect(c, 34, 29, 36, 29, "tunic-base");
  rect(c, 28, 29, 33, 29, "tunic-light"); // neckline trim
  for (let y = 30; y <= 50; y += 1) {
    const skirt = y >= 45;
    rect(c, skirt ? 24 : 25, y, skirt ? 37 : 36, y, skirt ? "tunic-shade" : "tunic-base");
    if (!skirt) {
      rect(c, 27, y, 28, y, "tunic-light");
      rect(c, 35, y, 36, y, "tunic-shade");
    }
  }
  // Short sleeves, clear of both hands.
  for (let y = 30; y <= 32; y += 1) rect(c, 21, y, 24, y, "tunic-base");
  for (let y = 30; y <= 37; y += 1) rect(c, 37, y, 40, y, "tunic-base");
  rect(c, 25, 40, 36, 41, "belt");
  rect(c, 30, 40, 33, 41, "brass");
  return c;
};

// ---- hair ---------------------------------------------------------------
const hairFrame = (laurel: 0 | 1 | null): Canvas => {
  const c = blank();
  // Row 3 sits one above headTopRow (4): hair is allowed to crest the head.
  rect(c, 26, 3, 36, 3, "hair-shade");
  rect(c, 24, 4, 38, 4, "hair-base");
  for (let y = 5; y <= 8; y += 1) {
    put(c, 22, y, "hair-shade");
    rect(c, 23, y, 39, y, "hair-base");
    put(c, 40, y, "hair-shade");
  }
  rect(c, 27, 4, 30, 5, "hair-light");
  rect(c, 23, 9, 27, 9, "hair-base");
  rect(c, 31, 9, 34, 9, "hair-base");
  rect(c, 37, 9, 39, 9, "hair-base");
  for (let y = 9; y <= 17; y += 1) {
    put(c, 22, y, "hair-shade");
    put(c, 40, y, "hair-shade");
  }
  if (laurel !== null) {
    for (let x = 22; x <= 40; x += 1) put(c, x, 6, x % 2 === 0 ? "leaf" : "leaf-shade");
    put(c, 23, 5, "leaf-light");
    put(c, 39, 5, "leaf-light");
    put(c, 21, laurel === 0 ? 8 : 10, "leaf");
    put(c, 41, laurel === 0 ? 8 : 10, "leaf");
    put(c, 21, 6, "leaf-light");
    put(c, 41, 6, "leaf-light");
  }
  return c;
};

// ---- cape ---------------------------------------------------------------
const capeFrame = (sway: 0 | 1): Canvas => {
  const c = blank();
  for (let y = 30; y <= 55; y += 1) {
    const x0 = y < 40 ? 20 : 18;
    const x1 = y < 40 ? 42 : 44;
    rect(c, x0, y, x1, y, "cape-base");
    put(c, x0, y, "cape-shade");
    put(c, x1, y, "cape-shade");
    rect(c, 27, y, 28, y, "cape-light");
  }
  for (let x = 18; x <= 44; x += 1) {
    put(c, x, 56, (x + sway) % 2 === 0 ? "cape-shade" : "cape-base");
  }
  for (let x = 19; x <= 43; x += 1) if ((x + sway) % 2 === 0) put(c, x, 57, "cape-shade");
  return c;
};

// ---- lantern ------------------------------------------------------------
// Aligned to the grip point (17,34): the item paints the hand-to-grip
// extension (x 17..22 on the grip row) and a chain hanging from the grip.
const lanternFrame = (swing: 0 | 1): Canvas => {
  const c = blank();
  const dx = swing * 2;
  rect(c, 17, 34, 22, 34, "brass-shade");
  put(c, 17, 35, "chain");
  put(c, 17, 36, "chain");
  put(c, 17 + dx, 37, "chain");
  rect(c, 15 + dx, 38, 20 + dx, 39, "brass");
  for (let y = 40; y <= 45; y += 1) {
    put(c, 15 + dx, y, "brass-shade");
    put(c, 20 + dx, y, "brass-shade");
    rect(c, 16 + dx, y, 19 + dx, y, "glass");
  }
  rect(c, 16 + dx, 41, 19 + dx, 44, "flame");
  rect(c, 17 + dx, 41, 18 + dx, 42, "glow");
  rect(c, 15 + dx, 46, 20 + dx, 47, "brass");
  return c;
};

// ---- aura ---------------------------------------------------------------
const auraFrame = (phase: 0 | 1): Canvas => {
  const c = blank();
  const plus = (x: number, y: number, core: string, tip: string) => {
    put(c, x, y, core);
    put(c, x - 1, y, tip);
    put(c, x + 1, y, tip);
    put(c, x, y - 1, tip);
    put(c, x, y + 1, tip);
  };
  if (phase === 0) {
    plus(10, 24, "spark-light", "spark");
    plus(53, 38, "spark-light", "spark-pink");
    put(c, 55, 14, "spark");
    put(c, 8, 52, "spark-pink");
  } else {
    plus(53, 38, "spark-light", "spark");
    plus(10, 24, "spark-light", "spark-pink");
    put(c, 8, 14, "spark");
    put(c, 55, 53, "spark-pink");
  }
  return c;
};

const idle2 = (f: (n: 0 | 1) => Canvas): Frames => [f(0), f(1)];
const same2 = (f: () => Canvas): Frames => [f(), f()];

const PARTS: Part[] = [
  {
    id: "body-default",
    slot: "body",
    swap: ["skin"],
    grantedBy: null,
    anims: {
      idle: [bodyFrame("open"), bodyFrame("squint")],
      celebrate: [bodyFrame("happy"), bodyFrame("happyBlush"), bodyFrame("happy"), bodyFrame("happyBlush")],
    },
  },
  { id: "outfit-tunic", slot: "outfit", swap: [], grantedBy: null, anims: { idle: same2(tunicFrame) } },
  { id: "hair-short", slot: "hair", swap: ["hair"], grantedBy: null, anims: { idle: same2(() => hairFrame(null)) } },
  { id: "cape-scholar", slot: "cape", swap: [], grantedBy: "loot", anims: { idle: idle2(capeFrame) } },
  { id: "item-lantern", slot: "item", swap: [], grantedBy: "loot", anims: { idle: idle2(lanternFrame) } },
  { id: "hair-laurel", slot: "hair", swap: ["hair"], grantedBy: "loot", anims: { idle: idle2((n) => hairFrame(n)) } },
  { id: "aura-spark", slot: "aura-front", swap: [], grantedBy: "loot", anims: { idle: idle2(auraFrame) } },
];

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const writePng = (file: string, c: Canvas) => {
  const png = new PNG({ width: W, height: H });
  c.forEach((name, i) => {
    if (!name) return; // PNG buffers start zeroed: transparent
    const [r, g, b] = hexToRgb(HEX[name]);
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, PNG.sync.write(png));
};

const manifest = {
  version: 1,
  style: "classic",
  canvas: { width: W, height: H },
  palette: PALETTE.map(([name, hex]) => ({ name, hex })),
  slots: SLOTS.map((s, z) => ({
    id: s.id,
    z,
    region: { x0: s.region[0], y0: s.region[1], x1: s.region[2], y1: s.region[3] },
    keepClear: [...s.keepClear],
    mustCover: [...s.mustCover],
  })),
  anchors: ANCHORS,
  animations: { idle: { frames: 2, fps: 2 }, celebrate: { frames: 4, fps: 6 } },
  swapGroups: {
    skin: {
      colors: ["skin-base", "skin-shade", "skin-light"],
      tones: {
        fair: ["#f1c9a5", "#d9a37f", "#fbe0c7"],
        default: [HEX["skin-base"], HEX["skin-shade"], HEX["skin-light"]],
        tan: ["#c98e5f", "#a66f45", "#dfab80"],
        deep: ["#8a5a3c", "#6a4129", "#a8765a"],
      },
    },
    hair: {
      colors: ["hair-base", "hair-shade", "hair-light"],
      tones: {
        brown: [HEX["hair-base"], HEX["hair-shade"], HEX["hair-light"]],
        black: ["#2e2a35", "#1c1923", "#4a4556"],
        blond: ["#d9b45a", "#a8873a", "#ecd08a"],
        red: ["#a8442a", "#7a2f1c", "#c8683f"],
      },
    },
  },
  parts: PARTS.map((p) => ({
    id: p.id,
    slot: p.slot,
    animations: Object.keys(p.anims),
    swap: p.swap,
    grantedBy: p.grantedBy,
  })),
  // Not sprite parts: the cosmetic ids loot hands out, for the UI to read.
  cosmetics: {
    frames: ["frame-oak", "frame-brass", "frame-ivy", "frame-stellar"],
    mapStyles: ["style-parchment", "style-night", "style-botanical"],
  },
};

rmSync(OUT, { recursive: true, force: true });
for (const p of PARTS) {
  for (const [anim, frames] of Object.entries(p.anims)) {
    frames.forEach((c, i) => writePng(path.join(OUT, p.slot, `${p.id}-${anim}-${i}.png`), c));
  }
}
writeFileSync(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${PARTS.length} parts to ${OUT}`);
