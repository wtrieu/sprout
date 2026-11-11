"use client";

import type { Loadout } from "./loadout";
import type { SlotChoices, ToneGroup } from "./creator";
import { SpriteCanvas } from "./sprite/SpriteCanvas";
import type { SlotId, SpriteManifest } from "./sprite/manifest";

/**
 * The character cropped to one slot's region (e.g. just the head for hair),
 * so a row of thumbnails reads as "this hair on you", tones included.
 */
function PartThumb({
  manifest,
  loadout,
  slot,
  label,
  size = 64,
}: {
  manifest: SpriteManifest;
  loadout: Loadout;
  slot: SlotId;
  label: string;
  size?: number;
}) {
  const r = manifest.slots.find((s) => s.id === slot)?.region ?? {
    x0: 0,
    y0: 0,
    x1: manifest.canvas.width - 1,
    y1: manifest.canvas.height - 1,
  };
  const w = r.x1 - r.x0 + 1;
  const h = r.y1 - r.y0 + 1;
  // Half-step scales keep the pixels close to even.
  const scale = Math.max(1, Math.floor(2 * Math.min(size / w, size / h)) / 2);
  return (
    <div className="relative overflow-hidden" style={{ width: size, height: size }}>
      <div
        className="absolute"
        style={{ left: size / 2 - (r.x0 + w / 2) * scale, top: size / 2 - (r.y0 + h / 2) * scale }}
      >
        <SpriteCanvas loadout={loadout} scale={scale} label={label} />
      </div>
    </div>
  );
}

/** One slot's base parts as tappable thumbnails of the current look. */
export function PartChoiceRow({
  manifest,
  choices,
  loadout,
  value,
  onChange,
}: {
  manifest: SpriteManifest;
  choices: SlotChoices;
  loadout: Loadout;
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs text-neutral-500">{choices.label}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              title={o.label}
              onClick={() => onChange(o.id)}
              className={`flex flex-col items-center rounded-lg border bg-neutral-950 px-1 pb-1 pt-0.5 transition ${
                on ? "border-amber-500/70 bg-amber-500/5" : "border-neutral-800 hover:border-neutral-700"
              }`}
            >
              <PartThumb
                manifest={manifest}
                loadout={{ ...loadout, sprite: { ...loadout.sprite, [choices.slot]: o.id } }}
                slot={choices.slot}
                label={`${choices.label}: ${o.label}`}
                size={56}
              />
              <span className={`text-[10px] ${on ? "text-amber-400/90" : "text-neutral-500"}`}>
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A swap group's tones as round swatches (base color with its shade). */
export function ToneRow({
  group,
  value,
  onChange,
}: {
  group: ToneGroup;
  value: string | undefined;
  onChange: (toneId: string) => void;
}) {
  const current = group.tones.find((t) => t.id === value) ?? group.tones[0];
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs text-neutral-500">
        {group.label}
        {current && <span className="text-neutral-400"> · {current.label}</span>}
      </legend>
      <div className="flex flex-wrap gap-2.5">
        {group.tones.map((t) => {
          const on = current?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              aria-label={`${group.label}: ${t.label}`}
              title={t.label}
              onClick={() => onChange(t.id)}
              className={`h-8 w-8 rounded-full border border-neutral-950 transition ${
                on
                  ? "ring-2 ring-amber-500/80 ring-offset-2 ring-offset-neutral-900"
                  : "ring-1 ring-neutral-700 hover:ring-neutral-500"
              }`}
              style={{ background: `linear-gradient(135deg, ${t.base} 55%, ${t.shade} 55%)` }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
