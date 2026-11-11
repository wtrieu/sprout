"use client";

import { useMemo, useState } from "react";
import { creatorSlots, defaultLook, lookBody, lookLoadout, toneGroups, type Look } from "./creator";
import { PartChoiceRow, ToneRow } from "./LookPickers";
import { SpriteCanvas } from "./sprite/SpriteCanvas";
import type { SpriteManifest } from "./sprite/manifest";

export type CreateBody<P extends string> = {
  name: string;
  persona: P;
  look?: { sprite: Record<string, string>; tones: Record<string, string> };
};

/**
 * "Create your character": the live preview is the hero; beside it the name
 * and the look (base parts + tones, all from the manifest), then the voice.
 * With no manifest (art missing) the look is skipped and the server defaults.
 */
export function CharacterCreator<P extends string>({
  manifest,
  personas,
  busy,
  error,
  onCreate,
}: {
  manifest: SpriteManifest | null | undefined;
  personas: Record<P, { title: string; pitch: string }>;
  busy?: boolean;
  error?: string | null;
  onCreate: (body: CreateBody<P>) => void;
}) {
  const [name, setName] = useState("");
  const [persona, setPersona] = useState<P | null>(null);
  // Untouched until the first pick: the manifest's defaults stand in.
  const [picked, setLook] = useState<Look | null>(null);
  const look = picked ?? (manifest ? defaultLook(manifest) : null);

  const slots = useMemo(() => (manifest ? creatorSlots(manifest) : []), [manifest]);
  const groups = useMemo(() => (manifest ? toneGroups(manifest) : []), [manifest]);
  const loadout = look ? lookLoadout(look) : { sprite: {} };
  const shownName = name.trim() || "Your character";

  const submit = () => {
    if (!persona) return;
    onCreate({
      name: name.trim(),
      persona,
      ...(manifest && look ? { look: lookBody(manifest, look) } : {}),
    });
  };

  return (
    <div className="space-y-5 rounded-xl border border-amber-500/30 bg-neutral-900 p-5">
      <div>
        <h2 className="text-sm font-medium text-neutral-200">Create your character</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Maps are shared; progress, levels and your companion are yours. Dress them up and pick
          a voice — you can change both later.
        </p>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2 self-center sm:self-start">
          <div className="rounded-xl bg-neutral-950 p-3 ring-1 ring-amber-500/20">
            <SpriteCanvas loadout={loadout} scale={4} label={`${shownName}'s character`} />
          </div>
          <p
            className={`max-w-[17rem] truncate text-sm ${
              name.trim() ? "font-medium text-neutral-100" : "text-neutral-600"
            }`}
          >
            {shownName}
          </p>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={40}
            placeholder="Your name on the map"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
          {manifest && look && (
            <>
              {slots.map((s) => (
                <PartChoiceRow
                  key={s.slot}
                  manifest={manifest}
                  choices={s}
                  loadout={loadout}
                  value={look.sprite[s.slot]}
                  onChange={(id) => setLook({ ...look, sprite: { ...look.sprite, [s.slot]: id } })}
                />
              ))}
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                {groups.map((g) => (
                  <ToneRow
                    key={g.group}
                    group={g}
                    value={look.tones[g.group]}
                    onChange={(t) => setLook({ ...look, tones: { ...look.tones, [g.group]: t } })}
                  />
                ))}
              </div>
            </>
          )}
          {manifest === undefined && <p className="text-xs text-neutral-600">Fetching the wardrobe…</p>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(personas) as P[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPersona(p)}
            className={`rounded-lg border p-4 text-left transition ${
              persona === p ? "border-amber-500/70 bg-amber-500/5" : "border-neutral-800 hover:border-neutral-700"
            }`}
          >
            <p className="text-sm font-medium text-neutral-100">{personas[p].title}</p>
            <p className="mt-1 text-xs text-neutral-500">{personas[p].pitch}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || name.trim().length < 2 || !persona}
          onClick={submit}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
        >
          Begin the expedition
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
