"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type MapRow = {
  id: number;
  title: string;
  blurb: string | null;
  status: "drafting" | "ready" | "failed";
  error: string | null;
  createdAt: string;
  nodeCount: number;
  visitedCount: number;
  onepagerReadyCount: number;
};

/**
 * The atlas: your maps, their progress, and the form that drafts a new one.
 * Drafting is minutes of model work in a detached run, so the page polls
 * while anything is drafting.
 */
export default function AtlasPage() {
  const [maps, setMaps] = useState<MapRow[]>([]);
  const [presets, setPresets] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/atlas/maps").then((r) => r.json());
    setMaps(d.maps ?? []);
    setPresets(d.presets ?? []);
    setLoaded(true);
  }, []);

  const drafting = maps.some((m) => m.status === "drafting");

  useEffect(() => {
    load();
    const t = setInterval(load, drafting ? 5000 : 15000);
    return () => clearInterval(t);
  }, [load, drafting]);

  const draft = async (body: { title?: string; brief?: string; preset?: string }) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/atlas/maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    const d = await res.json().catch(() => null);
    if (!res.ok) {
      setError(d?.error ?? "Couldn't start the draft.");
      return;
    }
    setTitle("");
    setBrief("");
    load();
  };

  const remove = async (m: MapRow) => {
    if (!confirm(`Remove the map "${m.title}" and everything in it?`)) return;
    await fetch(`/api/atlas/maps/${m.id}`, { method: "DELETE" });
    load();
  };

  const hasPhilosophy = maps.some((m) => m.title.toLowerCase() === "philosophy");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Atlas</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Your own maps of the fields you&apos;re curious about. Each node has a ladder — like
          I&apos;m 10, a one-pager, a deep dive — and every reading is checked to exist before
          you see it. The atlas remembers where you&apos;ve been.
        </p>
      </div>

      {loaded && maps.length === 0 && (
        <div className="space-y-3 rounded-xl border border-dashed border-neutral-800 px-5 py-6">
          <p className="text-sm text-neutral-400">
            No maps yet. Start with the one the bookstore book couldn&apos;t do justice to.
          </p>
          <button
            disabled={busy || !presets.includes("philosophy")}
            onClick={() => draft({ preset: "philosophy" })}
            className="rounded-md bg-amber-500 px-5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            ✦ Draft the Philosophy map
          </button>
          <p className="text-xs text-neutral-600">
            About five minutes: an outline, then each branch filled in.
          </p>
        </div>
      )}

      <section className="space-y-3">
        {maps.map((m) => (
          <div key={m.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/atlas/${m.id}`} className="text-lg font-medium hover:text-amber-400">
                  {m.title}
                </Link>
                {m.blurb && <p className="mt-1 text-sm text-neutral-400">{m.blurb}</p>}
              </div>
              <div className="shrink-0 text-right text-xs text-neutral-500">
                {m.status === "ready" && (
                  <span>
                    {m.nodeCount > 0 && (
                      <span className="block">
                        {m.onepagerReadyCount >= m.nodeCount ? (
                          <>ready · {m.nodeCount} pages</>
                        ) : (
                          <span className="text-amber-400/80">
                            preparing · {m.onepagerReadyCount} / {m.nodeCount}
                          </span>
                        )}
                      </span>
                    )}
                    {m.visitedCount}/{m.nodeCount} visited
                  </span>
                )}
                {m.status === "drafting" && (
                  <span className="text-amber-400/80">drafting… (a few minutes)</span>
                )}
                {m.status === "failed" && <span className="text-red-400">draft failed</span>}
              </div>
            </div>
            {m.status === "ready" && m.nodeCount > 0 && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.round((m.visitedCount / m.nodeCount) * 100)}%` }}
                />
              </div>
            )}
            {m.status === "failed" && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-red-400/80">{m.error}</p>
                <button
                  onClick={() => remove(m)}
                  className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-red-900 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          draft({ title: title.trim(), brief: brief.trim() || undefined });
        }}
        className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5"
      >
        <h2 className="text-sm font-medium text-neutral-200">Draft a map</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={2}
          maxLength={80}
          placeholder="A field — e.g. The history of mathematics, Music theory, Wine"
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Optional: what you want this map to be good at, anchors it must include, the book or course you're measuring it against."
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy || drafting || title.trim().length < 2}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {drafting ? "A map is drafting…" : "Draft this map"}
          </button>
          {!hasPhilosophy && maps.length > 0 && presets.includes("philosophy") && (
            <button
              type="button"
              disabled={busy || drafting}
              onClick={() => draft({ preset: "philosophy" })}
              className="rounded-md border border-amber-500/40 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
            >
              ✦ Philosophy preset
            </button>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </form>
    </div>
  );
}
