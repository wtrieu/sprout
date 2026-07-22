import { describe, expect, it } from "vitest";
import { assignMotion } from "./motion";

describe("assignMotion", () => {
  it("is deterministic per page index", () => {
    expect(assignMotion(3)).toEqual(assignMotion(3));
  });

  it("alternates pan direction and zoom direction between adjacent pages", () => {
    const a = assignMotion(0);
    const b = assignMotion(1);
    expect(Math.sign(a.xTo - a.xFrom)).not.toBe(Math.sign(b.xTo - b.xFrom));
    expect(Math.sign(a.scaleTo - a.scaleFrom)).not.toBe(Math.sign(b.scaleTo - b.scaleFrom));
  });

  it("always keeps the image over-scaled so panning never exposes edges", () => {
    for (let i = 0; i < 12; i++) {
      const m = assignMotion(i);
      expect(Math.min(m.scaleFrom, m.scaleTo)).toBeGreaterThan(1);
      expect(Math.max(Math.abs(m.xFrom), Math.abs(m.xTo))).toBeLessThanOrEqual(4);
      expect(Math.max(Math.abs(m.yFrom), Math.abs(m.yTo))).toBeLessThanOrEqual(4);
      expect(m.durationS).toBeGreaterThan(0);
    }
  });
});
