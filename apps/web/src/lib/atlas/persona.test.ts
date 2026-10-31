import { describe, expect, it } from "vitest";
import { atlasPersonas } from "../../db/schema";
import { PERSONA_LABELS, personaLine, type PersonaMoment } from "./persona";

const MOMENTS: PersonaMoment[] = ["creation", "map_greeting", "quiz_pass", "quiz_fail"];

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
