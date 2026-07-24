"use client";

import Link from "next/link";
import { Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

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

/**
 * A tappable story row. The whole row navigates via a stretched Link overlay;
 * the action buttons are SIBLINGS of that link (not nested inside an <a>, which
 * is invalid HTML and the source of the flaky mobile taps). Buttons are 44px
 * touch targets with active feedback.
 */
function StoryRow({
  story,
  subtitle,
  hint,
  borderClass,
  titleClass,
  showFavorite,
  onDelete,
  onToggleFavorite,
}: {
  story: Story;
  subtitle: ReactNode;
  hint?: ReactNode;
  borderClass: string;
  titleClass?: string;
  showFavorite?: boolean;
  onDelete: (s: Story) => void;
  onToggleFavorite?: (s: Story) => void;
}) {
  return (
    <div
      className={`relative flex items-center gap-1 rounded-lg border bg-neutral-900 pl-4 pr-1.5 transition ${borderClass}`}
    >
      <Link
        href={`/stories/${story.id}`}
        aria-label={story.title ?? story.prompt}
        className="absolute inset-0 rounded-lg"
      />
      <div className="pointer-events-none relative min-w-0 flex-1 py-3">
        <div className={`truncate font-medium ${titleClass ?? ""}`}>{story.title ?? story.prompt}</div>
        <div className="text-xs text-neutral-500">{subtitle}</div>
      </div>
      {hint && <span className="pointer-events-none relative shrink-0 pr-1 text-sm">{hint}</span>}
      {showFavorite && onToggleFavorite && (
        <button
          type="button"
          onClick={() => onToggleFavorite(story)}
          aria-label={story.favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={story.favorite}
          className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition active:scale-90 ${
            story.favorite ? "text-amber-400" : "text-neutral-500 hover:text-amber-400"
          }`}
        >
          <Star className="h-5 w-5" fill={story.favorite ? "currentColor" : "none"} />
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(story)}
        aria-label="Delete story"
        className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-red-950/60 hover:text-red-400 active:scale-90"
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
  );
}

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
            <StoryRow
              key={s.id}
              story={s}
              subtitle={`${s.characterName} · ${s.pageCount} pages`}
              hint={<span className="text-amber-400">Review →</span>}
              borderClass="border-amber-500/30 hover:border-amber-500/70"
              onDelete={remove}
            />
          ))
        )}
      </section>

      {waiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-400">Waiting for art</h2>
          {waiting.map((s) => (
            <StoryRow
              key={s.id}
              story={s}
              subtitle={`${s.characterName} · ${s.pagesDone}/${s.pageCount} pages illustrated`}
              hint={<span>🎨</span>}
              borderClass="border-neutral-800 hover:border-amber-500/50"
              onDelete={remove}
            />
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
            <StoryRow
              key={s.id}
              story={s}
              subtitle={`${s.characterName} · ${s.pageCount} pages`}
              borderClass="border-neutral-800 hover:border-amber-500/50"
              showFavorite
              onToggleFavorite={toggleFavorite}
              onDelete={remove}
            />
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
              <StoryRow
                key={s.id}
                story={s}
                subtitle={`${s.characterName} · ${s.pageCount} pages`}
                titleClass="text-neutral-400"
                hint={
                  <span className="text-xs text-neutral-500">
                    {LEGACY_LABEL[s.status] ?? s.status}
                  </span>
                }
                borderClass="border-neutral-800/60 hover:border-amber-500/50"
                onDelete={remove}
              />
            ))}
        </section>
      )}
    </div>
  );
}
