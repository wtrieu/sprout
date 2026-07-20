"use client";

import { createContext, useContext } from "react";

export type Tier = "high" | "mid" | "low";

export type Quality = {
  tier: Tier;
  /** multiplier applied to every particle count */
  particleScale: number;
  /** post-processing (bloom/vignette) enabled */
  post: boolean;
  /** dpr range for the canvas */
  dpr: [number, number];
};

export const QUALITY_PRESETS: Record<Tier, Quality> = {
  high: { tier: "high", particleScale: 1, post: true, dpr: [1, 2] },
  mid: { tier: "mid", particleScale: 0.6, post: true, dpr: [1, 1.5] },
  low: { tier: "low", particleScale: 0.35, post: false, dpr: [1, 1] },
};

export const QualityContext = createContext<Quality>(QUALITY_PRESETS.high);

export function useQuality(): Quality {
  return useContext(QualityContext);
}

/** Heuristic device tier — runs client-side only, before the 3D chunk mounts. */
export function detectTier(): Tier {
  if (typeof window === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = window.innerWidth < 480;
  if ((coarse && (mem <= 4 || small)) || mem <= 2 || cores <= 2) return "low";
  if (coarse || small || mem <= 4 || cores <= 4) return "mid";
  return "high";
}
