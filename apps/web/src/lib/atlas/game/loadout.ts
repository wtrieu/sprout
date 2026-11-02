/**
 * The equipped look: `{frame?, mapStyle?, sprite: {slot → partId}}` stored
 * as JSON on the player. Validation lives here, not in the route, and knows
 * nothing about the sprite manifest: a ref is allowed when the player owns
 * an item of the matching kind with that ref, or (sprite parts only) it is
 * one of the always-available base parts.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../../../db/client";
import { atlasItems, atlasPlayers } from "../../../db/schema";
import { logEvent } from "../events";
import { isItemRevealed } from "./achievements";

/** Parts every character has from the start (manifest `grantedBy: null`). */
export const BASE_LOADOUT = ["body-default", "outfit-tunic", "hair-short"] as const;

/**
 * The seven sprite slots and every known part's slot. The source of truth is
 * `public/sprite/classic/manifest.json`; loadout.test.ts reads it and fails
 * if these drift. Kept as a const so this route never loads the manifest.
 */
export const SPRITE_SLOTS = [
  "aura-back",
  "cape",
  "body",
  "outfit",
  "hair",
  "item",
  "aura-front",
] as const;

export const PART_SLOTS: Record<string, (typeof SPRITE_SLOTS)[number]> = {
  "body-default": "body",
  "outfit-tunic": "outfit",
  "hair-short": "hair",
  "cape-scholar": "cape",
  "item-lantern": "item",
  "hair-laurel": "hair",
  "aura-spark": "aura-front",
};

const Ref = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "bad id");

/** A null clears the slot; absent leaves it alone. */
export const LoadoutPatchSchema = z
  .object({
    frame: Ref.nullable().optional(),
    mapStyle: Ref.nullable().optional(),
    sprite: z.record(z.enum(SPRITE_SLOTS), Ref.nullable()).optional(),
  })
  .strict();
export type LoadoutPatch = z.infer<typeof LoadoutPatchSchema>;

export type Loadout = {
  frame?: string;
  mapStyle?: string;
  sprite: Record<string, string>;
};

export const parseLoadout = (raw: string | null | undefined): Loadout | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Loadout> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return { ...parsed, sprite: parsed.sprite ?? {} };
  } catch {
    return null;
  }
};

export type EquipResult =
  | { ok: true; loadout: Loadout }
  | { ok: false; error: string };

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
export const equipLoadout = (db: DB, playerId: number, patch: LoadoutPatch): EquipResult => {
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
    if (PART_SLOTS[part] !== slot) return { ok: false, error: `part ${part} does not fit slot ${slot}` };
    const allowed =
      (BASE_LOADOUT as readonly string[]).includes(part) || owns(db, playerId, "sprite_part", part);
    if (!allowed) return { ok: false, error: `you do not own part ${part}` };
    next.sprite[slot] = part;
  }

  db.update(atlasPlayers)
    .set({ loadout: JSON.stringify(next) })
    .where(eq(atlasPlayers.id, playerId))
    .run();
  logEvent(db, { playerId, verb: "equip", data: { patch, loadout: next } });
  return { ok: true, loadout: next };
};
