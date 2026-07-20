"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ChapterCopy } from "../landingCopy";
import { RevealText } from "./RevealText";
import { TiltCard } from "./TiltCard";
import { MagneticButton } from "./MagneticButton";

gsap.registerPlugin(ScrollTrigger);

const ALIGN_CLASSES: Record<ChapterCopy["align"], string> = {
  left: "items-start text-left mr-auto ml-[6vw] md:ml-[10vw]",
  right: "items-end text-right ml-auto mr-[6vw] md:mr-[10vw]",
  center: "items-center text-center mx-auto",
};

/** One 100vh beat of the story: eyebrow, headline, body, optional chips/CTA. */
export function ChapterSection({
  copy,
  index,
  instant = false,
}: {
  copy: ChapterCopy;
  index: number;
  /** pinned-beat dev mode: show everything without scroll animations */
  instant?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const isHero = copy.id === "hero";
  const isCta = copy.id === "cta";

  useEffect(() => {
    const section = ref.current;
    if (!section || instant) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        section.querySelectorAll(".reveal-word"),
        { yPercent: 115, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          stagger: 0.04,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: section, start: "top 68%" },
        },
      );
      gsap.fromTo(
        section.querySelectorAll("[data-fade]"),
        { y: 26, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          stagger: 0.08,
          duration: 1,
          ease: "power2.out",
          delay: 0.25,
          scrollTrigger: { trigger: section, start: "top 62%" },
        },
      );
      if (!isHero) {
        // gently release the copy as the section leaves
        gsap.to(section.querySelector("[data-content]"), {
          opacity: 0,
          y: -40,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "bottom 38%",
            end: "bottom 6%",
            scrub: true,
          },
        });
      }
    }, section);
    return () => ctx.revert();
  }, [isHero, instant]);

  return (
    <section
      ref={ref}
      id={`chapter-${copy.id}`}
      data-beat={index}
      className="relative flex h-screen items-center"
    >
      <div
        data-content
        className={`relative flex w-full max-w-2xl flex-col gap-5 px-6 ${ALIGN_CLASSES[copy.align]}`}
      >
        {/* soft scrim so copy stays legible over bright skies */}
        <div
          aria-hidden
          className="absolute -inset-12 -z-10 rounded-[4rem] bg-neutral-950/30 blur-3xl"
        />
        {copy.eyebrow ? (
          <p
            data-fade
            className={`text-xs font-medium uppercase tracking-[0.3em] ${
              isHero ? "text-amber-400 text-base tracking-[0.4em]" : "text-amber-400/90"
            }`}
          >
            {copy.eyebrow}
          </p>
        ) : null}
        {isHero ? (
          <h1 className="landing-serif text-5xl font-medium leading-[1.06] text-neutral-50 md:text-7xl">
            <RevealText text={copy.heading} />
          </h1>
        ) : (
          <h2 className="landing-serif text-4xl font-medium leading-[1.1] text-neutral-50 md:text-6xl">
            <RevealText text={copy.heading} />
          </h2>
        )}
        <p
          data-fade
          className="max-w-xl text-base leading-relaxed text-neutral-300/95 md:text-lg [text-shadow:0_1px_18px_rgba(0,0,0,0.7)]"
        >
          {copy.body}
        </p>
        {copy.chips ? (
          <div data-fade className="mt-2 grid max-w-2xl grid-cols-2 gap-2.5 md:grid-cols-4">
            {copy.chips.map((chip) => (
              <TiltCard key={chip}>{chip}</TiltCard>
            ))}
          </div>
        ) : null}
        {isCta ? (
          <div data-fade className="mt-4">
            <MagneticButton href="/home">Step inside ❋</MagneticButton>
            <p className="mt-6 text-sm text-neutral-500">
              Self-hosted. Private. Growing with your family.
            </p>
          </div>
        ) : null}
      </div>
      {copy.hint ? (
        <div
          data-fade
          className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-center"
        >
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">{copy.hint}</p>
          <div className="mx-auto mt-3 h-9 w-px overflow-hidden">
            <div className="h-full w-full animate-pulse bg-gradient-to-b from-amber-400/0 via-amber-400 to-amber-400/0" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
