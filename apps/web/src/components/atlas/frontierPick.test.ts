import { describe, expect, it } from "vitest";
import { pickReadable } from "./frontierPick";

describe("pickReadable", () => {
  it("is readable only once the one-pager is ready", () => {
    expect(pickReadable({ ready: { onepager: true } })).toBe(true);
    expect(pickReadable({ ready: { onepager: false } })).toBe(false);
  });

  it("ignores the deep dive, which is optional for the note", () => {
    const view = { ready: { onepager: true, deepdive: false } };
    expect(pickReadable(view)).toBe(true);
  });

  it("treats no pick as not readable", () => {
    expect(pickReadable(null)).toBe(false);
    expect(pickReadable(undefined)).toBe(false);
  });
});
