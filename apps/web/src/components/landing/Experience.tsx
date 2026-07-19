"use client";

import { useEffect } from "react";
import { useLenis } from "./scroll/useLenis";
import { CanvasRoot } from "./canvas/CanvasRoot";
import { Overlay } from "./overlay/Overlay";
import { ProgressDots } from "./overlay/ProgressDots";
import { CursorGlow } from "./overlay/CursorGlow";
import { SoundToggle } from "./overlay/SoundToggle";
import { Preloader } from "./Preloader";
import { Chapter0Seed } from "./chapters/Chapter0Seed";
import { Chapter1Roots } from "./chapters/Chapter1Roots";
import { Chapter2Rain } from "./chapters/Chapter2Rain";
import { Chapter3Sprout } from "./chapters/Chapter3Sprout";
import { Chapter4Sapling } from "./chapters/Chapter4Sapling";
import { Chapter5Bloom } from "./chapters/Chapter5Bloom";
import { Chapter6Night } from "./chapters/Chapter6Night";
import { QUALITY_PRESETS, type Tier } from "./hooks/quality";
import { scrollState } from "./scroll/scrollState";
import { SEGMENTS } from "./landingCopy";

/** Dev affordance: /?beat=3.5 pins the journey at that beat (no scrolling). */
function usePinnedBeat(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("beat");
  if (raw === null) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(SEGMENTS, Math.max(0, v)) : null;
}

/** The full cinematic experience: one persistent canvas + scrolling story. */
export default function Experience({ tier }: { tier: Tier }) {
  const pinnedBeat = usePinnedBeat();
  useLenis(pinnedBeat === null);

  useEffect(() => {
    if (pinnedBeat !== null) scrollState.progress = pinnedBeat / SEGMENTS;
  }, [pinnedBeat]);

  useEffect(() => {
    document.body.dataset.tier = tier;
    return () => {
      delete document.body.dataset.tier;
    };
  }, [tier]);

  return (
    <div className="relative">
      {pinnedBeat === null && <Preloader />}
      <CanvasRoot quality={QUALITY_PRESETS[tier]} manualLoop={pinnedBeat !== null}>
        <Chapter0Seed />
        <Chapter1Roots />
        <Chapter2Rain />
        <Chapter3Sprout />
        <Chapter4Sapling />
        <Chapter5Bloom />
        <Chapter6Night />
      </CanvasRoot>
      <Overlay pinnedBeat={pinnedBeat} />
      {pinnedBeat === null && <ProgressDots />}
      {tier !== "low" && <CursorGlow />}
      <SoundToggle />
      <div className="landing-noise" aria-hidden />
    </div>
  );
}
