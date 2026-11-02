"use client";

import { useState } from "react";
import { COSMETIC_LABELS, itemLabel, type Loadout } from "./loadout";
import type { SpriteManifest } from "./sprite/manifest";

export type MeAchievement = {
  id: number;
  slug: string;
  title: string;
  flavor: string;
  hidden?: boolean;
  grantedAt?: string | null;
  revealedAt?: string | null;
};
export type MeItem = { id: number; kind: string; ref: string; status: string };

/** Earned achievements only: a hidden one stays invisible until it is revealed. */
export function AchievementGallery({ achievements }: { achievements: MeAchievement[] }) {
  // revealedAt === null means still queued for the next map screen: no spoilers.
  const shown = achievements.filter((a) => a.revealedAt !== null);
  if (shown.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nothing earned yet. Read, quiz, explore — the atlas is keeping an eye out.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {shown.map((a) => (
        <li key={a.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-medium text-neutral-100">{a.title}</p>
            {a.hidden && (
              <span className="text-[10px] uppercase tracking-wide text-amber-400/80">hidden</span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-400">{a.flavor}</p>
        </li>
      ))}
    </ul>
  );
}

const USABLE = new Set(["respec_token", "fog_reveal", "rare_node_key"]);

/** Owned items; functional ones get a Use button. */
export function Inventory({
  items,
  busy,
  onUse,
}: {
  items: MeItem[];
  busy?: boolean;
  onUse: (item: MeItem) => void;
}) {
  const owned = items.filter((i) => i.status === "owned");
  if (owned.length === 0) {
    return <p className="text-sm text-neutral-500">The pack is empty. Chests fill it.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {owned.map((it) => (
        <li
          key={it.id}
          className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5"
        >
          <span className="text-sm capitalize text-neutral-200">{itemLabel(it)}</span>
          {USABLE.has(it.kind) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onUse(it)}
              className="rounded-md border border-amber-500/40 px-2 py-0.5 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
            >
              Use
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

const PICK_SLOTS = ["outfit", "hair", "cape", "item", "aura-front"] as const;

/**
 * Loadout picker over what the player owns: base parts are always on offer,
 * loot parts/frames/styles only once owned. Saves the whole loadout at once.
 */
export function LoadoutPicker({
  manifest,
  items,
  loadout,
  busy,
  onSave,
}: {
  manifest: SpriteManifest;
  items: MeItem[];
  loadout: Loadout;
  busy?: boolean;
  onSave: (next: Loadout) => void;
}) {
  const [draft, setDraft] = useState<Loadout>(loadout);
  const owned = (kind: string) =>
    items.filter((i) => i.status === "owned" && i.kind === kind).map((i) => i.ref);
  const ownedParts = new Set(owned("sprite_part"));
  const frames = [...new Set(owned("frame"))];
  const styles = [...new Set(owned("map_style"))];

  const setSprite = (slot: string, id: string) => {
    const sprite = { ...draft.sprite };
    if (id) sprite[slot] = id;
    else delete sprite[slot];
    setDraft({ ...draft, sprite });
  };
  const select = "rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {PICK_SLOTS.map((slot) => {
          const options = manifest.parts.filter(
            (p) => p.slot === slot && (p.grantedBy === null || ownedParts.has(p.id)),
          );
          if (options.length === 0) return null;
          // Slots with a base part always have one equipped; others may be empty.
          const hasBase = options.some((p) => p.grantedBy === null);
          return (
            <label key={slot} className="flex flex-col gap-1 text-xs capitalize text-neutral-500">
              {slot.replace("-", " ")}
              <select
                className={select}
                value={draft.sprite[slot] ?? ""}
                onChange={(e) => setSprite(slot, e.target.value)}
              >
                {!hasBase && <option value="">None</option>}
                {hasBase && <option value="">Default</option>}
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id.replace(/-/g, " ")}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Frame
          <select
            className={select}
            value={draft.frame ?? ""}
            onChange={(e) => setDraft({ ...draft, frame: e.target.value || undefined })}
          >
            <option value="">None</option>
            {frames.map((f) => (
              <option key={f} value={f}>
                {COSMETIC_LABELS[f] ?? f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Map style
          <select
            className={select}
            value={draft.mapStyle ?? ""}
            onChange={(e) => setDraft({ ...draft, mapStyle: e.target.value || undefined })}
          >
            <option value="">Plain</option>
            {styles.map((s) => (
              <option key={s} value={s}>
                {COSMETIC_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onSave(draft)}
        className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
      >
        Save look
      </button>
    </div>
  );
}
