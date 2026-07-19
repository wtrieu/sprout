"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/**
 * Branded intro: a seed cracks open, a sprout line draws upward, the ❋
 * blooms at its tip — then the whole veil wipes up like breaking soil.
 */
export function Preloader({ onDone }: { onDone?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          setGone(true);
          onDone?.();
        },
      });
      tl.fromTo("[data-seed]", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" })
        .fromTo(
          "[data-stem]",
          { strokeDashoffset: 120 },
          { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" },
          "-=0.1",
        )
        .fromTo(
          "[data-glyph]",
          { scale: 0, opacity: 0, rotate: -60 },
          { scale: 1, opacity: 1, rotate: 0, duration: 0.55, ease: "back.out(2.2)" },
          "-=0.15",
        )
        .to("[data-veil-content]", { opacity: 0, duration: 0.3, delay: 0.35 })
        .to(root, {
          clipPath: "inset(0% 0% 100% 0%)",
          duration: 0.8,
          ease: "power3.inOut",
        });
    }, root);
    return () => ctx.revert();
  }, [onDone]);

  if (gone) return null;
  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950"
      style={{ clipPath: "inset(0% 0% 0% 0%)" }}
      aria-hidden
    >
      <div data-veil-content className="flex flex-col items-center">
        <svg width="120" height="170" viewBox="0 0 120 170" fill="none">
          {/* the sprout line */}
          <path
            data-stem
            d="M60 140 C 60 120, 52 108, 58 88 C 63 72, 57 60, 60 46"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="120"
            strokeDashoffset="120"
          />
          {/* the seed */}
          <ellipse data-seed cx="60" cy="146" rx="10" ry="12" fill="#3a2a1a" stroke="#f59e0b" strokeWidth="1.5" />
          {/* the bloom */}
          <text
            data-glyph
            x="60"
            y="40"
            textAnchor="middle"
            fontSize="34"
            fill="#fbbf24"
            style={{ transformOrigin: "60px 30px" }}
          >
            ❋
          </text>
        </svg>
        <p className="mt-4 text-xs uppercase tracking-[0.4em] text-neutral-500">Sprout</p>
      </div>
    </div>
  );
}
