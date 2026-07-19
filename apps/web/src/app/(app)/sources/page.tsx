"use client";

import { useCallback, useEffect, useState } from "react";

type Source = {
  id: number;
  slug: string;
  name: string;
  kind: string;
  license: string | null;
  enabled: boolean;
  status: string;
  lastFetchedAt: string | null;
  error: string | null;
};
type Suggestion = { id: number; url: string; title: string | null; reason: string | null };
type Run = { id: number; sourceId: number; docsSeen: number; docsNew: number; error: string | null; startedAt: string };

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/sources").then((r) => r.json());
    setSources(d.sources);
    setSuggestions(d.suggestions);
    setRuns(d.recentRuns);
    const j = await fetch("/api/jobs").then((r) => r.json());
    setRunning(j.running);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const toggle = async (s: Source) => {
    await fetch("/api/sources", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, enabled: !s.enabled }),
    });
    load();
  };

  const judgeSuggestion = async (id: number, status: "approved" | "rejected") => {
    await fetch("/api/suggestions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  };

  const runNow = async () => {
    await fetch("/api/jobs/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ crawl: true }),
    });
    setRunning(true);
  };

  const sourceName = (id: number) => sources.find((s) => s.id === id)?.slug ?? `#${id}`;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sources</h1>
        <button
          onClick={runNow}
          disabled={running}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {running ? "Pipeline running…" : "Crawl now"}
        </button>
      </div>

      <section className="space-y-2">
        {sources.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{s.name}</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {s.kind} · {s.license ?? "license unknown"}
                {s.lastFetchedAt &&
                  ` · last crawl ${new Date(s.lastFetchedAt).toLocaleDateString()}`}
              </div>
              {s.error && <div className="mt-1 text-xs text-red-400">⚠ {s.error}</div>}
            </div>
            <button
              onClick={() => toggle(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                s.enabled
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-neutral-800 text-neutral-500"
              }`}
            >
              {s.enabled ? "enabled" : "disabled"}
            </button>
          </div>
        ))}
      </section>

      {suggestions.length > 0 && (
        <section>
          <h2 className="font-medium">Suggested reading ({suggestions.length})</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Found automatically while crawling. Approve to ingest on the next nightly run.
          </p>
          <div className="mt-3 space-y-2">
            {suggestions.map((sg) => (
              <div
                key={sg.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
              >
                <div className="min-w-0">
                  <a
                    href={sg.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm text-amber-400/90 hover:underline"
                  >
                    {sg.title ?? sg.url}
                  </a>
                  <div className="text-xs text-neutral-500">{sg.reason}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => judgeSuggestion(sg.id, "approved")}
                    className="rounded-md bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => judgeSuggestion(sg.id, "rejected")}
                    className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-700"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {runs.length > 0 && (
        <section>
          <h2 className="font-medium">Recent crawls</h2>
          <div className="mt-2 space-y-1 text-xs text-neutral-500">
            {runs.map((r) => (
              <div key={r.id}>
                {new Date(r.startedAt).toLocaleString()} · {sourceName(r.sourceId)} ·{" "}
                {r.docsNew} new / {r.docsSeen} seen
                {r.error && <span className="text-red-400"> · {r.error}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
