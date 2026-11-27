"use client";

import { useReducer } from "react";
import { ChevronDown, Lock } from "lucide-react";
import type { MeItem } from "./Collection";
import { creatorSlots, toneGroups } from "./creator";
import {
  FRAME_ACCENTS,
  MAP_STYLE_ACCENTS,
  accentFor,
  type Loadout,
  type LoadoutPatch,
} from "./loadout";
import {
  appearanceHair,
  equippedIn,
  initLook,
  lookCategories,
  lookReducer,
  sameLook,
  savePatch,
  type Category,
  type LookState,
  type Tile,
} from "./look";
import { PartChoiceRow, PartThumb, ToneRow } from "./LookPickers";
import { SpriteCanvas } from "./sprite/SpriteCanvas";
import { defaultSelection, type SpriteManifest } from "./sprite/manifest";


const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400";

/** The look with one tile swapped in: what the tile's thumbnail shows. */
const tryOn = (look: Loadout, c: Category, t: Tile): Loadout => {
  if (c.kind === "frame") return { ...look, frame: t.id };
  if (c.kind === "mapStyle") return { ...look, mapStyle: t.id };
  const sprite = { ...look.sprite };
  for (const slot of c.slots) delete sprite[slot];
  if (t.slot) sprite[t.slot] = t.id;
  return { ...look, sprite };
};

function FrameSwatch({ id, small }: { id: string; small?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${small ? "h-10 w-10" : "h-16 w-16"}`}>
      <div
        className={`rounded-md bg-neutral-800 ${small ? "h-5 w-5" : "h-9 w-9"} ${
          accentFor(FRAME_ACCENTS, id) || "border-2 border-neutral-600"
        }`}
      />
    </div>
  );
}

function StyleSwatch({ id, small }: { id: string; small?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${small ? "h-10 w-10" : "h-16 w-16"}`}>
      <div
        className={`rounded-md ${small ? "h-8 w-9" : "h-12 w-14"} ${
          accentFor(MAP_STYLE_ACCENTS, id) || "border border-neutral-600 bg-neutral-800"
        }`}
      />
    </div>
  );
}

function EmptyThumb() {
  return (
    <div
      aria-hidden
      className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-neutral-700 text-lg text-neutral-600"
    >
      +
    </div>
  );
}

/** A slot button: the category, what it has on (or an invitation), and the count. */
function SlotButton({
  manifest,
  category: c,
  draft,
  selected,
  onSelect,
}: {
  manifest: SpriteManifest;
  category: Category;
  draft: Loadout;
  selected: boolean;
  onSelect: () => void;
}) {
  const on = equippedIn(manifest, c, draft);
  const tile = on ? c.tiles.find((t) => t.id === on) : undefined;
  let thumb = <EmptyThumb />;
  if (tile && c.kind === "frame") thumb = <FrameSwatch id={tile.id} small />;
  else if (tile && c.kind === "mapStyle") thumb = <StyleSwatch id={tile.id} small />;
  else if (tile?.slot) {
    thumb = (
      <PartThumb manifest={manifest} loadout={draft} slot={tile.slot} label="" size={40} still />
    );
  }
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-controls="look-picker"
      onClick={onSelect}
      className={`flex min-h-[56px] w-full items-center gap-2.5 rounded-lg border-2 bg-neutral-950 px-2 py-1.5 text-left transition ${FOCUS} ${
        selected ? "border-amber-500/80 bg-amber-500/5" : "border-neutral-800 hover:border-neutral-600"
      }`}
    >
      <span aria-hidden className="shrink-0">
        {thumb}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-neutral-500">{c.label}</span>
        <span className={`block truncate text-sm ${tile ? "text-neutral-100" : "text-neutral-500"}`}>
          {tile ? tile.label : c.found > 0 ? c.emptyLabel : "Still out there"}
        </span>
      </span>
    </button>
  );
}

/** One tile of a category's grid: owned (try it on) or a locked silhouette. */
function PickTile({
  manifest,
  category: c,
  tile,
  draft,
  on,
  onTap,
}: {
  manifest: SpriteManifest;
  category: Category;
  tile: Tile;
  draft: Loadout;
  on: boolean;
  onTap: () => void;
}) {
  const locked = !tile.owned;
  let thumb;
  if (c.kind === "frame") thumb = <FrameSwatch id={tile.id} />;
  else if (c.kind === "mapStyle") thumb = <StyleSwatch id={tile.id} />;
  else {
    thumb = (
      <SpriteCanvas
        loadout={tryOn(draft, c, tile)}
        scale={64 / manifest.canvas.width}
        label={locked ? "Not found yet" : tile.label}
        still
      />
    );
  }
  if (locked) {
    return (
      <button
        type="button"
        aria-disabled="true"
        aria-label="Not found yet"
        onClick={(e) => e.preventDefault()}
        className={`relative flex min-h-[44px] cursor-not-allowed flex-col items-center gap-1 rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-950/60 p-1.5 ${FOCUS}`}
      >
        <span
          aria-hidden
          className={`block ${c.kind === "sprite" ? "opacity-25 brightness-0 invert" : "opacity-50 brightness-50 grayscale"}`}
        >
          {thumb}
        </span>
        <Lock aria-hidden className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-neutral-500" />
        <span aria-hidden className="text-xs text-neutral-600">
          ???
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onTap}
      className={`relative flex min-h-[44px] flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition ${FOCUS} ${
        on ? "border-amber-500 bg-amber-500/10" : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"
      }`}
    >
      {on && (
        <span className="absolute right-1 top-1 rounded bg-amber-500 px-1 text-[10px] font-semibold leading-4 text-neutral-950">
          On
        </span>
      )}
      <span aria-hidden className="block">
        {thumb}
      </span>
      <span className={`text-center text-xs leading-tight ${on ? "text-amber-300" : "text-neutral-300"}`}>
        {tile.label}
      </span>
    </button>
  );
}

/**
 * The Look panel as a game inventory: a live preview beside one slot button
 * per prize category; a slot opens its grid (owned tiles to try on, the rest
 * as locked silhouettes); body, hair and tones sit behind "Change
 * appearance". Everything edits one draft; nothing persists until Save.
 * `initial` seeds the UI state (tests and previews only).
 */
export function LookPanel({
  manifest,
  items,
  loadout,
  busy,
  onSave,
  initial,
}: {
  manifest: SpriteManifest;
  items: MeItem[];
  loadout: Loadout;
  busy?: boolean;
  onSave: (patch: LoadoutPatch) => void;
  initial?: Partial<Omit<LookState, "saved">>;
}) {
  const [s, dispatch] = useReducer(
    (st: LookState, a: Parameters<typeof lookReducer>[2]) => lookReducer(manifest, st, a),
    undefined,
    () => initLook(loadout, initial),
  );
  const categories = lookCategories(manifest, items);
  const open = categories.find((c) => c.id === s.open) ?? null;
  const dirty = !sameLook(s.saved, s.draft);
  const appearance = creatorSlots(manifest);
  const tones = toneGroups(manifest);
  const headwear = categories.find((c) => c.id === "headwear");
  const hatOn = headwear ? equippedIn(manifest, headwear, s.draft) : null;
  const hatLabel = hatOn ? headwear?.tiles.find((t) => t.id === hatOn)?.label : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* The draft as it will look: frame around the sprite, map style behind it. */}
        <div
          data-testid="look-preview"
          className={`shrink-0 self-center rounded-xl p-4 sm:self-start ${
            accentFor(MAP_STYLE_ACCENTS, s.draft.mapStyle) || "border border-neutral-800"
          }`}
        >
          <div className={`rounded-lg bg-neutral-950 p-1 ${accentFor(FRAME_ACCENTS, s.draft.frame)}`}>
            <SpriteCanvas loadout={s.draft} scale={2} label="Look preview" />
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-neutral-500">Tap a slot to see what you have found.</p>
          <div role="group" aria-label="Equipment" className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {categories.map((c) => (
              <SlotButton
                key={c.id}
                manifest={manifest}
                category={c}
                draft={s.draft}
                selected={s.open === c.id}
                onSelect={() => dispatch({ type: "open", category: c.id })}
              />
            ))}
          </div>
        </div>
      </div>

      {open && (
        <section
          id="look-picker"
          aria-label={`${open.label} choices`}
          className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-neutral-200">{open.label}</h3>
            <span className="text-xs text-neutral-500">
              {open.found} of {open.total} found
            </span>
          </div>
          {open.canEmpty && (
            <p className="text-[11px] text-neutral-600">Tap what you have on to take it off.</p>
          )}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
            {open.tiles.map((t) => (
              <PickTile
                key={t.id}
                manifest={manifest}
                category={open}
                tile={t}
                draft={s.draft}
                on={equippedIn(manifest, open, s.draft) === t.id}
                onTap={() => dispatch({ type: "tap", category: open, id: t.id })}
              />
            ))}
          </div>
        </section>
      )}

      {(appearance.length > 0 || tones.length > 0) && (
        <div>
          <button
            type="button"
            aria-expanded={s.appearanceOpen}
            aria-controls="look-appearance"
            onClick={() => dispatch({ type: "toggleAppearance" })}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-neutral-700 px-3 text-sm text-neutral-300 hover:border-neutral-500 hover:text-neutral-100 ${FOCUS}`}
          >
            Change appearance
            <ChevronDown
              aria-hidden
              className={`h-4 w-4 transition ${s.appearanceOpen ? "rotate-180" : ""}`}
            />
          </button>
          {s.appearanceOpen && (
            <div
              id="look-appearance"
              className="mt-3 space-y-4 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3"
            >
              {hatLabel && (
                <p className="text-xs text-neutral-500">
                  Your {hatLabel} covers your hair. Picking a hairstyle takes it off.
                </p>
              )}
              {appearance.map((choices) => (
                <PartChoiceRow
                  key={choices.slot}
                  manifest={manifest}
                  choices={choices}
                  loadout={s.draft}
                  value={
                    choices.slot === "hair"
                      ? appearanceHair(manifest, s)
                      : (s.draft.sprite[choices.slot] ?? defaultSelection(manifest)[choices.slot])
                  }
                  onChange={(id) => dispatch({ type: "part", slot: choices.slot, id })}
                />
              ))}
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                {tones.map((g) => (
                  <ToneRow
                    key={g.group}
                    group={g}
                    value={s.draft.tones?.[g.group]}
                    onChange={(t) => dispatch({ type: "tone", group: g.group, tone: t })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => {
            const patch = savePatch(s);
            if (patch) onSave(patch);
          }}
          className={`min-h-[44px] rounded-md bg-amber-500 px-4 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50 ${FOCUS}`}
        >
          Save look
        </button>
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => dispatch({ type: "undo" })}
          className={`min-h-[44px] rounded-md px-3 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-40 ${FOCUS}`}
        >
          Undo changes
        </button>
        {dirty && <span className="text-xs text-neutral-500">Trying it on, not saved yet.</span>}
      </div>
    </div>
  );
}
