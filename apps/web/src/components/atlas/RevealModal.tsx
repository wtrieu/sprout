"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { personaLine } from "@/lib/atlas/persona";
import type { AtlasPersona } from "@/db/schema";
import {
  chestBannerList,
  itemLabel,
  revealSteps,
  type LevelChange,
  type Pending,
  type PendingLevelUp,
} from "./loadout";

const REVEAL_CSS = `
@keyframes rv-backdrop { from { opacity: 0 } to { opacity: 1 } }
@keyframes rv-card { 0% { opacity: 0; transform: translateY(24px) scale(.92) } 60% { opacity: 1; transform: translateY(-4px) scale(1.02) } 100% { opacity: 1; transform: none } }
@keyframes rv-chest { 0% { transform: scale(.4) rotate(0); opacity: 0 } 25% { transform: scale(1) rotate(-8deg); opacity: 1 } 40% { transform: rotate(8deg) } 55% { transform: rotate(-6deg) } 70% { transform: rotate(4deg) scale(1.1) } 100% { transform: scale(1.5) rotate(0); opacity: 0 } }
@keyframes rv-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
@keyframes rv-pop { 0% { opacity: 0; transform: translateY(16px) scale(.6) } 70% { opacity: 1; transform: translateY(-3px) scale(1.08) } 100% { opacity: 1; transform: none } }
@keyframes rv-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0) } 50% { box-shadow: 0 0 28px 4px rgba(245,158,11,.35) } }
@keyframes rv-fade { from { opacity: 0 } to { opacity: 1 } }
.rv-backdrop { animation: rv-backdrop .3s ease-out both }
.rv-card { animation: rv-card .55s cubic-bezier(.2,.8,.3,1) both, rv-glow 1.6s ease-in-out 1.1s 1 }
.rv-chest { animation: rv-chest 1s ease-in-out both; pointer-events: none }
.rv-rise { animation: rv-rise .5s ease-out both; animation-delay: var(--rv-d, 0s) }
.rv-pop { animation: rv-pop .5s cubic-bezier(.2,.8,.3,1) both; animation-delay: var(--rv-d, 0s) }
@media (prefers-reduced-motion: reduce) {
  .rv-backdrop, .rv-card, .rv-rise, .rv-pop { animation: rv-fade .3s ease-out both; animation-delay: 0s }
  .rv-chest { display: none }
}
`;

/** Sequenced loot-drop styles; reduced motion collapses everything to a fade. */
function RevealStyles() {
  return <style>{REVEAL_CSS}</style>;
}

/** The queued-loot banner shown on the map screen; opening it reveals. */
export function ChestBanner({
  pending,
  onOpen,
}: {
  pending: Pending;
  onOpen: () => void;
}) {
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
          You have {chestBannerList(pending)} waiting
        </span>
        <span className="block text-xs text-neutral-400">Open it to see what you found.</span>
      </span>
      <span className="text-xs text-amber-400">Open →</span>
    </button>
  );
}

const rise = (c: LevelChange) => (c.to > c.from ? `${c.from} → ${c.to}` : `${c.to}`);

/** The level-up card: the total, then each discipline and branch that rose. */
function LevelUpCard({ levelUp }: { levelUp: PendingLevelUp }) {
  const rows = [
    ...levelUp.disciplines.map((d) => ({ key: `d:${d.discipline}`, label: d.discipline, change: d })),
    ...levelUp.branches.map((b) => ({ key: `b:${b.nodeId}`, label: b.title, change: b })),
  ];
  return (
    <div className="space-y-4">
      <div className="rv-rise">
        <span className="mb-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
          level up
        </span>
        <h2 className="text-xl font-semibold text-neutral-100">
          Total level {rise(levelUp.total)}
        </h2>
        <p className="mt-1 text-sm text-neutral-300">Here&apos;s what grew since last time.</p>
      </div>
      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r, n) => (
            <li
              key={r.key}
              style={{ "--rv-d": `${0.4 + n * 0.15}s` } as CSSProperties}
              className="rv-pop flex items-baseline justify-between gap-3 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm"
            >
              <span className="capitalize text-neutral-200">{r.label}</span>
              <span className="text-amber-400/90">{rise(r.change)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Reveal flow (see `revealSteps`): the level-up, one step per achievement
 * (title, flavor, its loot), then the class offer card. Nothing here ever
 * appears mid-lesson — the map page is the only mount point. Showing the
 * level-up step calls `onLevelUpSeen` once, which acknowledges it.
 */
export function RevealModal({
  pending,
  persona,
  name,
  seed,
  onClose,
  onChoose,
  onLevelUpSeen,
  busy = false,
  error = null,
}: {
  pending: Pending;
  persona: AtlasPersona;
  name?: string;
  seed: string;
  onClose: () => void;
  onChoose: (offerId: number, classId: string) => void;
  onLevelUpSeen?: (throughEventId: number) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const steps = revealSteps(pending);
  const [at, setAt] = useState(0);
  const step = steps[Math.min(at, steps.length - 1)];
  const last = at >= steps.length - 1;
  const levelUpShown = step?.kind === "level_up";
  const throughEventId = pending.levelUp?.throughEventId;
  const acked = useRef<number | null>(null);
  useEffect(() => {
    if (!levelUpShown || throughEventId === undefined || acked.current === throughEventId) return;
    acked.current = throughEventId;
    onLevelUpSeen?.(throughEventId);
  }, [levelUpShown, throughEventId, onLevelUpSeen]);
  if (!step) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your reveal"
      className="rv-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <RevealStyles />
      <div
        key={at}
        className="rv-card relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-amber-500/40 bg-neutral-900 p-6 shadow-xl"
      >
        {step.kind === "achievement" && (
          <span aria-hidden className="rv-chest absolute left-1/2 top-10 -ml-8 text-6xl">
            🎁
          </span>
        )}
        {step.kind === "level_up" && pending.levelUp ? (
          <LevelUpCard levelUp={pending.levelUp} />
        ) : step.kind === "achievement" ? (
          (() => {
            const a = pending.achievements[step.index];
            return (
              <div className="space-y-4">
                <p
                  className="rv-rise text-sm italic text-neutral-400"
                  style={{ "--rv-d": "0.9s" } as CSSProperties}
                >
                  “
                  {personaLine(
                    persona,
                    "loot_reveal",
                    { name, achievementTitle: a.title },
                    `${seed}:${a.slug}`,
                  )}
                  ”
                </p>
                <div className="rv-rise" style={{ "--rv-d": "1.1s" } as CSSProperties}>
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
                    {a.items.map((it, n) => (
                      <li
                        key={it.id}
                        style={{ "--rv-d": `${1.4 + n * 0.25}s` } as CSSProperties}
                        className="rv-pop rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm capitalize text-neutral-200"
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
                    style={{ "--rv-d": `${0.3 + i * 0.2}s` } as CSSProperties}
                    className="rv-rise rounded-lg border border-neutral-700 bg-neutral-950 p-4"
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
