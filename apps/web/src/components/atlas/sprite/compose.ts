/**
 * The pure RGBA compositor. No DOM, no fs: callers hand it decoded images
 * (the browser via canvas getImageData, tests via pngjs), so the same code
 * renders in both places. Palette swaps go through palette indices: a pixel
 * is matched to its palette entry, and entries in a swap group take the
 * chosen tone's color at the same position.
 */
import { SLOT_ORDER, type AnimName, type SlotId, type SpriteManifest, type SpritePart } from "./manifest";

export type Rgba = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };

export type Selection = {
  /** slot → part id; slots left out stay empty. */
  parts: Partial<Record<SlotId, string>>;
  /** swap group → tone name (e.g. {skin: "tan", hair: "red"}). */
  tones?: Record<string, string>;
};

/** Supplies a decoded part frame; null when the image is not available. */
export type ImageSource = (part: SpritePart, anim: AnimName, frame: number) => Rgba | null;

/** A part lacking the animation falls back to its idle frame. */
export const resolveFrame = (
  m: SpriteManifest,
  part: SpritePart,
  anim: AnimName,
  frame: number,
): { anim: AnimName; frame: number } => {
  const a: AnimName = part.animations.includes(anim) ? anim : "idle";
  const n = m.animations[a].frames;
  return { anim: a, frame: ((frame % n) + n) % n };
};

type Rgb = [number, number, number];
const hexToRgb = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const key = ([r, g, b]: Rgb) => (r << 16) | (g << 8) | b;

const swapTable = (m: SpriteManifest, tones: Record<string, string>, groups: string[]) => {
  const byName = new Map(m.palette.map((p) => [p.name, hexToRgb(p.hex)]));
  const table = new Map<number, Rgb>();
  for (const g of groups) {
    const def = m.swapGroups[g];
    const tone = def?.tones[tones[g] ?? ""];
    if (!def || !tone) continue;
    def.colors.forEach((name, i) => {
      const from = byName.get(name);
      if (from) table.set(key(from), hexToRgb(tone[i]));
    });
  }
  return table;
};

export const emptyFrame = (m: SpriteManifest): Rgba => ({
  width: m.canvas.width,
  height: m.canvas.height,
  data: new Uint8ClampedArray(m.canvas.width * m.canvas.height * 4),
});

export const composeFrame = (
  m: SpriteManifest,
  sel: Selection,
  anim: AnimName,
  frame: number,
  source: ImageSource,
): Rgba => {
  const out = emptyFrame(m);
  const slotZ = (id: SlotId) => m.slots.find((s) => s.id === id)?.z ?? SLOT_ORDER.indexOf(id);
  const slots = [...SLOT_ORDER].sort((a, b) => slotZ(a) - slotZ(b));
  for (const slot of slots) {
    const id = sel.parts[slot];
    const part = id ? m.parts.find((p) => p.id === id && p.slot === slot) : undefined;
    if (!part) continue;
    const r = resolveFrame(m, part, anim, frame);
    const img = source(part, r.anim, r.frame);
    if (!img || img.width !== out.width || img.height !== out.height) continue;
    const swaps = swapTable(m, sel.tones ?? {}, part.swap);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] === 0) continue;
      const rgb: Rgb = [img.data[i], img.data[i + 1], img.data[i + 2]];
      const [r2, g2, b2] = swaps.get(key(rgb)) ?? rgb;
      out.data[i] = r2;
      out.data[i + 1] = g2;
      out.data[i + 2] = b2;
      out.data[i + 3] = 255;
    }
  }
  return out;
};
