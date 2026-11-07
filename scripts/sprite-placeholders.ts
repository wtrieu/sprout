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

// Anchors, shared with the manifest below. PROVISIONAL: the authoritative
// anchors come from the atlas-sprites repo's 64×64 base template when real
// parts land.
const ANCHORS = {
  headTopRow: 8,
  shoulderRow: 30,
  leftHand: { x: 20, y: 44 },
  rightHand: { x: 43, y: 44 },
  footRow: 61,
};

const SLOTS = [
  // Behind the body, so the hands may be overlapped here: the body draws over.
  { id: "aura-back", region: [0, 0, 63, 63], keepClear: [], mustCover: [] },
  { id: "cape", region: [14, 28, 49, 61], keepClear: [], mustCover: [] },
  {
    id: "body",
    region: [16, 7, 47, 63],
    keepClear: [],
    mustCover: ["headTopRow", "shoulderRow", "leftHand", "rightHand", "footRow"],
  },
  { id: "outfit", region: [16, 29, 47, 52], keepClear: ["leftHand", "rightHand"], mustCover: [] },
  { id: "hair", region: [18, 4, 45, 24], keepClear: ["leftHand", "rightHand"], mustCover: [] },
  { id: "item", region: [4, 40, 59, 63], keepClear: ["leftHand", "rightHand"], mustCover: [] },
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
  // Head: 22×19 box, head-top row 8.
  rect(c, 22, 8, 41, 8, "outline");
  rect(c, 22, 26, 41, 26, "outline");
  for (let y = 9; y <= 25; y += 1) {
    put(c, 21, y, "outline");
    put(c, 42, y, "outline");
    rect(c, 22, y, 41, y, "skin-base");
    rect(c, 40, y, 41, y, "skin-shade");
  }
  rect(c, 22, 11, 23, 15, "skin-light");
  // Face.
  const eyes: Record<string, Array<[number, number, number, number]>> = {
    open: [[27, 16, 28, 17], [35, 16, 36, 17]],
    squint: [[27, 17, 28, 17], [35, 17, 36, 17]],
    happy: [[25, 16, 27, 16], [36, 16, 38, 16]],
    happyBlush: [[25, 16, 27, 16], [36, 16, 38, 16]],
  };
  for (const [x0, y0, x1, y1] of eyes[mood]) rect(c, x0, y0, x1, y1, "eye");
  if (mood === "happy" || mood === "happyBlush") {
    rect(c, 30, 22, 33, 23, "mouth");
  } else {
    rect(c, 30, 22, 33, 22, "mouth");
  }
  if (mood === "happyBlush") {
    rect(c, 24, 20, 25, 21, "blush");
    rect(c, 38, 20, 39, 21, "blush");
  }
  // Neck, torso (shoulder row 30), arms held slightly off the body.
  rect(c, 28, 27, 35, 29, "skin-shade");
  rect(c, 24, 30, 39, 30, "outline");
  for (let y = 31; y <= 46; y += 1) {
    put(c, 24, y, "outline");
    put(c, 39, y, "outline");
    rect(c, 25, y, 38, y, "skin-base");
    rect(c, 37, y, 38, y, "skin-shade");
  }
  rect(c, 18, 30, 21, 30, "outline");
  rect(c, 42, 30, 45, 30, "outline");
  for (let y = 31; y <= 43; y += 1) {
    put(c, 18, y, "outline");
    rect(c, 19, y, 21, y, "skin-base");
    rect(c, 42, y, 44, y, "skin-base");
    put(c, 45, y, "outline");
  }
  rect(c, 19, 44, 21, 45, "skin-base");
  rect(c, 42, 44, 44, 45, "skin-base");
  rect(c, 19, 46, 21, 46, "outline");
  rect(c, 42, 46, 44, 46, "outline");
  // Legs and boots; foot row 61.
  for (let y = 47; y <= 58; y += 1) {
    put(c, 24, y, "outline");
    rect(c, 25, y, 30, y, "skin-base");
    put(c, 31, y, "outline");
    put(c, 32, y, "outline");
    rect(c, 33, y, 38, y, "skin-base");
    put(c, 39, y, "outline");
  }
  rect(c, 22, 59, 31, 61, "boot");
  rect(c, 32, 59, 41, 61, "boot");
  return c;
};

// ---- outfit -------------------------------------------------------------
const tunicFrame = (): Canvas => {
  const c = blank();
  rect(c, 24, 30, 27, 30, "tunic-base");
  rect(c, 36, 30, 39, 30, "tunic-base");
  rect(c, 28, 30, 35, 30, "tunic-light"); // neckline trim
  for (let y = 31; y <= 50; y += 1) {
    const skirt = y >= 45;
    rect(c, skirt ? 23 : 24, y, skirt ? 40 : 39, y, skirt ? "tunic-shade" : "tunic-base");
    if (!skirt) {
      rect(c, 26, y, 27, y, "tunic-light");
      rect(c, 37, y, 38, y, "tunic-shade");
    }
  }
  for (let y = 30; y <= 39; y += 1) {
    rect(c, 18, y, 21, y, "tunic-base");
    rect(c, 42, y, 45, y, "tunic-base");
    put(c, 18, y, "tunic-shade");
    put(c, 45, y, "tunic-shade");
  }
  rect(c, 24, 40, 39, 41, "belt");
  rect(c, 30, 40, 33, 41, "brass");
  return c;
};

// ---- hair ---------------------------------------------------------------
const hairFrame = (laurel: 0 | 1 | null): Canvas => {
  const c = blank();
  rect(c, 24, 7, 39, 7, "hair-shade");
  rect(c, 22, 8, 41, 8, "hair-base");
  for (let y = 9; y <= 12; y += 1) {
    put(c, 21, y, "hair-shade");
    rect(c, 22, y, 41, y, "hair-base");
    put(c, 42, y, "hair-shade");
  }
  rect(c, 26, 8, 29, 9, "hair-light");
  rect(c, 22, 13, 26, 13, "hair-base");
  rect(c, 30, 13, 33, 13, "hair-base");
  rect(c, 37, 13, 41, 13, "hair-base");
  for (let y = 13; y <= 21; y += 1) {
    put(c, 21, y, "hair-shade");
    put(c, 42, y, "hair-shade");
  }
  if (laurel !== null) {
    for (let x = 21; x <= 42; x += 1) put(c, x, 10, x % 2 === 0 ? "leaf" : "leaf-shade");
    put(c, 22, 8, "leaf-light");
    put(c, 41, 8, "leaf-light");
    put(c, 20, laurel === 0 ? 12 : 14, "leaf");
    put(c, 43, laurel === 0 ? 12 : 14, "leaf");
    put(c, 20, 10, "leaf-light");
    put(c, 43, 10, "leaf-light");
  }
  return c;
};

// ---- cape ---------------------------------------------------------------
const capeFrame = (sway: 0 | 1): Canvas => {
  const c = blank();
  for (let y = 31; y <= 58; y += 1) {
    const x0 = y < 42 ? 18 : 16;
    const x1 = y < 42 ? 45 : 47;
    rect(c, x0, y, x1, y, "cape-base");
    put(c, x0, y, "cape-shade");
    put(c, x1, y, "cape-shade");
    rect(c, 26, y, 27, y, "cape-light");
  }
  for (let x = 16; x <= 47; x += 1) {
    put(c, x, 59, (x + sway) % 2 === 0 ? "cape-shade" : "cape-base");
  }
  for (let x = 17; x <= 46; x += 1) if ((x + sway) % 2 === 0) put(c, x, 60, "cape-shade");
  return c;
};

// ---- lantern ------------------------------------------------------------
const lanternFrame = (swing: 0 | 1): Canvas => {
  const c = blank();
  const dx = swing * 2;
  put(c, 43, 47, "chain");
  put(c, 43, 48, "chain");
  put(c, 43 + dx, 49, "chain");
  rect(c, 41 + dx, 50, 46 + dx, 51, "brass");
  for (let y = 52; y <= 57; y += 1) {
    put(c, 41 + dx, y, "brass-shade");
    put(c, 46 + dx, y, "brass-shade");
    rect(c, 42 + dx, y, 45 + dx, y, "glass");
  }
  rect(c, 42 + dx, 53, 45 + dx, 56, "flame");
  rect(c, 43 + dx, 53, 44 + dx, 54, "glow");
  rect(c, 41 + dx, 58, 46 + dx, 59, "brass");
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
