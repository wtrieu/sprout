/**
 * The Look panel's model: prize categories (equipment slots), what exists in
 * each, what is owned, what is equipped in a draft, and the draft reducer.
 * Pure — the LookPanel component only renders this and dispatches actions.
 *
 * "What exists" comes from data only: manifest parts with `grantedBy` set for
 * sprite parts, the FRAME_ACCENTS / MAP_STYLE_ACCENTS keys for frames and map
 * styles. Base parts (`grantedBy: null`) are always owned; loot needs an item
 * with status "owned". Rarity is not modelled: nothing client-side carries it.
 */
import { partLabel } from "./creator";
import {
  COSMETIC_LABELS,
  FRAME_ACCENTS,
  MAP_STYLE_ACCENTS,
  loadoutPatch,
  type Loadout,
  type LoadoutPatch,
} from "./loadout";
import { defaultSelection, type SlotId, type SpriteManifest } from "./sprite/manifest";

export type CategoryId = "outfit" | "item" | "headwear" | "frame" | "mapStyle" | "cape" | "aura";

export type CategoryKind = "sprite" | "frame" | "mapStyle";

export type Tile = {
  id: string;
  /** Child-facing name; never shown for a locked tile. */
  label: string;
  owned: boolean;
  /** A prize (loot) rather than an always-available base part. */
  prize: boolean;
  /** Sprite slot the part lives in (sprite categories only). */
  slot?: SlotId;
};

export type Category = {
  id: CategoryId;
  label: string;
  kind: CategoryKind;
  /** Sprite slots this category fills (empty for frames and map styles). */
  slots: SlotId[];
  /** False when a base part always fills the slot (outfit). */
  canEmpty: boolean;
  /** Slot-button text when nothing is equipped. */
  emptyLabel: string;
  tiles: Tile[];
  /** Prizes owned / prizes that exist (base parts are not counted). */
  found: number;
  total: number;
};

type SpriteCategoryDef = {
  id: CategoryId;
  label: string;
  slots: SlotId[];
  emptyLabel: string;
  /** Headwear shares the hair slot with base hair, which belongs to Appearance. */
  lootOnly?: boolean;
};

// Display order of the slot buttons; frame and map style sit between.
const SPRITE_DEFS: Record<string, SpriteCategoryDef> = {
  outfit: { id: "outfit", label: "Outfit", slots: ["outfit"], emptyLabel: "Everyday clothes" },
  item: { id: "item", label: "Item", slots: ["item"], emptyLabel: "Empty hands" },
  headwear: { id: "headwear", label: "Headwear", slots: ["hair"], emptyLabel: "Nothing on", lootOnly: true },
  cape: { id: "cape", label: "Cape", slots: ["cape"], emptyLabel: "No cape" },
  aura: { id: "aura", label: "Aura", slots: ["aura-back", "aura-front"], emptyLabel: "No aura" },
};
const ORDER: CategoryId[] = ["outfit", "item", "headwear", "frame", "mapStyle", "cape", "aura"];

/** Refs of owned items of one kind. */
export const ownedRefs = (
  items: ReadonlyArray<{ kind: string; ref: string; status: string }>,
  kind: string,
): Set<string> => new Set(items.filter((i) => i.status === "owned" && i.kind === kind).map((i) => i.ref));

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");

/** Child-facing name for a sprite part, frame or map style; never a raw id. */
export const prizeLabel = (id: string, slotOrPrefix: string): string =>
  COSMETIC_LABELS[id] ?? partLabel(id, slotOrPrefix);

/** Owned tiles first, locked silhouettes after; order kept within each. */
export const ownedFirst = (tiles: Tile[]): Tile[] => [
  ...tiles.filter((t) => t.owned),
  ...tiles.filter((t) => !t.owned),
];

const spriteCategory = (m: SpriteManifest, def: SpriteCategoryDef, owned: Set<string>): Category => {
  const parts = m.parts.filter(
    (p) => def.slots.includes(p.slot) && !(def.lootOnly && p.grantedBy === null),
  );
  const tiles: Tile[] = parts.map((p) => ({
    id: p.id,
    label: prizeLabel(p.id, p.slot),
    owned: p.grantedBy === null || owned.has(p.id),
    prize: p.grantedBy !== null,
    slot: p.slot,
  }));
  const prizes = tiles.filter((t) => t.prize);
  return {
    id: def.id,
    label: def.label,
    kind: "sprite",
    slots: def.slots,
    canEmpty: !tiles.some((t) => !t.prize),
    emptyLabel: def.emptyLabel,
    tiles: ownedFirst(tiles),
    found: prizes.filter((t) => t.owned).length,
    total: prizes.length,
  };
};

const cosmeticCategory = (
  id: "frame" | "mapStyle",
  catalogue: Record<string, string>,
  owned: Set<string>,
): Category => {
  // Owned refs the accent table does not know still show (unstyled), never vanish.
  const ids = [...new Set([...Object.keys(catalogue), ...owned])];
  const prefix = id === "frame" ? "frame" : "style";
  const tiles: Tile[] = ids.map((ref) => ({
    id: ref,
    label: COSMETIC_LABELS[ref] ?? titleCase(ref.startsWith(`${prefix}-`) ? ref.slice(prefix.length + 1) : ref),
    owned: owned.has(ref),
    prize: true,
  }));
  return {
    id,
    label: id === "frame" ? "Frame" : "Map style",
    kind: id,
    slots: [],
    canEmpty: true,
    emptyLabel: id === "frame" ? "No frame" : "Plain map",
    tiles: ownedFirst(tiles),
    found: tiles.filter((t) => t.owned).length,
    total: tiles.length,
  };
};

/**
 * The prize categories, in slot-button order. A sprite category appears only
 * when the manifest has at least one prize part for it (so cape and aura stay
 * hidden until such parts exist); frame and map style always appear.
 */
export const lookCategories = (
  m: SpriteManifest,
  items: ReadonlyArray<{ kind: string; ref: string; status: string }>,
): Category[] => {
  const parts = ownedRefs(items, "sprite_part");
  return ORDER.flatMap((id): Category[] => {
    if (id === "frame") return [cosmeticCategory("frame", FRAME_ACCENTS, ownedRefs(items, "frame"))];
    if (id === "mapStyle") return [cosmeticCategory("mapStyle", MAP_STYLE_ACCENTS, ownedRefs(items, "map_style"))];
    const c = spriteCategory(m, SPRITE_DEFS[id], parts);
    return c.total > 0 ? [c] : [];
  });
};

const partIn = (m: SpriteManifest, id: string | undefined, slot: SlotId) =>
  id ? m.parts.find((p) => p.id === id && p.slot === slot) : undefined;

/** A base (always-available) hair part id, else undefined. */
export const baseHairOf = (m: SpriteManifest, id: string | undefined): string | undefined =>
  partIn(m, id, "hair")?.grantedBy === null ? id : undefined;

/** What the category has on in this look, or null when it is empty. */
export const equippedIn = (m: SpriteManifest, c: Category, look: Loadout): string | null => {
  if (c.kind === "frame") return look.frame ?? null;
  if (c.kind === "mapStyle") return look.mapStyle ?? null;
  for (const slot of c.slots) {
    const p = partIn(m, look.sprite[slot], slot);
    if (p && c.tiles.some((t) => t.id === p.id)) return p.id;
  }
  // A slot with a base part shows its default when the loadout leaves it unset.
  if (!c.canEmpty) return defaultSelection(m)[c.slots[0]] ?? null;
  return null;
};

/**
 * What a tile's thumbnail shows: the player's own draft (body, tones, every
 * other part) with only this tile's category swapped in.
 */
export const tileLook = (look: Loadout, c: Category, t: Tile): Loadout => {
  if (c.kind === "frame") return { ...look, frame: t.id };
  if (c.kind === "mapStyle") return { ...look, mapStyle: t.id };
  const sprite = { ...look.sprite };
  for (const slot of c.slots) delete sprite[slot];
  if (t.slot) sprite[t.slot] = t.id;
  return { ...look, sprite };
};

/** Same look as far as a save is concerned: nothing to PATCH. */
export const sameLook = (saved: Loadout, draft: Loadout): boolean =>
  Object.keys(loadoutPatch(saved, draft)).length === 0;

// --- headwear vs hair: both live in the sprite `hair` slot --------------------

/** The look with `hairUnder` set to the given id, or the key removed. */
const withHairUnder = (look: Loadout, id: string | undefined): Loadout => {
  const rest = { ...look };
  delete rest.hairUnder;
  return id ? { ...rest, hairUnder: id } : rest;
};

/**
 * Put headwear on: it replaces the hair value, and `hairUnder` (persisted
 * with the loadout) remembers the base hair it covered. Swapping one
 * headwear for another keeps the existing memory.
 */
export const wearHeadwear = (m: SpriteManifest, look: Loadout, id: string): Loadout =>
  withHairUnder(
    { ...look, sprite: { ...look.sprite, hair: id } },
    baseHairOf(m, look.sprite.hair) ?? baseHairOf(m, look.hairUnder),
  );

/**
 * Take headwear off: back to the `hairUnder` it covered, else the saved
 * loadout's base hair, else the slot default (key removed). `hairUnder`
 * clears.
 */
export const removeHeadwear = (m: SpriteManifest, look: Loadout, saved: Loadout): Loadout => {
  const back = baseHairOf(m, look.hairUnder) ?? baseHairOf(m, saved.sprite.hair);
  const sprite = { ...look.sprite };
  if (back) sprite.hair = back;
  else delete sprite.hair;
  return withHairUnder({ ...look, sprite }, undefined);
};

// --- the draft reducer --------------------------------------------------------

export type LookState = {
  saved: Loadout;
  draft: Loadout;
  /** The slot whose picker grid is showing. */
  open: CategoryId | null;
  appearanceOpen: boolean;
};

export type LookAction =
  | { type: "open"; category: CategoryId }
  | { type: "tap"; category: Category; id: string }
  | { type: "part"; slot: SlotId; id: string }
  | { type: "tone"; group: string; tone: string }
  | { type: "toggleAppearance" }
  | { type: "undo" };

export const initLook = (saved: Loadout, initial?: Partial<Omit<LookState, "saved">>): LookState => ({
  saved,
  draft: saved,
  open: null,
  appearanceOpen: false,
  ...initial,
});

const withSprite = (look: Loadout, edit: (s: Record<string, string>) => void): Loadout => {
  const sprite = { ...look.sprite };
  edit(sprite);
  return { ...look, sprite };
};

/**
 * Tapping a tile: an unequipped tile tries it on; the equipped tile of a
 * slot that may be empty takes it off; the equipped tile of a slot that
 * always needs a value does nothing. Locked tiles never dispatch.
 */
const tap = (m: SpriteManifest, s: LookState, c: Category, id: string): LookState => {
  const tile = c.tiles.find((t) => t.id === id);
  if (!tile?.owned) return s;
  const on = equippedIn(m, c, s.draft) === id;
  if (on && !c.canEmpty) return s;
  if (c.kind === "frame") return { ...s, draft: { ...s.draft, frame: on ? undefined : id } };
  if (c.kind === "mapStyle") return { ...s, draft: { ...s.draft, mapStyle: on ? undefined : id } };
  if (c.id === "headwear") {
    return { ...s, draft: on ? removeHeadwear(m, s.draft, s.saved) : wearHeadwear(m, s.draft, id) };
  }
  // One part per category: clear its slots (aura spans two), then set.
  return {
    ...s,
    draft: withSprite(s.draft, (sp) => {
      for (const slot of c.slots) delete sp[slot];
      if (!on && tile.slot) sp[tile.slot] = id;
    }),
  };
};

export const lookReducer = (m: SpriteManifest, s: LookState, a: LookAction): LookState => {
  switch (a.type) {
    case "open":
      return { ...s, open: s.open === a.category ? null : a.category };
    case "tap":
      return tap(m, s, a.category, a.id);
    case "part": {
      // A base hair picked in Appearance replaces any headwear (same slot).
      const draft = withSprite(s.draft, (sp) => {
        sp[a.slot] = a.id;
      });
      return { ...s, draft: a.slot === "hair" ? withHairUnder(draft, undefined) : draft };
    }
    case "tone":
      return { ...s, draft: { ...s.draft, tones: { ...s.draft.tones, [a.group]: a.tone } } };
    case "toggleAppearance":
      return { ...s, appearanceOpen: !s.appearanceOpen };
    case "undo":
      return { ...s, draft: s.saved };
  }
};

/** The draft as Save sends it: a `hairUnder` that is not a base hair part clears. */
const sendable = (m: SpriteManifest, draft: Loadout): Loadout =>
  draft.hairUnder === undefined ? draft : withHairUnder(draft, baseHairOf(m, draft.hairUnder));

/**
 * Nothing to save. Compared on sendable looks, so a stale non-base
 * `hairUnder` alone does not light Save; any real change also clears it.
 */
export const isClean = (m: SpriteManifest, s: LookState): boolean =>
  sameLook(sendable(m, s.saved), sendable(m, s.draft));

/**
 * The PATCH body Save sends: the `loadoutPatch` contract (now carrying
 * `hairUnder`), or null when there is nothing to save. Never sends a
 * `hairUnder` pointing at a non-base part.
 */
export const savePatch = (m: SpriteManifest, s: LookState): LoadoutPatch | null =>
  isClean(m, s) ? null : loadoutPatch(s.saved, sendable(m, s.draft));

/** The base hair the Appearance row marks while headwear covers it. */
export const appearanceHair = (m: SpriteManifest, s: LookState): string | undefined =>
  baseHairOf(m, s.draft.sprite.hair) ??
  baseHairOf(m, s.draft.hairUnder) ??
  baseHairOf(m, s.saved.sprite.hair) ??
  defaultSelection(m).hair;
