"use client";

import { SpriteCanvas } from "./sprite/SpriteCanvas";
import { FRAME_ACCENTS, accentFor, type Loadout, type NextGate } from "./loadout";

/** "Total level N · next offer at G" — the visible-gates line. */
export const levelLine = (totalLevel: number, nextGate: NextGate | undefined): string =>
  `Total level ${totalLevel}${nextGate ? ` · next offer at ${nextGate.level}` : ""}`;

/** Class arrives as a title string or an object; show whichever it is. */
export const classTitleOf = (raw: unknown): string | null => {
  if (typeof raw === "string") return raw || null;
  if (raw && typeof raw === "object" && typeof (raw as { title?: unknown }).title === "string") {
    return (raw as { title: string }).title;
  }
  return null;
};

/** The character at a glance: idle sprite in its equipped frame, title, level. */
export function CharacterCard({
  name,
  loadout,
  classTitle,
  totalLevel,
  nextGate,
  scale = 3,
}: {
  name: string;
  loadout: Loadout;
  classTitle: string | null;
  totalLevel: number;
  nextGate?: NextGate;
  scale?: number;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className={`shrink-0 rounded-lg bg-neutral-950 p-1 ${accentFor(FRAME_ACCENTS, loadout.frame)}`}>
        <SpriteCanvas loadout={loadout} scale={scale} label={`${name}'s character`} />
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-neutral-100">{name}</p>
        <p className="text-sm text-amber-400/90">{classTitle ?? "Apprentice — no title yet"}</p>
        <p className="text-xs text-neutral-500">{levelLine(totalLevel, nextGate)}</p>
      </div>
    </div>
  );
}
