/**
 * The sprite manifest: the format contract between the placeholder parts
 * here and the real ones from the atlas-sprites repo (docs/atlas.md "Sprite:
 * decision and workflow"). Parts are data under public/sprite/<style>/.
 */
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const anchorName = z.enum(["headTopRow", "shoulderRow", "leftHand", "rightHand", "footRow"]);
const point = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) });

export const SLOT_ORDER = [
  "aura-back",
  "cape",
  "body",
  "outfit",
  "hair",
  "item",
  "aura-front",
] as const;
export type SlotId = (typeof SLOT_ORDER)[number];

export const SpriteManifestSchema = z
  .object({
    version: z.literal(1),
    style: z.string().min(1),
    canvas: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
    palette: z
      .array(z.object({ name: z.string().min(1), hex }))
      .min(1)
      .max(32),
    slots: z
      .array(
        z.object({
          id: z.enum(SLOT_ORDER),
          z: z.number().int().min(0),
          region: z.object({
            x0: z.number().int(),
            y0: z.number().int(),
            x1: z.number().int(),
            y1: z.number().int(),
          }),
          // Anchors this slot's parts must leave unpainted / must paint.
          keepClear: z.array(anchorName),
          mustCover: z.array(anchorName),
        }),
      )
      .length(SLOT_ORDER.length),
    anchors: z.object({
      headTopRow: z.number().int(),
      shoulderRow: z.number().int(),
      leftHand: point,
      rightHand: point,
      footRow: z.number().int(),
    }),
    animations: z.object({
      idle: z.object({ frames: z.literal(2), fps: z.number().positive() }),
      celebrate: z.object({ frames: z.literal(4), fps: z.number().positive() }),
    }),
    swapGroups: z.record(
      z.object({
        colors: z.array(z.string()).min(1),
        tones: z.record(z.array(hex)),
      }),
    ),
    parts: z.array(
      z.object({
        id: z.string().min(1),
        slot: z.enum(SLOT_ORDER),
        animations: z.array(z.enum(["idle", "celebrate"])).refine((a) => a.includes("idle"), {
          message: "every part needs an idle animation",
        }),
        swap: z.array(z.string()),
        // null = always available; else "loot", "achievement:<slug>" or "class:<id>".
        grantedBy: z
          .string()
          .regex(/^(loot|achievement:.+|class:.+)$/)
          .nullable(),
      }),
    ),
    cosmetics: z.object({ frames: z.array(z.string()), mapStyles: z.array(z.string()) }),
  })
  .superRefine((m, ctx) => {
    const names = new Set(m.palette.map((p) => p.name));
    for (const [g, def] of Object.entries(m.swapGroups)) {
      for (const c of def.colors) {
        if (!names.has(c)) ctx.addIssue({ code: "custom", message: `swap group ${g}: unknown color ${c}` });
      }
      for (const [tone, vals] of Object.entries(def.tones)) {
        if (vals.length !== def.colors.length) {
          ctx.addIssue({ code: "custom", message: `swap group ${g}: tone ${tone} has the wrong length` });
        }
      }
    }
    const ids = new Set<string>();
    for (const p of m.parts) {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: `duplicate part ${p.id}` });
      ids.add(p.id);
      for (const g of p.swap) {
        if (!m.swapGroups[g]) ctx.addIssue({ code: "custom", message: `${p.id}: unknown swap group ${g}` });
      }
    }
  });

export type SpriteManifest = z.infer<typeof SpriteManifestSchema>;
export type SpritePart = SpriteManifest["parts"][number];
export type AnimName = keyof SpriteManifest["animations"];

export const parseManifest = (raw: unknown): SpriteManifest => SpriteManifestSchema.parse(raw);

/** Fetch + validate the manifest; null when it is missing or malformed. */
export const loadManifest = async (
  style = "classic",
  fetchImpl: typeof fetch = fetch,
): Promise<SpriteManifest | null> => {
  try {
    const res = await fetchImpl(`/sprite/${style}/manifest.json`);
    if (!res.ok) return null;
    const parsed = SpriteManifestSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const partImagePath = (
  style: string,
  part: Pick<SpritePart, "id" | "slot">,
  anim: AnimName,
  frame: number,
): string => `/sprite/${style}/${part.slot}/${part.id}-${anim}-${frame}.png`;

/** The base look: the first always-available part in each slot. */
export const defaultSelection = (m: SpriteManifest): Partial<Record<SlotId, string>> => {
  const out: Partial<Record<SlotId, string>> = {};
  for (const p of m.parts) if (p.grantedBy === null && !out[p.slot]) out[p.slot] = p.id;
  return out;
};
