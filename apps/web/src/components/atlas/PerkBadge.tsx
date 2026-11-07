export type PerkMark = "bookmark" | "reminder" | "bridge";

const MARKS: Record<PerkMark, { glyph: string; label: string }> = {
  bookmark: { glyph: "❝", label: "Worth a deeper look" },
  reminder: { glyph: "?", label: "Test yourself" },
  bridge: { glyph: "⇄", label: "This connects your branches" },
};

/** A quiet class-perk hint on a node. A nudge only: never locks or dims anything. */
export function PerkBadge({ mark }: { mark: PerkMark }) {
  const { glyph, label } = MARKS[mark];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/5 px-1 text-[10px] leading-none text-sky-300/80"
    >
      {glyph}
    </span>
  );
}
