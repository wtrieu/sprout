"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { COPY } from "./landingCopy";

/** Palette journey as CSS gradients — soil → rain → dawn → green → gold → night. */
const BANDS: Record<string, string> = {
  hero: "from-[#0c0a09] via-[#171009] to-[#171009]",
  roots: "from-[#171009] via-[#241609] to-[#141d29]",
  rain: "from-[#141d29] via-[#1e2c3d] to-[#2b1f12]",
  sprout: "from-[#2b1f12] via-[#5c3a14] to-[#132116]",
  sapling: "from-[#132116] via-[#27401f] to-[#2e2110]",
  bloom: "from-[#2e2110] via-[#5f3f12] to-[#0d1024]",
  night: "from-[#0d1024] via-[#181a3c] to-[#0a0c20]",
  cta: "from-[#0a0c20] via-[#141633] to-[#05061a]",
};

/**
 * Full copy parity with zero WebGL: same story, gradient light instead of
 * shaders. Serves reduced-motion, no-WebGL2, and ?static=1.
 */
export function StaticFallback() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.opacity = "1";
            (e.target as HTMLElement).style.transform = "translateY(0)";
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.25 },
    );
    root.querySelectorAll("[data-io]").forEach((el) => {
      const h = el as HTMLElement;
      h.style.opacity = "0";
      h.style.transform = "translateY(24px)";
      h.style.transition = "opacity 0.8s ease, transform 0.8s ease";
      io.observe(h);
    });
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} data-static-fallback>
      {COPY.map((copy) => {
        const isHero = copy.id === "hero";
        const isCta = copy.id === "cta";
        const align =
          copy.align === "center"
            ? "items-center text-center"
            : copy.align === "right"
              ? "items-end text-right"
              : "items-start text-left";
        return (
          <section
            key={copy.id}
            className={`relative flex min-h-screen items-center bg-gradient-to-b ${BANDS[copy.id]}`}
          >
            <div className={`mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-24 ${align}`}>
              {copy.eyebrow ? (
                <p
                  data-io
                  className={`text-xs font-medium uppercase tracking-[0.3em] text-amber-400 ${isHero ? "text-base tracking-[0.4em]" : ""}`}
                >
                  {copy.eyebrow}
                </p>
              ) : null}
              {isHero ? (
                <h1 data-io className="landing-serif text-5xl font-medium leading-[1.06] text-neutral-50 md:text-7xl">
                  {copy.heading}
                </h1>
              ) : (
                <h2 data-io className="landing-serif text-4xl font-medium leading-[1.1] text-neutral-50 md:text-6xl">
                  {copy.heading}
                </h2>
              )}
              <p data-io className="max-w-xl text-base leading-relaxed text-neutral-300 md:text-lg">
                {copy.body}
              </p>
              {copy.chips ? (
                <div data-io className="mt-2 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  {copy.chips.map((chip) => (
                    <div
                      key={chip}
                      className="rounded-xl border border-amber-200/15 bg-neutral-950/40 px-4 py-3 text-sm text-amber-100/90"
                    >
                      {chip}
                    </div>
                  ))}
                </div>
              ) : null}
              {isCta ? (
                <div data-io className="mt-4">
                  <Link
                    href="/home"
                    className="inline-block rounded-full bg-amber-500 px-8 py-4 text-lg font-semibold text-neutral-950 transition-colors hover:bg-amber-400"
                  >
                    Step inside ❋
                  </Link>
                  <p className="mt-6 text-sm text-neutral-500">
                    Self-hosted. Private. Growing with your family.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
