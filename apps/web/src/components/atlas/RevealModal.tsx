"use client";

import { useState } from "react";
import { personaLine } from "@/lib/atlas/persona";
import type { AtlasPersona } from "@/db/schema";
import { itemLabel, type Pending } from "./loadout";

/** The queued-loot banner shown on the map screen; opening it reveals. */
export function ChestBanner({
  pending,
  onOpen,
}: {
  pending: Pending;
  onOpen: () => void;
}) {
  const boxes = pending.achievements.length;
  const parts = [
    boxes > 0 ? `${boxes} chest${boxes === 1 ? "" : "s"}` : null,
    pending.offer ? "a title offer" : null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-5 py-4 text-left transition hover:bg-amber-500/15"
    >
      <span aria-hidden className="text-2xl">
        ✦
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-amber-300">
          You have {parts.join(" and ")} waiting
        </span>
        <span className="block text-xs text-neutral-400">Open it to see what you found.</span>
      </span>
      <span className="text-xs text-amber-400">Open →</span>
    </button>
  );
}

/**
 * Reveal flow: one step per achievement (title, flavor, its loot), then the
 * class offer card. Nothing here ever appears mid-lesson — the map page is the
 * only mount point.
 */
export function RevealModal({
  pending,
  persona,
  name,
  seed,
  onClose,
  onChoose,
  busy = false,
  error = null,
}: {
  pending: Pending;
  persona: AtlasPersona;
  name?: string;
  seed: string;
  onClose: () => void;
  onChoose: (offerId: number, classId: string) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const steps: Array<
    { kind: "achievement"; index: number } | { kind: "offer" }
  > = [
    ...pending.achievements.map((_, index) => ({ kind: "achievement" as const, index })),
    ...(pending.offer ? [{ kind: "offer" as const }] : []),
  ];
  const [at, setAt] = useState(0);
  const step = steps[Math.min(at, steps.length - 1)];
  const last = at >= steps.length - 1;
  if (!step) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your reveal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-amber-500/40 bg-neutral-900 p-6 shadow-xl">
        {step.kind === "achievement" ? (
          (() => {
            const a = pending.achievements[step.index];
            return (
              <div className="space-y-4">
                <p className="text-sm italic text-neutral-400">
                  “
                  {personaLine(
                    persona,
                    "loot_reveal",
                    { name, achievementTitle: a.title },
                    `${seed}:${a.slug}`,
                  )}
                  ”
                </p>
                <div>
                  {a.hidden && (
                    <span className="mb-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                      a hidden one
                    </span>
                  )}
                  <h2 className="text-xl font-semibold text-neutral-100">{a.title}</h2>
                  <p className="mt-1 text-sm text-neutral-300">{a.flavor}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">In the chest</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {a.items.length === 0 && (
                      <li className="text-xs text-neutral-500">Just the glory this time.</li>
                    )}
                    {a.items.map((it) => (
                      <li
                        key={it.id}
                        className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm capitalize text-neutral-200"
                      >
                        {itemLabel(it)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="space-y-4">
            <p className="text-sm italic text-neutral-400">
              “
              {personaLine(
                persona,
                "class_offer",
                { name, gateLevel: pending.offer!.gateLevel },
                `${seed}:offer:${pending.offer!.id}`,
              )}
              ”
            </p>
            <div>
              <h2 className="text-xl font-semibold text-neutral-100">
                Choose a title · level {pending.offer!.gateLevel}
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                {pending.offer!.deadline
                  ? `No rush — pick by ${new Date(pending.offer!.deadline).toLocaleDateString()}. `
                  : "No rush — you have about two weeks. "}
                If you don&apos;t, the first one is chosen for you. Nothing is locked; a respec
                token can change it later.
              </p>
            </div>
            <ul className="space-y-2">
              {pending.offer!.options.map((o, i) =>
                o ? (
                  <li
                    key={o.classId}
                    className="rounded-lg border border-neutral-700 bg-neutral-950 p-4"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <p className="font-medium text-neutral-100">{o.title}</p>
                      {i === 0 && (
                        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                          default
                        </span>
                      )}
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-neutral-600">
                        {o.affinity} · {o.style}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-400">{o.blurb}</p>
                    <p className="mt-1 text-xs text-amber-400/90">Perk: {o.perk}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onChoose(pending.offer!.id, o.classId)}
                      className="mt-3 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
                    >
                      Become {o.title}
                    </button>
                  </li>
                ) : null,
              )}
            </ul>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}
        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-neutral-600">
            {at + 1} / {steps.length}
          </span>
          {step.kind === "offer" ? (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              Decide later
            </button>
          ) : (
            <button
              type="button"
              onClick={() => (last ? onClose() : setAt(at + 1))}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400"
            >
              {last ? "Done" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
