"use client";

import { lazy, Suspense } from "react";
import { BEATS } from "../chapters/chapterConfig";

const Spline = lazy(() => import("@splinetool/react-spline"));

/**
 * ────────────────────────────────────────────────────────────────────
 *  SPLINE SLOT — hand-authored scene drop-in
 *
 *  1. Author a scene in the Spline editor (https://spline.design).
 *  2. Export → "Code" → copy the `.splinecode` URL.
 *  3. Paste it as `splineUrl` on the matching beat in
 *     src/components/landing/chapters/chapterConfig.ts.
 *
 *  The Spline runtime (~1 MB) lazy-loads ONLY when a URL is set —
 *  with every splineUrl null this component renders nothing and costs
 *  nothing. The scene renders full-bleed inside its chapter section,
 *  above the procedural canvas and below the copy, pointer-events off.
 * ────────────────────────────────────────────────────────────────────
 */
export function SplineSlot({ beat }: { beat: number }) {
  const url = BEATS[beat]?.splineUrl;
  if (!url) return null;
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <Suspense fallback={null}>
        <Spline scene={url} />
      </Suspense>
    </div>
  );
}
