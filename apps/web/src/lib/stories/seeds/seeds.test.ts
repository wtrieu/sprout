import { describe, expect, it } from "vitest";
import {
  allSeeds,
  getSeed,
  sampleSeedSuggestions,
  seedBlock,
  seedKeys,
  vocabBlock,
} from "./index";

const CJK_RE = /[぀-ヿ㄀-ㄯ㐀-䶿一-鿿豈-﫿]/;

const culture = { label: "Taiwanese culture", share: 0.2, tags: ["taiwanese", "chinese"] };

describe("seed corpus", () => {
  it("has unique keys and complete entries", () => {
    expect(seedKeys.size).toBe(allSeeds.length);
    for (const seed of allSeeds) {
      expect(seed.bones.length).toBeGreaterThan(100);
      expect(seed.keep.length).toBeGreaterThan(0);
      expect(seed.tags.length).toBeGreaterThan(0);
    }
  });

  it("offers contrast: culture seeds AND non-culture seeds exist", () => {
    const cultureSeeds = allSeeds.filter((s) =>
      s.tags.some((t) => culture.tags.includes(t)),
    );
    expect(cultureSeeds.length).toBeGreaterThanOrEqual(8);
    expect(allSeeds.length - cultureSeeds.length).toBeGreaterThanOrEqual(10);
  });
});

describe("sampleSeedSuggestions", () => {
  it("gives a north star share-proportional slots but never the whole batch", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 20; i++) {
      const picked = sampleSeedSuggestions([culture], 4, rand, 5);
      expect(picked).toHaveLength(4);
      const cultureCount = picked.filter((s) =>
        s.tags.some((t) => culture.tags.includes(t)),
      ).length;
      expect(cultureCount).toBeGreaterThanOrEqual(1);
      expect(cultureCount).toBeLessThan(4);
    }
  });

  it("floats in-season festival seeds to the front of their pool", () => {
    const picked = sampleSeedSuggestions([{ ...culture, share: 0.25 }], 4, () => 0.5, 9);
    const cultureFirst = picked.find((s) => s.tags.some((t) => culture.tags.includes(t)));
    expect(cultureFirst?.key).toBe("change-jade-rabbit"); // Mid-Autumn in September
  });

  it("still returns suggestions with no north stars at all", () => {
    expect(sampleSeedSuggestions([], 4, () => 0.5)).toHaveLength(4);
  });
});

describe("prompt blocks", () => {
  it("seedBlock carries bones + keep + soften", () => {
    const block = seedBlock(getSeed("zodiac-race")!);
    expect(block).toContain("Jade Emperor");
    expect(block).toContain("KEEP");
    expect(block).toContain("SOFTEN");
  });

  it("vocabBlock is romanization-only — never renders script", () => {
    for (const seed of allSeeds) {
      const block = vocabBlock(seed);
      expect(CJK_RE.test(block)).toBe(false);
    }
    const family = vocabBlock(getSeed("family-words")!);
    expect(family).toContain("a-má");
    expect(family).toContain("Hokkien");
  });
});
