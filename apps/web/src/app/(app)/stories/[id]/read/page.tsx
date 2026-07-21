"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type PageMotion = {
  scaleFrom: number;
  scaleTo: number;
  xFrom: number;
  xTo: number;
  yFrom: number;
  yTo: number;
  durationS: number;
};
type Page = {
  pageIndex: number;
  text: string;
  imagePath: string | null;
  motion: PageMotion | null;
};
type Story = { id: number; title: string | null };

/** motion → CSS custom properties consumed by the story-kb keyframe. */
const kbVars = (m: PageMotion): CSSProperties =>
  ({
    "--kb-s0": m.scaleFrom,
    "--kb-s1": m.scaleTo,
    "--kb-x0": `${m.xFrom}%`,
    "--kb-x1": `${m.xTo}%`,
    "--kb-y0": `${m.yFrom}%`,
    "--kb-y1": `${m.yTo}%`,
    "--kb-dur": `${m.durationS}s`,
  }) as CSSProperties;

const PageImage = ({ page }: { page: Page }) => {
  if (!page.imagePath) return null;
  if (page.motion) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/images/${page.imagePath}`}
        alt=""
        style={kbVars(page.motion)}
        className="story-kb h-full w-full object-cover"
      />
    );
  }
  // Legacy pages (no motion metadata): static, uncropped.
  return (
    <div className="flex h-full w-full items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/images/${page.imagePath}`}
        alt=""
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
};

/**
 * Fullscreen bedtime reader: swipe / arrow keys / tap edges to page.
 * Dark, dim, big type — designed for a phone held in a dark nursery.
 * Illustrated pages drift with a slow Ken Burns pan/zoom and crossfade on
 * page turns (both disabled by prefers-reduced-motion).
 */
export default function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [story, setStory] = useState<Story | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [idx, setIdx] = useState(-1); // -1 = title page
  const [touchX, setTouchX] = useState<number | null>(null);
  const prevIdxRef = useRef(-1);

  useEffect(() => {
    fetch(`/api/stories/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setStory(d.story);
        setPages(d.pages);
      });
  }, [id]);

  const go = useCallback((updater: (i: number) => number) => {
    setIdx((i) => {
      const nextIdx = updater(i);
      if (nextIdx !== i) prevIdxRef.current = i;
      return nextIdx;
    });
  }, []);
  const next = useCallback(
    () => go((i) => Math.min(i + 1, pages.length - 1)),
    [go, pages.length],
  );
  const prev = useCallback(() => go((i) => Math.max(i - 1, -1)), [go]);

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
  const prevPage = prevIdxRef.current >= 0 ? pages[prevIdxRef.current] : null;

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
            <div className="relative mx-4 flex-1 overflow-hidden rounded-2xl">
              {/* Outgoing page sits beneath while the incoming one fades in. */}
              {prevPage && prevPage.pageIndex !== page.pageIndex && (
                <div className="absolute inset-0">
                  <PageImage page={prevPage} />
                </div>
              )}
              <div key={idx} className="story-page-in absolute inset-0">
                <PageImage page={page} />
              </div>
            </div>
          )}
          <div className="px-8 pb-12 pt-6">
            <p
              key={idx}
              className="story-page-in mx-auto max-w-xl text-center font-serif text-2xl leading-relaxed"
            >
              {page.text}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
