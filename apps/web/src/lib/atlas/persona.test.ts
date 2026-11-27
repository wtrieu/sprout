import { describe, expect, it } from "vitest";
import { atlasPersonas } from "../../db/schema";
import { PERSONA_LABELS, personaLine, type PersonaMoment } from "./persona";

const MOMENTS: PersonaMoment[] = [
  "creation",
  "map_greeting",
  "quiz_pass",
  "quiz_fail",
  "loot_reveal",
  "class_offer",
];

describe("personaLine", () => {
  it("every persona speaks at every moment, deterministically per seed", () => {
    for (const persona of atlasPersonas) {
      for (const moment of MOMENTS) {
        const line = personaLine(persona, moment, { name: "Way", nodeTitle: "Stoicism" }, "s1");
        expect(line.length).toBeGreaterThan(10);
        expect(personaLine(persona, moment, { name: "Way", nodeTitle: "Stoicism" }, "s1")).toBe(
          line,
        );
      }
    }
  });

  it("uses the context it is given", () => {
    const greeting = personaLine(
      "cartographer",
      "map_greeting",
      { mapTitle: "Philosophy", unexploredCount: 7, masteredCount: 2 },
      "map-1",
    );
    expect(greeting).toMatch(/7|2|Philosophy/);
    const pass = personaLine("protege", "quiz_pass", { nodeTitle: "Heraclitus" }, "n-9");
    expect(pass.length).toBeGreaterThan(10);
  });

  it("labels exist for the creation cards", () => {
    for (const persona of atlasPersonas) {
      expect(PERSONA_LABELS[persona].title.length).toBeGreaterThan(3);
      expect(PERSONA_LABELS[persona].pitch.length).toBeGreaterThan(20);
    }
  });
});

describe("map greetings are about the map", () => {
  const seeds = Array.from({ length: 60 }, (_, i) => `seed-${i}`);

  it("lines needing a node title never appear without one (no 'undefined')", () => {
    for (const persona of atlasPersonas) {
      for (const seed of seeds) {
        const line = personaLine(persona, "map_greeting", { mapTitle: "Bread" }, seed);
        expect(line).not.toMatch(/undefined|null|""/);
      }
    }
  });

  it("with node titles, most days' greetings name this map's own nodes", () => {
    const ctx = {
      mapTitle: "Bread",
      unexploredCount: 4,
      masteredCount: 1,
      lastNodeTitle: "Gluten networks",
      masteredNodeTitle: "Wild yeast",
      nextNodeTitle: "Oven spring",
    };
    for (const persona of atlasPersonas) {
      const lines = seeds.map((seed) => personaLine(persona, "map_greeting", ctx, seed));
      const specific = lines.filter((l) => /Gluten networks|Wild yeast|Oven spring/.test(l));
      expect(specific.length / lines.length).toBeGreaterThan(0.5);
      // Plenty of variety, not three lines on rotation.
      expect(new Set(lines).size).toBeGreaterThanOrEqual(8);
    }
  });

  it("two topics on the same day rarely share a greeting", () => {
    const bread = { mapTitle: "Bread", lastNodeTitle: "Gluten networks", nextNodeTitle: "Oven spring" };
    const stars = { mapTitle: "Stars", lastNodeTitle: "Red giants", nextNodeTitle: "Neutron stars" };
    for (const persona of atlasPersonas) {
      for (const day of seeds) {
        const a = personaLine(persona, "map_greeting", bread, `1:${day}`);
        const b = personaLine(persona, "map_greeting", stars, `2:${day}`);
        expect(a).not.toBe(b);
      }
    }
  });
});

describe("model-written topic lines", () => {
  const seeds = Array.from({ length: 200 }, (_, i) => `7:day-${i}`);
  const topicLines = ["Bread line one, about sourdough.", "Bread line two, about rye.", "Bread line three, about crumb."];

  it("take about half the days; the rest still reach every template line", () => {
    for (const persona of atlasPersonas) {
      const lines = seeds.map((s) => personaLine(persona, "map_greeting", { mapTitle: "Bread", topicLines }, s));
      const topical = lines.filter((l) => topicLines.includes(l)).length / lines.length;
      expect(topical).toBeGreaterThan(0.35);
      expect(topical).toBeLessThan(0.65);
      for (const t of topicLines) expect(lines).toContain(t);
      // The other days reach every template line, not just the odd-indexed ones.
      const templates = new Set(lines.filter((l) => !topicLines.includes(l)));
      const allTemplates = new Set(seeds.map((s) => personaLine(persona, "map_greeting", { mapTitle: "Bread" }, s)));
      expect(templates).toEqual(allTemplates);
    }
  });

  it("only map greetings use them", () => {
    for (const seed of seeds.slice(0, 30)) {
      expect(topicLines).not.toContain(personaLine("protege", "quiz_pass", { nodeTitle: "Rye", topicLines }, seed));
    }
  });
});
