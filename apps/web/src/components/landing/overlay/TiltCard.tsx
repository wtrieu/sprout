"use client";

import { useRef } from "react";

/** Feature chip with a gentle 3D tilt toward the cursor. Transform-only. */
export function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(600px) rotateY(${px * 14}deg) rotateX(${-py * 14}deg) translateZ(6px)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = "perspective(600px) rotateY(0deg) rotateX(0deg)";
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="rounded-xl border border-amber-200/15 bg-neutral-950/40 px-4 py-3 text-sm text-amber-100/90 backdrop-blur-sm transition-transform duration-200 will-change-transform"
    >
      {children}
    </div>
  );
}
