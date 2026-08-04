"use client";

import { useCallback, useEffect, useState } from "react";
import { REJECT_REASONS } from "@/lib/stories/engine";

type Premise = {
  id: number;
  title: string;
  lane: string;
  pitch: string;
  tags: string[];
  lesson: string;
  lessonNote: string | null;
  form: string | null;
  lengthPages: number;
  whyForJun: string | null;
  status: string;
  passReason: string | null;
  storyId: number | null;
};

const LANE_LABEL: Record<string, string> = {
  "bedtime-winddown": "🌙 bedtime",
  "myth-retelling": "🐉 myth",
  "folk-tale": "🦊 folk tale",
  pourquoi: "❓ why-story",
  "little-quest": "🎒 quest",
  "history-vignette": "📜 history",
  "fantasy-world": "🏰 fantasy world",
  funny: "😄 funny",
  "everyday-wonder": "🔍 everyday wonder",
};

const OUTCOME_LABEL: Record<string, string> = {
  greenlit: "✍️ writing…",
  auto_picked: "✍️ auto-picked",
  written: "📖 drafted",
  rejected: "🗑 judge rejected",
  passed: "passed",
};

/**
 * The premise inbox: tonight's commissioned pitches, greenlight or pass on
 * the phone. Greenlighting kicks an immediate book-write — the draft shows
 * up on the Stories page minutes later.
 */
export default function PremisesPage() {
  const [proposed, setProposed] = useState<Premise[]>([]);
  const [recent, setRecent] = useState<Premise[]>([]);
  const [passing, setPassing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/premises").then((r) => r.json());
    setProposed(d.premises ?? []);
    setRecent(d.recent ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const greenlight = async (p: Premise) => {
    setBusy(true);
    await fetch(`/api/premises/${p.id}/greenlight`, { method: "POST" });
    setBusy(false);
    load();
  };

  const pass = async (p: Premise, reason?: string) => {
    setBusy(true);
    setPassing(null);
    await fetch(`/api/premises/${p.id}/pass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reason ? { reason } : {}),
    });
    setBusy(false);
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Premise inbox</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tonight&apos;s pitches for Jun&apos;s library. Greenlight the ones you love — the book
          is written right away. Unreviewed premises are auto-picked after two days.
        </p>
      </div>

      <section className="space-y-3">
        {proposed.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-3 text-sm text-neutral-500">
            No premises waiting — a fresh batch arrives with the nightly run.
          </p>
        ) : (
          proposed.map((p) => (
            <div
              key={p.id}
              className="space-y-3 rounded-xl border border-amber-500/30 bg-neutral-900 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-300">
                  {LANE_LABEL[p.lane] ?? p.lane}
                </span>
                {p.lesson !== "none" && (
                  <span className="rounded-full bg-sky-950 px-2 py-0.5 text-sky-300">
                    lesson: {p.lesson}
                  </span>
                )}
                <span className="text-neutral-500">{p.lengthPages} pages</span>
                {p.tags.map((t) => (
                  <span key={t} className="rounded-full border border-neutral-800 px-2 py-0.5 text-neutral-500">
                    {t}
                  </span>
                ))}
              </div>
              <div>
                <div className="font-medium">{p.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-neutral-300">{p.pitch}</p>
                {p.whyForJun && (
                  <p className="mt-1 text-xs italic text-neutral-500">{p.whyForJun}</p>
                )}
              </div>
              {passing === p.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-neutral-500">Why pass?</span>
                  {REJECT_REASONS.map((r) => (
                    <button
                      key={r.key}
                      disabled={busy}
                      onClick={() => pass(p, r.key)}
                      className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-red-800 hover:text-red-300 disabled:opacity-50"
                    >
                      {r.label}
                    </button>
                  ))}
                  <button
                    disabled={busy}
                    onClick={() => pass(p)}
                    className="rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-300"
                  >
                    Just pass
                  </button>
                  <button
                    onClick={() => setPassing(null)}
                    className="px-2 py-1.5 text-xs text-neutral-600 hover:text-neutral-400"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <button
                    disabled={busy}
                    onClick={() => setPassing(p.id)}
                    className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-400 transition hover:border-red-900 hover:text-red-400 disabled:opacity-50"
                  >
                    Pass
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => greenlight(p)}
                    className="rounded-md bg-amber-500 px-5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-amber-400 disabled:opacity-50"
                  >
                    Greenlight ✍️
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-400">Recently decided</h2>
          {recent.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800/60 bg-neutral-900 px-4 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <span className="truncate text-neutral-400">{p.title}</span>
                <span className="ml-2 text-xs text-neutral-600">
                  {LANE_LABEL[p.lane] ?? p.lane}
                </span>
              </div>
              <span className="shrink-0 text-xs text-neutral-500">
                {OUTCOME_LABEL[p.status] ?? p.status}
                {p.status === "passed" && p.passReason ? ` (${p.passReason})` : ""}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
