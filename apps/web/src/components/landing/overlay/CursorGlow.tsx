"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

/** A soft amber halo trailing the cursor. Desktop / fine pointers only. */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(window.matchMedia("(pointer: fine)").matches);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
    const onMove = (e: PointerEvent) => {
      // stay hidden until the pointer actually moves — no glow parked at (0,0)
      el.style.opacity = "1";
      xTo(e.clientX);
      yTo(e.clientY);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-30 h-0 w-0 opacity-0"
    >
      <div className="h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.10)_0%,rgba(245,158,11,0.035)_38%,transparent_70%)]" />
    </div>
  );
}
