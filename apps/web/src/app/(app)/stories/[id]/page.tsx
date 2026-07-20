"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

type Page = {
  pageIndex: number;
  text: string;
  imagePath: string | null;
  imageStatus: string;
};
type Story = { id: number; title: string | null; prompt: string; status: string };

export default function StoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [story, setStory] = useState<Story | null>(null);
  const [pages, setPages] = useState<Page[]>([]);

  const load = useCallback(async () => {
    const d = await fetch(`/api/stories/${id}`).then((r) => r.json());
    if (d.story) {
      setStory(d.story);
      setPages(d.pages);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (!story) return <p className="text-neutral-500">Loading…</p>;

  const doneImages = pages.filter((p) => p.imageStatus === "done").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{story.title ?? story.prompt}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {story.status === "ready"
              ? "Ready to read"
              : story.status === "rendering"
                ? `Illustrating — ${doneImages}/${pages.length} pages done`
                : story.status === "queued"
                  ? "Waiting for the writer (runs in the next job batch)"
                  : story.status}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {story.status === "ready" && (
            <>
              <Link
                href={`/stories/${story.id}/read`}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-400"
              >
                Read 🌙
              </Link>
              <a
                href={`/api/stories/${story.id}/pdf`}
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-amber-500/50"
              >
                PDF
              </a>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {pages.map((p) => (
          <div key={p.pageIndex} className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
            {p.imagePath && p.imageStatus === "done" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/images/${p.imagePath}`}
                alt={`Page ${p.pageIndex + 1}`}
                className="aspect-square w-full rounded object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded bg-neutral-800 text-xs text-neutral-500">
                {p.imageStatus === "failed" ? "⚠️ failed" : "🎨 pending"}
              </div>
            )}
            <p className="mt-1.5 line-clamp-3 text-xs text-neutral-400">{p.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
