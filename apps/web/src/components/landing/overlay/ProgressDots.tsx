"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { COPY, SEGMENTS } from "../landingCopy";
import { scrollState } from "../scroll/scrollState";

const LABELS: Record<string, string> = {
  hero: "The seed",
  roots: "Rooted at home",
  rain: "First rain",
  sprout: "Breaking through",
  sapling: "Growing wild",
  bloom: "In bloom",
  night: "Under the canopy",
  cta: "Come grow",
};

/** Right-edge journey dots — keyboard-accessible chapter navigation. */
export function ProgressDots() {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const buttons = Array.from(list.querySelectorAll("button"));
    const tick = () => {
      const active = Math.round(scrollState.progress * SEGMENTS);
      buttons.forEach((b, i) => {
        b.dataset.active = i === active ? "true" : "false";
      });
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);

  const goTo = (i: number) => {
    const target = document.getElementById(`chapter-${COPY[i].id}`);
    if (!target) return;
    if (scrollState.lenis) scrollState.lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div
      ref={listRef}
      className="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 md:flex"
      role="navigation"
      aria-label="Story chapters"
    >
      {COPY.map((c, i) => (
        <button
          key={c.id}
          onClick={() => goTo(i)}
          aria-label={LABELS[c.id] ?? c.id}
          title={LABELS[c.id] ?? c.id}
          className="group relative flex h-4 w-4 items-center justify-center"
        >
          <span className="block h-1.5 w-1.5 rounded-full bg-neutral-500 transition-all duration-300 group-hover:bg-amber-300 group-data-[active=true]:h-2.5 group-data-[active=true]:w-2.5 group-data-[active=true]:bg-amber-400 group-data-[active=true]:shadow-[0_0_12px_rgba(245,158,11,0.8)]" />
        </button>
      ))}
    </div>
  );
}
