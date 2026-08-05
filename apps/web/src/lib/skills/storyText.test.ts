import { describe, expect, it } from "vitest";
import { ageBand, clampPageCount, validatePages } from "./storyText";

describe("ageBand scaling", () => {
  it("scales word budget AND page count with age", () => {
    expect(ageBand(12)).toMatchObject({ maxWordsPerPage: 22, minPages: 6, maxPages: 8 });
    expect(ageBand(24)).toMatchObject({ maxWordsPerPage: 32, minPages: 8, maxPages: 10 });
    expect(ageBand(36)).toMatchObject({ maxWordsPerPage: 45, minPages: 10, maxPages: 12 });
    expect(ageBand(60)).toMatchObject({ maxWordsPerPage: 70, minPages: 12, maxPages: 16 });
  });

  it("clamps a premise's proposed length into the band", () => {
    const band = ageBand(24);
    expect(clampPageCount(band, 9)).toBe(9);
    expect(clampPageCount(band, 3)).toBe(band.minPages);
    expect(clampPageCount(band, 30)).toBe(band.maxPages);
    expect(clampPageCount(band, undefined)).toBe(band.maxPages);
  });
});

describe("validatePages with optional form", () => {
  const pages = (text: string, n = 8) => ({ pages: Array.from({ length: n }, () => ({ text })) });

  it("runs only global checks when no form is picked", () => {
    // This text would fail every form validator, but with formKey null it passes.
    expect(validatePages(pages("A quiet page about mud."), null, ageBand(24))).toEqual([]);
    expect(validatePages(pages("A quiet page about mud."), undefined, ageBand(24))).toEqual([]);
  });

  it("still enforces the word budget without a form", () => {
    const wall = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    const problems = validatePages(pages(wall), null, ageBand(24));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatch(/words/);
  });

  it("rejects rendered Chinese characters (romanization only)", () => {
    const problems = validatePages(pages("A-má 阿媽 waved from the kitchen."), null, ageBand(24));
    expect(problems[0]).toMatch(/romanization/);
    expect(validatePages(pages("A-má waved from the kitchen."), null, ageBand(24))).toEqual([]);
  });

  it("still runs form validators when a form IS picked", () => {
    const problems = validatePages(pages("No questions here."), "question-answer", ageBand(24));
    expect(problems.length).toBeGreaterThan(0);
  });
});
