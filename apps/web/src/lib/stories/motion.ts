import type { PageMotion } from "../../db/schema";

export type { PageMotion };

/**
 * Ken Burns parameters for a page, derived purely from its index so a story's
 * motion is deterministic and alternates in a way that reads as intentional:
 * pan direction flips every page, zoom direction every other page, and a small
 * vertical drift cycles with period 4. Offsets are % of the frame — kept small
 * because the reader renders the image with bleed (object-cover + scale > 1).
 */
export const assignMotion = (pageIndex: number): PageMotion => {
  const zoomIn = pageIndex % 2 === 0;
  const panRight = pageIndex % 2 === 0;
  const drift = [-1.5, 0, 1.5, 0][pageIndex % 4];
  return {
    scaleFrom: zoomIn ? 1.08 : 1.18,
    scaleTo: zoomIn ? 1.18 : 1.08,
    xFrom: panRight ? -2.5 : 2.5,
    xTo: panRight ? 2.5 : -2.5,
    yFrom: drift,
    yTo: -drift,
    durationS: 24,
  };
};
