"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";

/** CTA that leans toward the cursor and springs back on leave. */
export function MagneticButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const xTo = gsap.quickTo(inner, "x", { duration: 0.35, ease: "power3.out" });
    const yTo = gsap.quickTo(inner, "y", { duration: 0.35, ease: "power3.out" });

    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      xTo(dx * 0.28);
      yTo(dy * 0.34);
    };
    const onLeave = () => {
      gsap.to(inner, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
    };
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="inline-block p-4">
      <Link
        href={href}
        className={`group inline-block rounded-full bg-amber-500 px-8 py-4 text-lg font-semibold text-neutral-950 shadow-[0_0_40px_rgba(245,158,11,0.35)] transition-colors hover:bg-amber-400 ${className}`}
      >
        <span ref={innerRef} className="inline-block will-change-transform">
          {children}
        </span>
      </Link>
    </div>
  );
}
