"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import stylePacksJson from "@/lib/stylePacks.json";

const STYLE_OPTIONS: Array<{ key: string; name: string; description: string }> = Object.entries(
  stylePacksJson.packs,
).map(([key, p]) => ({ key, name: p.name, description: p.description }));

type Character = { id: number; name: string; refImagePath: string | null };
type Story = {
  id: number;
  title: string | null;
  prompt: string;
  status: string;
  pageCount: number;
  characterName: string;
};
type Arc = {
  id: number;
  title: string;
  focus: string | null;
  ageMonths: number;
  stories: Array<{ id: number; arcIndex: number; title: string | null; status: string }>;
};

const STATUS_LABEL: Record<string, string> = {
  queued: "✍️ writing soon",
  text_done: "✍️ written",
  rendering: "🎨 illustrating",
  ready: "✅ ready",
  failed: "⚠️ failed",
};

export default function StoriesPage() {
  const [storyList, setStoryList] = useState<Story[]>([]);
  const [charList, setCharList] = useState<Character[]>([]);
  const [arcList, setArcList] = useState<Arc[]>([]);
  const [prompt, setPrompt] = useState("");
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(8);
  const [style, setStyle] = useState("surprise");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [arcFocus, setArcFocus] = useState("");
  const [arcCount, setArcCount] = useState(3);
  const [arcStyle, setArcStyle] = useState("surprise");
  const [arcBusy, setArcBusy] = useState(false);
  const [arcError, setArcError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, c, a] = await Promise.all([
      fetch("/api/stories").then((r) => r.json()),
      fetch("/api/characters").then((r) => r.json()),
      fetch("/api/arcs").then((r) => r.json()),
    ]);
    setStoryList(s.stories);
    setCharList(c.characters);
    setArcList(a.arcs ?? []);
    if (c.characters.length > 0) {
      setCharacterId((prev) => prev ?? c.characters[0].id);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const createArc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!characterId) return;
    setArcBusy(true);
    setArcError(null);
    const res = await fetch("/api/arcs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        characterId,
        storyCount: arcCount,
        focus: arcFocus.trim() || undefined,
        style: arcStyle,
      }),
    });
    setArcBusy(false);
    if (res.ok) {
      setArcFocus("");
      setNotice(
        "Arc planned! The stories are queued — text is written first, then illustrations render in the next batch.",
      );
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setArcError(data.error ?? "Arc planning failed.");
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!characterId) return;
    setBusy(true);
    const res = await fetch("/api/stories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ characterId, prompt, pageCount, style }),
    });
    setBusy(false);
    if (res.ok) {
      setPrompt("");
      setNotice(
        "Story queued! Text is written first, then illustrations render in the next batch — start one from Sources → “Crawl now”, or it happens overnight.",
      );
      load();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Stories</h1>
        <Link href="/characters" className="text-sm text-amber-400 hover:underline">
          Characters →
        </Link>
      </div>

      {charList.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-neutral-400">
            Create a recurring character first — they&apos;ll star in every story.
          </p>
          <Link
            href="/characters"
            className="mt-3 inline-block rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400"
          >
            Create a character
          </Link>
        </div>
      ) : (
        <form onSubmit={create} className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="font-medium">New bedtime story</h2>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
            placeholder="Tonight's theme — e.g. splashing in puddles, visiting grandma, the big red balloon"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select
              value={characterId ?? ""}
              onChange={(e) => setCharacterId(Number(e.target.value))}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5"
            >
              {charList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-neutral-400">
              Pages
              <input
                type="number"
                min={4}
                max={12}
                value={pageCount}
                onChange={(e) => setPageCount(Number(e.target.value))}
                className="w-16 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5"
              />
            </label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              title={STYLE_OPTIONS.find((s) => s.key === style)?.description}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5"
            >
              <option value="surprise">🎨 Surprise me</option>
              {STYLE_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              className="rounded-md bg-amber-500 px-4 py-1.5 font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {busy ? "Queuing…" : "Write it"}
            </button>
          </div>
          {notice && <p className="text-xs text-amber-300/80">{notice}</p>}
        </form>
      )}

      {charList.length > 0 && (
        <form
          onSubmit={createArc}
          className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-5"
        >
          <h2 className="font-medium">Story arc</h2>
          <p className="text-xs text-neutral-500">
            A connected mini-series where each story gently models a skill from
            the current developmental stage — sharing, naming feelings, trying
            new things.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              value={arcFocus}
              onChange={(e) => setArcFocus(e.target.value)}
              placeholder="Optional focus — e.g. new sibling arriving, starting daycare"
              className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 outline-none focus:border-amber-500"
            />
            <label className="flex items-center gap-2 text-neutral-400">
              Stories
              <input
                type="number"
                min={2}
                max={5}
                value={arcCount}
                onChange={(e) => setArcCount(Number(e.target.value))}
                className="w-14 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5"
              />
            </label>
            <select
              value={arcStyle}
              onChange={(e) => setArcStyle(e.target.value)}
              title={STYLE_OPTIONS.find((s) => s.key === arcStyle)?.description}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5"
            >
              <option value="surprise">🎨 Surprise me</option>
              {STYLE_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={arcBusy}
              className="rounded-md bg-amber-500 px-4 py-1.5 font-medium text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {arcBusy ? "Planning…" : "Plan arc"}
            </button>
          </div>
          {arcError && <p className="text-xs text-red-400">{arcError}</p>}
        </form>
      )}

      {arcList.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-400">Arcs</h2>
          {arcList.map((arc) => (
            <div key={arc.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
              <div className="font-medium">{arc.title}</div>
              <div className="text-xs text-neutral-500">
                planned at {arc.ageMonths} months
                {arc.focus ? ` · focus: ${arc.focus}` : ""}
              </div>
              <div className="mt-2 space-y-1">
                {arc.stories.map((s) => (
                  <Link
                    key={s.id}
                    href={`/stories/${s.id}`}
                    className="flex items-center justify-between text-sm text-neutral-300 hover:text-amber-400"
                  >
                    <span>
                      {s.arcIndex + 1}. {s.title ?? "…"}
                    </span>
                    <span className="text-xs">{STATUS_LABEL[s.status] ?? s.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {storyList.map((s) => (
          <Link
            key={s.id}
            href={`/stories/${s.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 transition hover:border-amber-500/50"
          >
            <div>
              <div className="font-medium">{s.title ?? s.prompt}</div>
              <div className="text-xs text-neutral-500">
                {s.characterName} · {s.pageCount} pages
              </div>
            </div>
            <span className="text-sm">{STATUS_LABEL[s.status] ?? s.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
