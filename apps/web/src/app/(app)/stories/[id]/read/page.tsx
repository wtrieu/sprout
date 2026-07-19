"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

type Page = { pageIndex: number; text: string; imagePath: string | null };
type Story = { id: number; title: string | null };

/**
 * Fullscreen bedtime reader: swipe / arrow keys / tap edges to page.
 * Dark, dim, big type — designed for a phone held in a dark nursery.
 */
export default function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [story, setStory] = useState<Story | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [idx, setIdx] = useState(-1); // -1 = title page
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/stories/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setStory(d.story);
        setPages(d.pages);
      });
  }, [id]);

  const next = useCallback(
    () => setIdx((i) => Math.min(i + 1, pages.length - 1)),
    [pages.length],
  );
  const prev = useCallback(() => setIdx((i) => Math.max(i - 1, -1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  if (!story) return null;
  const page = idx >= 0 ? pages[idx] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0d0a06] text-amber-50"
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (dx < -40) next();
        if (dx > 40) prev();
        setTouchX(null);
      }}
      onClick={(e) => {
        const x = e.clientX / window.innerWidth;
        if (x > 0.66) next();
        else if (x < 0.33) prev();
      }}
    >
      <div className="flex items-center justify-between p-4 text-xs text-amber-50/40">
        <Link href={`/stories/${id}`} onClick={(e) => e.stopPropagation()}>
          ← close
        </Link>
        <span>
          {idx + 1} / {pages.length}
        </span>
      </div>

      {page === null ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <h1 className="font-serif text-4xl leading-snug">{story.title}</h1>
          <p className="mt-6 text-sm text-amber-50/40">tap the right side to begin</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {page.imagePath && (
            <div className="flex flex-1 items-center justify-center overflow-hidden px-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/images/${page.imagePath}`}
                alt=""
                className="max-h-full max-w-full rounded-2xl object-contain"
              />
            </div>
          )}
          <div className="px-8 pb-12 pt-6">
            <p className="mx-auto max-w-xl text-center font-serif text-2xl leading-relaxed">
              {page.text}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
