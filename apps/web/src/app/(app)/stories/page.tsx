"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Story = {
  id: number;
  title: string | null;
  prompt: string;
  status: string;
  pageCount: number;
  pagesDone: number;
  characterName: string;
  favorite: boolean;
};

type AgeTarget = { mode: "auto" } | { mode: "manual"; months: number };

const AGE_OPTIONS: Array<{ value: string; label: string; target: AgeTarget }> = [
  { value: "auto", label: "Auto (child's age)", target: { mode: "auto" } },
  { value: "12", label: "Baby (under 18 mo)", target: { mode: "manual", months: 12 } },
  { value: "24", label: "Young toddler (18–29 mo)", target: { mode: "manual", months: 24 } },
  { value: "36", label: "Preschooler (30 mo +)", target: { mode: "manual", months: 36 } },
];

const LEGACY_LABEL: Record<string, string> = {
  queued: "✍️ writing soon",
  text_done: "✍️ written",
  rendering: "🎨 illustrating",
  failed: "⚠️ failed",
};

export default function StoriesPage() {
  const [storyList, setStoryList] = useState<Story[]>([]);
  const [ageValue, setAgeValue] = useState("auto");
  const [perDay, setPerDay] = useState(4);
  const [showOlder, setShowOlder] = useState(false);

  const load = useCallback(async () => {
    const [s, cfg] = await Promise.all([
      fetch("/api/stories").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setStoryList(s.stories);
    const target: AgeTarget | undefined = cfg.settings?.storyAgeTarget;
    if (target) setAgeValue(target.mode === "auto" ? "auto" : String(target.months));
    if (typeof cfg.settings?.storyCandidatesPerDay === "number") {
      setPerDay(cfg.settings.storyCandidatesPerDay);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const setAgeTarget = async (value: string) => {
    setAgeValue(value);
    const option = AGE_OPTIONS.find((o) => o.value === value);
    if (!option) return;
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "storyAgeTarget", value: option.target }),
    });
  };

  const setCandidatesPerDay = async (n: number) => {
    setPerDay(n);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "storyCandidatesPerDay", value: n }),
    });
  };

  const remove = async (story: Story) => {
    if (!confirm(`Delete "${story.title ?? story.prompt}"? This can't be undone.`)) return;
    await fetch(`/api/stories/${story.id}`, { method: "DELETE" });
    load();
  };

  const toggleFavorite = async (story: Story) => {
    // Optimistic flip; poll reconciles.
    setStoryList((list) =>
      list.map((s) => (s.id === story.id ? { ...s, favorite: !s.favorite } : s)),
    );
    await fetch(`/api/stories/${story.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ favorite: !story.favorite }),
    });
  };

  const drafts = storyList.filter((s) => s.status === "draft");
  const waiting = storyList.filter((s) => s.status === "approved");
  const shelf = storyList
    .filter((s) => s.status === "ready")
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.id - a.id);
  const older = storyList.filter(
    (s) => !["draft", "approved", "ready"].includes(s.status),
  );

  const deleteButton = (story: Story) => (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        remove(story);
      }}
      title="Delete story"
      className="shrink-0 rounded-md px-2 py-1 text-neutral-600 transition hover:bg-red-950/60 hover:text-red-400"
    >
      🗑
    </button>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Stories</h1>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            Reading level
            <select
              value={ageValue}
              onChange={(e) => setAgeTarget(e.target.value)}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5"
            >
              {AGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            Candidates/day
            <select
              value={perDay}
              onChange={(e) => setCandidatesPerDay(Number(e.target.value))}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-400">Tonight&apos;s candidates</h2>
        {drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-3 text-sm text-neutral-500">
            No candidates waiting. Two fresh stories arrive each morning — review them here,
            keep the good ones.
          </p>
        ) : (
          drafts.map((s) => (
            <Link
              key={s.id}
              href={`/stories/${s.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-neutral-900 px-4 py-3 transition hover:border-amber-500/70"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{s.title ?? s.prompt}</div>
                <div className="text-xs text-neutral-500">
                  {s.characterName} · {s.pageCount} pages
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm text-amber-400">Review →</span>
                {deleteButton(s)}
              </div>
            </Link>
          ))
        )}
      </section>

      {waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-400">Waiting for art</h2>
          {waiting.map((s) => (
            <Link
              key={s.id}
              href={`/stories/${s.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 transition hover:border-amber-500/50"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{s.title ?? s.prompt}</div>
                <div className="text-xs text-neutral-500">
                  {s.characterName} · {s.pagesDone}/{s.pageCount} pages illustrated
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm">🎨</span>
                {deleteButton(s)}
              </div>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-400">Bookshelf</h2>
        {shelf.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-800 px-4 py-3 text-sm text-neutral-500">
            Finished books land here, ready for bedtime.
          </p>
        ) : (
          shelf.map((s) => (
            <Link
              key={s.id}
              href={`/stories/${s.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 transition hover:border-amber-500/50"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{s.title ?? s.prompt}</div>
                <div className="text-xs text-neutral-500">
                  {s.characterName} · {s.pageCount} pages
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavorite(s);
                  }}
                  title={s.favorite ? "Unfavorite" : "Favorite"}
                  className={`shrink-0 rounded-md px-2 py-1 transition hover:bg-neutral-800 ${
                    s.favorite ? "text-amber-400" : "text-neutral-600 hover:text-amber-400"
                  }`}
                >
                  {s.favorite ? "★" : "☆"}
                </button>
                {deleteButton(s)}
              </div>
            </Link>
          ))
        )}
      </section>

      {older.length > 0 && (
        <section className="space-y-2">
          <button
            onClick={() => setShowOlder((v) => !v)}
            className="text-sm font-medium text-neutral-500 hover:text-neutral-300"
          >
            {showOlder ? "▾" : "▸"} Older &amp; unfinished ({older.length})
          </button>
          {showOlder &&
            older.map((s) => (
              <Link
                key={s.id}
                href={`/stories/${s.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800/60 bg-neutral-900/60 px-4 py-3 transition hover:border-amber-500/50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-neutral-400">
                    {s.title ?? s.prompt}
                  </div>
                  <div className="text-xs text-neutral-600">
                    {s.characterName} · {s.pageCount} pages
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-500">
                    {LEGACY_LABEL[s.status] ?? s.status}
                  </span>
                  {deleteButton(s)}
                </div>
              </Link>
            ))}
        </section>
      )}
    </div>
  );
}
