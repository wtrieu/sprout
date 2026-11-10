/**
 * The equipped look: `{frame?, mapStyle?, sprite: {slot → partId}, tones?:
 * {swapGroup → toneId}}` stored as JSON on the player. Validation lives
 * here, not in the route. Which parts exist, which slot each fits, which are
 * free from the start and which tones exist all come from the rendered
 * style's sprite manifest (public/sprite/<style>/manifest.json), read once
 * per process. A ref is allowed when the player owns an item of the matching
 * kind with that ref, or (sprite parts only) it is a base part.
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../../../db/client";
import { atlasItems, atlasPlayers } from "../../../db/schema";
import { SpriteManifestSchema } from "../../../components/atlas/sprite/manifest";
import { logEvent } from "../events";
import { RENDERED_SPRITE_STYLE } from "../spriteStyle";
import { isItemRevealed } from "./achievements";

/** The seven sprite slots, back to front. A style may leave some empty. */
export const SPRITE_SLOTS = [
  "aura-back",
  "cape",
  "body",
  "outfit",
  "hair",
  "item",
  "aura-front",
] as const;
export type SpriteSlot = (typeof SPRITE_SLOTS)[number];

/** What the loadout rules need from a manifest. */
export type SpriteRules = {
  style: string;
  /** Every known part → its slot. */
  partSlots: Record<string, SpriteSlot>;
  /** Parts every character has from the start (manifest `grantedBy: null`). */
  baseParts: string[];
  /** Swap group id → its tone ids. */
  swapGroups: Record<string, string[]>;
};

const rulesCache = new Map<string, SpriteRules>();

/** Server-side: apps/web is the cwd in dev, under launchd and in vitest. */
export const manifestPath = (style: string): string =>
  path.resolve(process.cwd(), "public", "sprite", style, "manifest.json");

/**
 * The loadout rules for a style, parsed from its manifest with the shared
 * zod schema and cached per process (the manifest only changes on deploy).
 * A missing or malformed manifest throws: equipping against a guess is
 * worse than a loud error.
 */
export const spriteRules = (style: string = RENDERED_SPRITE_STYLE): SpriteRules => {
  const hit = rulesCache.get(style);
  if (hit) return hit;
  const m = SpriteManifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath(style), "utf8")));
  const rules: SpriteRules = {
    style,
    partSlots: Object.fromEntries(m.parts.map((p) => [p.id, p.slot])),
    baseParts: m.parts.filter((p) => p.grantedBy === null).map((p) => p.id),
    swapGroups: Object.fromEntries(
      Object.entries(m.swapGroups).map(([g, def]) => [g, Object.keys(def.tones)]),
    ),
  };
  rulesCache.set(style, rules);
  return rules;
};

const Ref = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "bad id");

/** A null clears the slot / tone (or all tones); absent leaves it alone. */
export const LoadoutPatchSchema = z
  .object({
    frame: Ref.nullable().optional(),
    mapStyle: Ref.nullable().optional(),
    sprite: z.record(z.enum(SPRITE_SLOTS), Ref.nullable()).optional(),
    tones: z.record(Ref, Ref.nullable()).nullable().optional(),
  })
  .strict();
export type LoadoutPatch = z.infer<typeof LoadoutPatchSchema>;

/** The look picked at character creation: base parts and tones only. */
export const LookSchema = z
  .object({
    sprite: z.record(z.enum(SPRITE_SLOTS), Ref).optional(),
    tones: z.record(Ref, Ref).optional(),
  })
  .strict();
export type Look = z.infer<typeof LookSchema>;

export type Loadout = {
  frame?: string;
  mapStyle?: string;
  sprite: Record<string, string>;
  tones?: Record<string, string>;
};

export const parseLoadout = (raw: string | null | undefined): Loadout | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Loadout> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const { tones, ...rest } = parsed;
    const out: Loadout = { ...rest, sprite: parsed.sprite ?? {} };
    if (tones && typeof tones === "object" && !Array.isArray(tones)) out.tones = tones;
    return out;
  } catch {
    return null;
  }
};

export type EquipResult =
  | { ok: true; loadout: Loadout }
  | { ok: false; error: string };

/** Null when the tone exists in the manifest; else the rejection. */
const toneError = (rules: SpriteRules, group: string, tone: string): string | null => {
  const tones = rules.swapGroups[group];
  if (!tones) return `unknown swap group ${group}`;
  if (!tones.includes(tone)) return `unknown ${group} tone ${tone}`;
  return null;
};

/** Null when the part exists and fits the slot. */
const slotError = (rules: SpriteRules, slot: string, part: string): string | null =>
  rules.partSlots[part] === slot ? null : `part ${part} does not fit slot ${slot}`;

/**
 * Turn a creation-time look into a loadout. A brand-new character owns
 * nothing, so only base parts are allowed.
 */
export const lookToLoadout = (look: Look, rules: SpriteRules = spriteRules()): EquipResult => {
  const loadout: Loadout = { sprite: {} };
  for (const [slot, part] of Object.entries(look.sprite ?? {})) {
    const bad = slotError(rules, slot, part);
    if (bad) return { ok: false, error: bad };
    if (!rules.baseParts.includes(part)) return { ok: false, error: `you do not own part ${part}` };
    loadout.sprite[slot] = part;
  }
  const tones = Object.entries(look.tones ?? {});
  for (const [group, tone] of tones) {
    const bad = toneError(rules, group, tone);
    if (bad) return { ok: false, error: bad };
  }
  if (tones.length > 0) loadout.tones = Object.fromEntries(tones);
  return { ok: true, loadout };
};

/** Owned means in hand: loot from an unopened chest does not count yet. */
const owns = (db: DB, playerId: number, kind: string, ref: string): boolean =>
  db
    .select()
    .from(atlasItems)
    .where(
      and(eq(atlasItems.playerId, playerId), eq(atlasItems.kind, kind), eq(atlasItems.ref, ref)),
    )
    .all()
    .some((i) => isItemRevealed(db, i));

/** Merge a validated patch into the stored loadout and log `equip`. */
export const equipLoadout = (
  db: DB,
  playerId: number,
  patch: LoadoutPatch,
  rules: SpriteRules = spriteRules(),
): EquipResult => {
  const player = db.select().from(atlasPlayers).where(eq(atlasPlayers.id, playerId)).get();
  if (!player) return { ok: false, error: "no character" };
  const next: Loadout = { ...(parseLoadout(player.loadout) ?? { sprite: {} }) };
  next.sprite = { ...next.sprite };

  if (patch.frame !== undefined) {
    if (patch.frame !== null && !owns(db, playerId, "frame", patch.frame)) {
      return { ok: false, error: `you do not own frame ${patch.frame}` };
    }
    if (patch.frame === null) delete next.frame;
    else next.frame = patch.frame;
  }
  if (patch.mapStyle !== undefined) {
    if (patch.mapStyle !== null && !owns(db, playerId, "map_style", patch.mapStyle)) {
      return { ok: false, error: `you do not own map style ${patch.mapStyle}` };
    }
    if (patch.mapStyle === null) delete next.mapStyle;
    else next.mapStyle = patch.mapStyle;
  }
  for (const [slot, part] of Object.entries(patch.sprite ?? {})) {
    if (part === null) {
      delete next.sprite[slot];
      continue;
    }
    const bad = slotError(rules, slot, part);
    if (bad) return { ok: false, error: bad };
    const allowed = rules.baseParts.includes(part) || owns(db, playerId, "sprite_part", part);
    if (!allowed) return { ok: false, error: `you do not own part ${part}` };
    next.sprite[slot] = part;
  }
  if (patch.tones !== undefined) {
    const tones: Record<string, string> = patch.tones === null ? {} : { ...(next.tones ?? {}) };
    for (const [group, tone] of Object.entries(patch.tones ?? {})) {
      if (tone === null) {
        delete tones[group];
        continue;
      }
      const bad = toneError(rules, group, tone);
      if (bad) return { ok: false, error: bad };
      tones[group] = tone;
    }
    if (Object.keys(tones).length > 0) next.tones = tones;
    else delete next.tones;
  }

  db.update(atlasPlayers)
    .set({ loadout: JSON.stringify(next) })
    .where(eq(atlasPlayers.id, playerId))
    .run();
  logEvent(db, { playerId, verb: "equip", data: { patch, loadout: next } });
  return { ok: true, loadout: next };
};
