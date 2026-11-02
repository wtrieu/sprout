import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { composeFrame, resolveFrame, type Rgba, type Selection } from "./compose";
import { SPRITE_DIR, fsSource, partFile, readManifest, readPng } from "./fsParts";
import type { AnimName, SpriteManifest } from "./manifest";

const m = readManifest();
const source = fsSource(m);
const opaque = (img: Rgba, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3] !== 0;
const hex = (img: Rgba, i: number) =>
  `#${[0, 1, 2].map((k) => img.data[i * 4 + k].toString(16).padStart(2, "0")).join("")}`;

type Anchors = SpriteManifest["anchors"];
const anchorCells = (name: keyof Anchors, a: Anchors, w: number): Array<[number, number]> => {
  const v = a[name];
  if (typeof v === "number") return Array.from({ length: w }, (_, x) => [x, v] as [number, number]);
  return [[v.x, v.y]];
};

describe("committed sprite parts (mechanical validation)", () => {
  const palette = new Set(m.palette.map((p) => p.hex.toLowerCase()));

  for (const part of m.parts) {
    const slot = m.slots.find((s) => s.id === part.slot)!;
    for (const anim of part.animations) {
      for (let f = 0; f < m.animations[anim].frames; f += 1) {
        it(`${part.id} ${anim}-${f}`, () => {
          const img = readPng(partFile(m.style, part, anim, f));
          expect(img.width).toBe(m.canvas.width);
          expect(img.height).toBe(m.canvas.height);
          let painted = 0;
          for (let i = 0; i < img.width * img.height; i += 1) {
            const a = img.data[i * 4 + 3];
            if (a === 0) continue;
            painted += 1;
            const x = i % img.width;
            const y = Math.floor(i / img.width);
            expect(a, `alpha at ${x},${y}`).toBe(255);
            expect(palette.has(hex(img, i)), `${hex(img, i)} at ${x},${y} not in palette`).toBe(true);
            const r = slot.region;
            expect(
              x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1,
              `${x},${y} outside the ${slot.id} region`,
            ).toBe(true);
          }
          expect(painted).toBeGreaterThan(0);
          for (const name of slot.keepClear) {
            for (const [x, y] of anchorCells(name, m.anchors, img.width)) {
              expect(opaque(img, x, y), `${name} (${x},${y}) must stay clear`).toBe(false);
            }
          }
          for (const name of slot.mustCover) {
            const cells = anchorCells(name, m.anchors, img.width);
            const ok =
              typeof m.anchors[name] === "number"
                ? cells.some(([x, y]) => opaque(img, x, y))
                : cells.every(([x, y]) => opaque(img, x, y));
            expect(ok, `${name} must be covered`).toBe(true);
          }
        });
      }
    }
  }

  it("has no stray PNGs and no missing frames", () => {
    const expected = new Set<string>();
    for (const p of m.parts) {
      for (const anim of p.animations) {
        for (let f = 0; f < m.animations[anim].frames; f += 1) {
          expected.add(`${p.slot}/${p.id}-${anim}-${f}.png`);
        }
      }
    }
    const found = new Set<string>();
    for (const dir of readdirSync(SPRITE_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const f of readdirSync(path.join(SPRITE_DIR, dir.name))) found.add(`${dir.name}/${f}`);
    }
    expect([...found].sort()).toEqual([...expected].sort());
  });
});

describe("compositor", () => {
  const base: Selection = {
    parts: { body: "body-default", outfit: "outfit-tunic", hair: "hair-short" },
  };

  it("falls back to the idle frame when a part lacks the animation", () => {
    const lantern = m.parts.find((p) => p.id === "item-lantern")!;
    expect(resolveFrame(m, lantern, "celebrate", 3)).toEqual({ anim: "idle", frame: 1 });
    const sel: Selection = { parts: { ...base.parts, item: "item-lantern" } };
    // The lantern holds its idle frame while the body cycles celebrate frames.
    const a = composeFrame(m, sel, "celebrate", 0, source);
    const b = composeFrame(m, sel, "celebrate", 2, source);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    const c = composeFrame(m, sel, "celebrate", 1, source);
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
  });

  it("layers by z order: outfit paints over the body", () => {
    const img = composeFrame(m, base, "idle", 0, source);
    const i = (20 * img.width + 14) * 4; // torso, under the tunic
    expect(hex(img, i / 4)).toBe(m.palette.find((p) => p.name === "tunic-base")?.hex);
  });

  it("palette-swaps skin and hair by index, leaving other colors alone", () => {
    const plain = composeFrame(m, base, "idle", 0, source);
    const swapped = composeFrame(m, { ...base, tones: { skin: "deep", hair: "red" } }, "idle", 0, source);
    const skin = m.palette.find((p) => p.name === "skin-base")!.hex;
    const tunic = m.palette.find((p) => p.name === "tunic-base")!.hex;
    const count = (img: Rgba, color: string) => {
      let n = 0;
      for (let i = 0; i < img.width * img.height; i += 1) if (hex(img, i) === color && img.data[i * 4 + 3]) n += 1;
      return n;
    };
    expect(count(plain, skin)).toBeGreaterThan(0);
    expect(count(swapped, skin)).toBe(0);
    expect(count(swapped, tunic)).toBe(count(plain, tunic));
  });
});

// The golden set: six named looks composed through the pure compositor and
// hashed against a committed snapshot. Regenerate with UPDATE_SPRITE_GOLDEN=1
// (which also rewrites the contact sheet PNG so a human can look at it).
const GOLDEN: Array<{ name: string; sel: Selection }> = [
  { name: "base", sel: { parts: { body: "body-default", outfit: "outfit-tunic", hair: "hair-short" } } },
  {
    name: "scholar",
    sel: {
      parts: { body: "body-default", outfit: "outfit-tunic", hair: "hair-short", cape: "cape-scholar" },
      tones: { skin: "tan", hair: "black" },
    },
  },
  {
    name: "lantern-bearer",
    sel: {
      parts: { body: "body-default", outfit: "outfit-tunic", hair: "hair-short", item: "item-lantern" },
      tones: { skin: "deep", hair: "brown" },
    },
  },
  {
    name: "laureate",
    sel: {
      parts: { body: "body-default", outfit: "outfit-tunic", hair: "hair-laurel" },
      tones: { skin: "fair", hair: "blond" },
    },
  },
  {
    name: "sparked",
    sel: {
      parts: { body: "body-default", outfit: "outfit-tunic", hair: "hair-short", "aura-front": "aura-spark" },
      tones: { hair: "red" },
    },
  },
  {
    name: "everything",
    sel: {
      parts: {
        body: "body-default",
        outfit: "outfit-tunic",
        hair: "hair-laurel",
        cape: "cape-scholar",
        item: "item-lantern",
        "aura-front": "aura-spark",
      },
      tones: { skin: "tan", hair: "red" },
    },
  },
];
const SHOTS: Array<[AnimName, number]> = [
  ["idle", 0],
  ["idle", 1],
  ["celebrate", 0],
  ["celebrate", 1],
  ["celebrate", 2],
  ["celebrate", 3],
];
const GOLDEN_DIR = path.join(process.cwd(), "src/components/atlas/sprite/__golden__");
const GOLDEN_JSON = path.join(GOLDEN_DIR, "golden.json");

describe("golden-set contact sheet", () => {
  const frames = GOLDEN.map((g) => SHOTS.map(([a, f]) => composeFrame(m, g.sel, a, f, source)));
  const hashes = Object.fromEntries(
    GOLDEN.map((g, i) => {
      const h = createHash("sha256");
      for (const f of frames[i]) h.update(Buffer.from(f.data));
      return [g.name, h.digest("hex")];
    }),
  );

  it("composes the six named combinations to the committed snapshot", () => {
    if (process.env.UPDATE_SPRITE_GOLDEN) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(GOLDEN_JSON, `${JSON.stringify(hashes, null, 2)}\n`);
      // Rows = combos, columns = shots, 3× scale with a 2px gutter.
      const s = 3;
      const gut = 2;
      const cw = m.canvas.width * s;
      const ch = m.canvas.height * s;
      const sheet = new PNG({
        width: SHOTS.length * (cw + gut) + gut,
        height: GOLDEN.length * (ch + gut) + gut,
      });
      for (let i = 0; i < sheet.data.length; i += 4) {
        sheet.data[i] = 58;
        sheet.data[i + 1] = 58;
        sheet.data[i + 2] = 66;
        sheet.data[i + 3] = 255;
      }
      frames.forEach((row, r) =>
        row.forEach((img, c) => {
          for (let y = 0; y < ch; y += 1) {
            for (let x = 0; x < cw; x += 1) {
              const src = (Math.floor(y / s) * img.width + Math.floor(x / s)) * 4;
              if (!img.data[src + 3]) continue;
              const dst = ((gut + r * (ch + gut) + y) * sheet.width + gut + c * (cw + gut) + x) * 4;
              for (let k = 0; k < 4; k += 1) sheet.data[dst + k] = img.data[src + k];
            }
          }
        }),
      );
      writeFileSync(path.join(GOLDEN_DIR, "contact-sheet.png"), PNG.sync.write(sheet));
    }
    expect(existsSync(GOLDEN_JSON), "run with UPDATE_SPRITE_GOLDEN=1 to create the snapshot").toBe(true);
    expect(hashes).toEqual(JSON.parse(readFileSync(GOLDEN_JSON, "utf8")));
  });

  it("every combination differs from every other", () => {
    expect(new Set(Object.values(hashes)).size).toBe(GOLDEN.length);
  });
});
