/**
 * Generates the committed placeholder sprite parts and their manifest:
 *
 *   pnpm --filter web run sprite:placeholders
 *
 * Writes apps/web/public/sprite/classic/manifest.json and one transparent
 * 32×40 PNG per part/animation/frame at
 * `<slot>/<id>-<anim>-<frame>.png`. Geometric stand-ins only — the real
 * parts come from the separate atlas-sprites repo in the same format, and
 * `sprite/parts.test.ts` validates both mechanically. Run once and commit
 * the output; the runtime never decodes PNGs in Node.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const W = 32;
const H = 40;
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

// Anchors, shared with the manifest below.
const ANCHORS = {
  headTopRow: 6,
  shoulderRow: 18,
  leftHand: { x: 9, y: 28 },
  rightHand: { x: 22, y: 28 },
  footRow: 37,
};

const SLOTS = [
  // Behind the body, so the hands may be overlapped here: the body draws over.
  { id: "aura-back", region: [0, 0, 31, 39], keepClear: [], mustCover: [] },
  { id: "cape", region: [7, 17, 24, 38], keepClear: [], mustCover: [] },
  {
    id: "body",
    region: [6, 5, 25, 39],
    keepClear: [],
    mustCover: ["headTopRow", "shoulderRow", "leftHand", "rightHand", "footRow"],
  },
  { id: "outfit", region: [8, 17, 23, 34], keepClear: ["leftHand", "rightHand"], mustCover: [] },
  { id: "hair", region: [8, 3, 23, 18], keepClear: ["leftHand", "rightHand"], mustCover: [] },
  { id: "item", region: [2, 20, 29, 39], keepClear: ["leftHand", "rightHand"], mustCover: [] },
  { id: "aura-front", region: [0, 0, 31, 39], keepClear: ["leftHand", "rightHand"], mustCover: [] },
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
  // Head: rounded 12×11 box, head-top row 6.
  rect(c, 11, 6, 20, 6, "outline");
  rect(c, 11, 16, 20, 16, "outline");
  for (let y = 7; y <= 15; y += 1) {
    put(c, 10, y, "outline");
    put(c, 21, y, "outline");
    rect(c, 11, y, 20, y, "skin-base");
    put(c, 20, y, "skin-shade");
  }
  rect(c, 11, 8, 11, 10, "skin-light");
  // Face.
  const eyes: Record<string, Array<[number, number]>> = {
    open: [[13, 11], [13, 12], [18, 11], [18, 12]],
    squint: [[13, 12], [18, 12]],
    happy: [[12, 11], [13, 11], [18, 11], [19, 11]],
    happyBlush: [[12, 11], [13, 11], [18, 11], [19, 11]],
  };
  for (const [x, y] of eyes[mood]) put(c, x, y, "eye");
  if (mood === "happy" || mood === "happyBlush") {
    rect(c, 15, 14, 16, 15, "mouth");
  } else {
    rect(c, 15, 14, 16, 14, "mouth");
  }
  if (mood === "happyBlush") {
    put(c, 12, 13, "blush");
    put(c, 19, 13, "blush");
  }
  // Neck, torso (shoulder row 18), arms held slightly off the body.
  rect(c, 14, 17, 17, 17, "skin-shade");
  rect(c, 12, 18, 19, 18, "outline");
  for (let y = 19; y <= 29; y += 1) {
    put(c, 12, y, "outline");
    put(c, 19, y, "outline");
    rect(c, 13, y, 18, y, "skin-base");
    put(c, 18, y, "skin-shade");
  }
  rect(c, 9, 18, 10, 18, "outline");
  rect(c, 21, 18, 22, 18, "outline");
  for (let y = 19; y <= 27; y += 1) {
    put(c, 9, y, "outline");
    put(c, 10, y, "skin-base");
    put(c, 21, y, "skin-base");
    put(c, 22, y, "outline");
  }
  rect(c, 9, 28, 10, 28, "skin-base");
  rect(c, 21, 28, 22, 28, "skin-base");
  rect(c, 9, 29, 10, 29, "outline");
  rect(c, 21, 29, 22, 29, "outline");
  // Legs and boots; foot row 37.
  for (let y = 30; y <= 35; y += 1) {
    put(c, 12, y, "outline");
    rect(c, 13, y, 14, y, "skin-base");
    put(c, 15, y, "outline");
    put(c, 16, y, "outline");
    rect(c, 17, y, 18, y, "skin-base");
    put(c, 19, y, "outline");
  }
  rect(c, 11, 36, 15, 37, "boot");
  rect(c, 16, 36, 20, 37, "boot");
  return c;
};

// ---- outfit -------------------------------------------------------------
const tunicFrame = (): Canvas => {
  const c = blank();
  rect(c, 12, 18, 13, 18, "tunic-base");
  rect(c, 18, 18, 19, 18, "tunic-base");
  for (let y = 19; y <= 32; y += 1) {
    const x0 = y >= 30 ? 11 : 12;
    const x1 = y >= 30 ? 20 : 19;
    rect(c, x0, y, x1, y, y >= 30 ? "tunic-shade" : "tunic-base");
    if (y < 30) {
      put(c, 13, y, "tunic-light");
      put(c, 18, y, "tunic-shade");
    }
  }
  rect(c, 14, 18, 17, 18, "tunic-shade"); // neckline trim
  rect(c, 14, 18, 17, 18, "tunic-light");
  for (let y = 18; y <= 25; y += 1) {
    rect(c, 9, y, 10, y, "tunic-base");
    rect(c, 21, y, 22, y, "tunic-base");
    put(c, 10, y, "tunic-shade");
    put(c, 21, y, "tunic-shade");
  }
  rect(c, 12, 26, 19, 26, "belt");
  rect(c, 15, 26, 16, 26, "brass");
  return c;
};

// ---- hair ---------------------------------------------------------------
const hairFrame = (laurel: 0 | 1 | null): Canvas => {
  const c = blank();
  rect(c, 12, 5, 19, 5, "hair-shade");
  rect(c, 11, 6, 20, 6, "hair-base");
  for (let y = 7; y <= 8; y += 1) {
    put(c, 10, y, "hair-shade");
    rect(c, 11, y, 20, y, "hair-base");
    put(c, 21, y, "hair-shade");
  }
  rect(c, 13, 6, 14, 7, "hair-light");
  put(c, 10, 9, "hair-shade");
  put(c, 21, 9, "hair-shade");
  rect(c, 11, 9, 13, 9, "hair-base");
  rect(c, 15, 9, 16, 9, "hair-base");
  rect(c, 18, 9, 20, 9, "hair-base");
  for (let y = 10; y <= 11; y += 1) {
    put(c, 10, y, "hair-shade");
    put(c, 21, y, "hair-shade");
  }
  if (laurel !== null) {
    for (let x = 10; x <= 21; x += 1) put(c, x, 7, x % 2 === 0 ? "leaf" : "leaf-shade");
    put(c, 11, 6, "leaf-light");
    put(c, 20, 6, "leaf-light");
    put(c, 9, laurel === 0 ? 8 : 9, "leaf");
    put(c, 22, laurel === 0 ? 8 : 9, "leaf");
    put(c, 9, 7, "leaf-light");
    put(c, 22, 7, "leaf-light");
  }
  return c;
};

// ---- cape ---------------------------------------------------------------
const capeFrame = (sway: 0 | 1): Canvas => {
  const c = blank();
  for (let y = 18; y <= 36; y += 1) {
    const x0 = y < 24 ? 9 : 8;
    const x1 = y < 24 ? 22 : 23;
    rect(c, x0, y, x1, y, "cape-base");
    put(c, x0, y, "cape-shade");
    put(c, x1, y, "cape-shade");
    put(c, 12, y, "cape-light");
  }
  for (let x = 8; x <= 23; x += 1) {
    if ((x + sway) % 2 === 0) put(c, x, 37, "cape-shade");
    else put(c, x, 37, "cape-base");
  }
  for (let x = 9; x <= 22; x += 1) if ((x + sway) % 2 === 0) put(c, x, 38, "cape-shade");
  return c;
};

// ---- lantern ------------------------------------------------------------
const lanternFrame = (swing: 0 | 1): Canvas => {
  const c = blank();
  const dx = swing;
  put(c, 22, 29, "chain");
  put(c, 22 + dx, 30, "chain");
  rect(c, 21 + dx, 31, 24 + dx, 31, "brass");
  for (let y = 32; y <= 35; y += 1) {
    put(c, 21 + dx, y, "brass-shade");
    put(c, 24 + dx, y, "brass-shade");
    rect(c, 22 + dx, y, 23 + dx, y, "glass");
  }
  rect(c, 22 + dx, 33, 23 + dx, 34, "flame");
  put(c, 22 + dx, 33, "glow");
  rect(c, 21 + dx, 36, 24 + dx, 36, "brass");
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
    plus(5, 12, "spark-light", "spark");
    plus(26, 22, "spark-light", "spark-pink");
    put(c, 27, 8, "spark");
    put(c, 4, 30, "spark-pink");
  } else {
    plus(26, 22, "spark-light", "spark");
    plus(5, 12, "spark-light", "spark-pink");
    put(c, 4, 8, "spark");
    put(c, 27, 31, "spark-pink");
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
