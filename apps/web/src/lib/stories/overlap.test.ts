import { describe, expect, it } from "vitest";
import { motifPhrases, overlappingMotifs } from "./overlap";

describe("imagery overlap", () => {
  it("extracts content phrases, not stopword glue", () => {
    const phrases = motifPhrases("The fireflies blinked awake over the meadow.");
    expect(phrases).toContain("fireflies");
    expect(phrases).toContain("blinked awake");
    expect(phrases).not.toContain("over the");
    expect(phrases).not.toContain("the");
  });

  it("reports motifs shared with recent stories, longest first, deduped", () => {
    const draft =
      "The fireflies blinked awake. A warm croissant waited on the windowsill. Pip yawned.";
    const recent = [
      "Fireflies danced by the pond while Bram ate a warm croissant slowly.",
      "The stars blinked awake one by one.",
    ];
    const overlaps = overlappingMotifs(draft, recent);
    expect(overlaps).toContain("warm croissant");
    expect(overlaps).toContain("blinked awake");
    expect(overlaps).toContain("fireflies");
    // "croissant" alone is covered by "warm croissant"
    expect(overlaps).not.toContain("croissant");
  });

  it("returns nothing when the draft is fresh", () => {
    const overlaps = overlappingMotifs("A grumpy cloud refused to rain.", [
      "Fireflies danced by the pond.",
    ]);
    expect(overlaps).toEqual([]);
  });
});
