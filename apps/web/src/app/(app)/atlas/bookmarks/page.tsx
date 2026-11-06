"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";

type Bookmark = {
  id: number;
  nodeId: number;
  nodeTitle: string;
  mapId: number;
  mapTitle: string;
  note: string | null;
  targetAgeYears: number | null;
  kidStatus: "drafting" | "ready" | "failed";
  kidMd: string | null;
  kidToday: string | null;
  kidAgeMonths: number | null;
  kidError: string | null;
  storyTopic: string;
  createdAt: string;
};

/**
 * Everything saved for the child: the parent's note, and the kid version
 * written at the child's age. The kid version drafts in a detached run, so
 * the page polls while any card is still writing.
 */
export default function BookmarksPage() {
  const [childName, setChildName] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/atlas/bookmarks")
      .then((r) => r.json())
      .catch(() => null);
    if (!d) return;
    setChildName(d.childName ?? null);
    setBookmarks(d.bookmarks ?? []);
    setLoaded(true);
  }, []);

  const drafting = bookmarks.some((b) => b.kidStatus === "drafting");

  useEffect(() => {
    load();
    const t = setInterval(load, drafting ? 5000 : 30000);
    return () => clearInterval(t);
  }, [load, drafting]);

  const retry = async (b: Bookmark) => {
    setBusyId(b.id);
    await fetch(`/api/atlas/bookmarks/${b.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regenerateKid: true }),
    }).catch(() => null);
    setBusyId(null);
    load();
  };

  const remove = async (b: Bookmark) => {
    if (!confirm(`Remove "${b.nodeTitle}" from the saved list?`)) return;
    setBusyId(b.id);
    await fetch(`/api/atlas/bookmarks/${b.id}`, { method: "DELETE" }).catch(() => null);
    setBusyId(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-neutral-500">
          <Link href="/atlas" className="hover:text-neutral-300">Atlas</Link>
          <span className="mx-1.5">›</span>
          <span className="text-neutral-400">Saved</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          Saved for {childName ?? "the child"}
        </h1>
      </div>

      {!loaded && <p className="text-sm text-neutral-600">Loading…</p>}

      {loaded && bookmarks.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-800 px-5 py-6 text-sm text-neutral-400">
          Nothing saved yet. Use the save button on any node page to keep it for{" "}
          {childName ?? "the child"}.
        </p>
      )}

      <section className="space-y-3">
        {bookmarks.map((b) => (
          <div key={b.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/atlas/${b.mapId}/${b.nodeId}`}
                  className="text-lg font-medium hover:text-amber-400"
                >
                  {b.nodeTitle}
                </Link>
                <p className="text-xs text-neutral-500">{b.mapTitle}</p>
              </div>
              <span className="shrink-0 rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-400/90">
                {b.targetAgeYears != null ? `For age ${b.targetAgeYears}` : "For now"}
              </span>
            </div>

            {b.note && <p className="mt-3 text-sm text-neutral-300">{b.note}</p>}

            <div className="mt-4 space-y-3">
              {b.kidStatus === "drafting" && (
                <p className="text-sm text-amber-400/80">Writing…</p>
              )}
              {b.kidStatus === "ready" && b.kidMd && (
                <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                  <Markdown md={b.kidMd} />
                </div>
              )}
              {b.kidStatus === "ready" && b.kidToday && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-neutral-200">
                  <span className="font-medium text-amber-400">Today: </span>
                  {b.kidToday}
                </div>
              )}
              {b.kidStatus === "failed" && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-red-400/80">
                    {b.kidError ?? "The kid version didn't come out."}
                  </p>
                  <button
                    disabled={busyId === b.id}
                    onClick={() => retry(b)}
                    className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {/* HOOK(atlas-story): enable once it can POST b.storyTopic to /api/stories/express. */}
              <button
                disabled
                className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-600"
              >
                Make it a story
              </button>
              <span className="text-xs text-neutral-600">coming soon</span>
              <button
                disabled={busyId === b.id}
                onClick={() => remove(b)}
                className="ml-auto rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-red-900 hover:text-red-400 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
