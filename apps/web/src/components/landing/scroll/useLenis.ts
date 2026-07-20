"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scrollState } from "./scrollState";

gsap.registerPlugin(ScrollTrigger);

declare global {
  interface Window {
    /** dev-only handle for browser-driven verification */
    sproutLenis?: Lenis;
  }
}

/**
 * One Lenis instance driven by GSAP's ticker so smooth-scroll, ScrollTrigger
 * and the WebGL frame loop are phase-locked on a single RAF.
 */
export function useLenis(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    scrollState.lenis = lenis;
    if (process.env.NODE_ENV !== "production") window.sproutLenis = lenis;

    const onScroll = () => {
      scrollState.progress = Math.min(1, Math.max(0, lenis.progress));
      scrollState.velocity = lenis.velocity;
      ScrollTrigger.update();
    };
    lenis.on("scroll", onScroll);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // initial sync (e.g. reload mid-page)
    onScroll();

    return () => {
      gsap.ticker.remove(raf);
      lenis.off("scroll", onScroll);
      lenis.destroy();
      if (scrollState.lenis === lenis) scrollState.lenis = null;
      if (process.env.NODE_ENV !== "production" && window.sproutLenis === lenis) {
        delete window.sproutLenis;
      }
    };
  }, [enabled]);
}
