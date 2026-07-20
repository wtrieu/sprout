"use client";

/**
 * Splits text into masked word spans; the parent section's GSAP timeline
 * animates `.reveal-word` children. Pure markup — no animation logic here.
 */
export function RevealText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className} aria-label={text} role="text">
      {text.split(" ").map((word, i) => (
        <span key={i} className="reveal-line" aria-hidden>
          <span className="reveal-word">{word}</span>
          {" "}
        </span>
      ))}
    </span>
  );
}
