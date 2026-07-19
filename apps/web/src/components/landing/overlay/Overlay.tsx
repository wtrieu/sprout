"use client";

import { COPY } from "../landingCopy";
import { ChapterSection } from "./ChapterSection";
import { SplineSlot } from "../spline/SplineSlot";

/** The scrollable story column — 8 beats of 100vh each over the fixed canvas. */
export function Overlay({ pinnedBeat = null }: { pinnedBeat?: number | null }) {
  if (pinnedBeat !== null) {
    const i = Math.round(pinnedBeat);
    return (
      <div className="fixed inset-0 z-10">
        <SplineSlot beat={i} />
        <ChapterSection copy={COPY[i]} index={i} instant />
      </div>
    );
  }
  return (
    <div className="relative z-10">
      {COPY.map((copy, i) => (
        <div key={copy.id} className="relative">
          <SplineSlot beat={i} />
          <ChapterSection copy={copy} index={i} />
        </div>
      ))}
    </div>
  );
}
