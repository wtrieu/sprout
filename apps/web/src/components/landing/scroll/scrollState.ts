import type Lenis from "lenis";

/**
 * Frame-rate hot path. Lenis writes here on scroll; the R3F frame loop and
 * GSAP tickers read it. Mutable module singleton — zero React re-renders.
 */
export const scrollState = {
  /** 0..1 across the whole journey */
  progress: 0,
  /** lenis velocity (px/frame-ish), signed */
  velocity: 0,
  lenis: null as Lenis | null,
};
