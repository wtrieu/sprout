/**
 * Shared client types for the game layer, coded against the PR-D API shapes
 * (docs/atlas.md "PR-D — engine"), plus the data-driven accent treatments for
 * equipped frames and map styles. Everything here is defensive: the routes
 * land in a parallel branch, so any field may be absent.
 */
import { SLOT_ORDER, defaultSelection, type SlotId, type SpriteManifest } from "./sprite/manifest";
import type { Selection } from "./sprite/compose";

export type Loadout = { frame?: string; mapStyle?: string; sprite: Record<string, string> };

/** The player's loadout arrives as an object or as the raw JSON column. */
export const parseLoadout = (raw: unknown): Loadout => {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const sprite: Record<string, string> = {};
  if (o.sprite && typeof o.sprite === "object") {
    for (const [slot, id] of Object.entries(o.sprite as Record<string, unknown>)) {
      if (typeof id === "string") sprite[slot] = id;
    }
  }
  return {
    frame: typeof o.frame === "string" ? o.frame : undefined,
    mapStyle: typeof o.mapStyle === "string" ? o.mapStyle : undefined,
    sprite,
  };
};

/** Base parts, overridden by whatever the loadout equips that the manifest knows. */
export const selectionFromLoadout = (
  m: SpriteManifest,
  loadout: Loadout | null | undefined,
  tones?: Record<string, string>,
): Selection => {
  const parts = defaultSelection(m);
  for (const slot of SLOT_ORDER) {
    const id = loadout?.sprite[slot];
    if (id && m.parts.some((p) => p.id === id && p.slot === slot)) parts[slot as SlotId] = id;
  }
  return { parts, tones };
};

export type ClassOption = {
  classId: string;
  title: string;
  affinity: string;
  style: string;
  blurb: string;
  perk: string;
};
export type PendingAchievement = {
  id: number;
  slug: string;
  title: string;
  flavor: string;
  hidden: boolean;
  items: Array<{ id: number; kind: string; ref: string }>;
};
export type PendingOffer = {
  id: number;
  gateLevel: number;
  options: Array<ClassOption | null>;
  deadline: string | null;
  status: string;
};
export type Pending = { achievements: PendingAchievement[]; offer: PendingOffer | null };
export type NextGate = { level: number; at: number } | null;
export type PlayerClass = { classId?: string; title?: string } | null;

/** Frame accents: a ring around the character and the header card. */
export const FRAME_ACCENTS: Record<string, string> = {
  "frame-oak": "ring-2 ring-amber-900/70",
  "frame-brass": "ring-2 ring-yellow-600/70",
  "frame-ivy": "ring-2 ring-emerald-700/70",
  "frame-stellar": "ring-2 ring-indigo-400/70 shadow-[0_0_12px_rgba(129,140,248,0.35)]",
};

/** Map-style accents: a quiet wash on the map header. */
export const MAP_STYLE_ACCENTS: Record<string, string> = {
  "style-parchment": "bg-gradient-to-br from-amber-950/30 to-neutral-900",
  "style-night": "bg-gradient-to-br from-indigo-950/50 to-neutral-900",
  "style-botanical": "bg-gradient-to-br from-emerald-950/40 to-neutral-900",
};

export const accentFor = (table: Record<string, string>, id: string | undefined): string =>
  (id && table[id]) || "";

export const COSMETIC_LABELS: Record<string, string> = {
  "frame-oak": "Oak frame",
  "frame-brass": "Brass frame",
  "frame-ivy": "Ivy frame",
  "frame-stellar": "Stellar frame",
  "style-parchment": "Parchment map",
  "style-night": "Night map",
  "style-botanical": "Botanical map",
};

/** Friendly names for loot kinds the inventory and reveal show. */
export const KIND_LABELS: Record<string, string> = {
  frame: "Frame",
  map_style: "Map style",
  sprite_part: "Outfit piece",
  respec_token: "Respec token",
  fog_reveal: "Fog reveal",
  rare_node_key: "Rare-node key",
};

export type LoadoutPatch = {
  frame?: string | null;
  mapStyle?: string | null;
  sprite?: Record<string, string | null>;
};

/**
 * The PATCH body for a picker save. The server treats an absent key as
 * "leave alone" and only an explicit null as "clear", so anything the user
 * emptied goes out as null; unchanged keys are omitted.
 */
export const loadoutPatch = (saved: Loadout, draft: Loadout): LoadoutPatch => {
  const patch: LoadoutPatch = {};
  for (const k of ["frame", "mapStyle"] as const) {
    if (draft[k] !== saved[k]) patch[k] = draft[k] ?? null;
  }
  const sprite: Record<string, string | null> = {};
  for (const slot of new Set([...Object.keys(saved.sprite), ...Object.keys(draft.sprite)])) {
    const next = draft.sprite[slot] ?? null;
    if (next !== (saved.sprite[slot] ?? null)) sprite[slot] = next;
  }
  if (Object.keys(sprite).length > 0) patch.sprite = sprite;
  return patch;
};

export const itemLabel = (it: { kind: string; ref: string }): string =>
  COSMETIC_LABELS[it.ref] ??
  (it.kind === "sprite_part" ? it.ref.replace(/-/g, " ") : (KIND_LABELS[it.kind] ?? it.kind));
