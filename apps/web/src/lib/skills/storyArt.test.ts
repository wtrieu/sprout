import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import {
  artPacks,
  artPackKeys,
  composePagePrompt,
  pickArtPack,
  promptWordCount,
  PROMPT_WORD_CEILING,
} from "./storyArt";
import { STYLE_REF_WEIGHT, withStyleRef } from "../stories/engine";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations",
);

const makeDb = (): DB => {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema }) as unknown as DB;
  migrate(db, { migrationsFolder });
  sqlite.pragma("foreign_keys = ON");
  return db;
};

describe("art packs", () => {
  it("every suits entry names a real lane", async () => {
    const { laneKeys } = await import("../stories/lanes");
    for (const key of artPackKeys) {
      for (const lane of artPacks[key].suits ?? []) {
        expect(laneKeys).toContain(lane);
      }
    }
  });

  it("the nonfiction lanes all have at least one suited pack", () => {
    for (const lane of ["how-it-works", "animal-lives", "big-ideas", "history-vignette"]) {
      const suited = artPackKeys.filter((k) => artPacks[k].suits?.includes(lane));
      expect(suited.length).toBeGreaterThan(0);
    }
  });
});

describe("style DNA length", () => {
  // The DNA opens every prompt and is pure overhead against the ceiling; the
  // per-field budgets in writeBook.ts are set assuming it stays <= 20.
  it("every pack's style DNA is at most 20 words", () => {
    for (const key of artPackKeys) {
      const n = artPacks[key].styleDna.split(/\s+/).filter(Boolean).length;
      expect(n, `${key} styleDna is ${n} words`).toBeLessThanOrEqual(20);
    }
  });
});

describe("composePagePrompt", () => {
  const character = "a small red fox with a patched satchel";
  const scene = "a hilltop at dawn, the fox looking out over the valley";
  const background = "a tiny distant train between far farms";

  it("orders style DNA, character, and scene, then the background last", () => {
    const prompt = composePagePrompt("watercolor-soft", character, scene, { background });
    const dnaAt = prompt.indexOf("watercolor");
    const charAt = prompt.indexOf("red fox");
    const sceneAt = prompt.indexOf("hilltop");
    const bgAt = prompt.indexOf("a tiny distant train");
    expect(dnaAt).toBeGreaterThanOrEqual(0);
    expect(charAt).toBeGreaterThan(dnaAt);
    expect(sceneAt).toBeGreaterThan(charAt);
    expect(bgAt).toBeGreaterThan(sceneAt);
    expect(prompt).toContain("--ar 3:2");
    expect(prompt).toContain("--stylize");
    expect(prompt).toContain("--no text");
  });

  it("joins the background as a plain clause, never a V6-era multi-prompt weight", () => {
    // Multi-prompts (`::`) only exist through V6.1 — V7/V8 read the tokens as
    // literal text, so the prompt must stay one continuous sentence.
    const prompt = composePagePrompt("watercolor-soft", character, scene, { background });
    expect(prompt).toContain(`${scene}. a tiny distant train between far farms --ar`);
    expect(prompt).not.toContain("::");
  });

  it("never sends the hidden friend to the image model", () => {
    // "hide this small thing" is not executable by a diffusion model; it lives
    // in artNotes for the parent instead. Guards against it creeping back in.
    const prompt = composePagePrompt("watercolor-soft", character, scene, { background });
    expect(prompt).not.toContain("tucked somewhere tiny");
    expect(prompt).not.toContain("hidden somewhere small");
  });

  it("does not use a positional 'in the background' instruction", () => {
    const prompt = composePagePrompt("watercolor-soft", character, scene, { background });
    expect(prompt).not.toContain("in the background");
  });

  it("stays under the ceiling for every pack at full field budget", () => {
    // Worst case: longest DNA + fields right at their writeBook.ts budgets.
    const maxWords = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    for (const key of artPackKeys) {
      const prompt = composePagePrompt(key, maxWords(21), maxWords(21), {
        background: maxWords(12),
      });
      const n = promptWordCount(prompt);
      expect(n, `${key} composes to ${n} words`).toBeLessThanOrEqual(PROMPT_WORD_CEILING);
    }
  });

  it("omits the background cleanly when a candidate has none (older shape)", () => {
    const prompt = composePagePrompt("watercolor-soft", character, scene);
    expect(prompt).not.toContain("::");
    expect(prompt).toContain("--ar 3:2");
  });
});

describe("withStyleRef", () => {
  it("appends --sref and --sw only when a URL is set", () => {
    const base = "style. character. scene. --ar 3:2 --no text";
    expect(withStyleRef(base, "https://cdn.midjourney.com/abc.png")).toBe(
      `${base} --sref https://cdn.midjourney.com/abc.png --sw ${STYLE_REF_WEIGHT}`,
    );
    expect(withStyleRef(base, null)).toBe(base);
    expect(withStyleRef(base, undefined)).toBe(base);
    expect(withStyleRef(base, "   ")).toBe(base);
  });

  it("uses --sref, never the unsupported --cref", () => {
    // --cref is V6/Niji-6 only; Niji 7 dropped it and V7/V8 replaced it.
    const out = withStyleRef("scene --ar 3:2", "https://cdn.midjourney.com/abc.png");
    expect(out).not.toContain("--cref");
    expect(out).not.toContain("--cw");
  });
});

describe("pickArtPack lane affinity", () => {
  it("prefers suited packs for a lane most of the time, but not always", () => {
    const db = makeDb();
    let state = 42;
    const rand = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    const picks = Array.from({ length: 200 }, () =>
      pickArtPack(db, [], "how-it-works", rand),
    );
    const suitedCount = picks.filter((k) =>
      artPacks[k].suits?.includes("how-it-works"),
    ).length;
    // ~70% suited by construction; assert well above chance and below always.
    expect(suitedCount / picks.length).toBeGreaterThan(0.5);
    expect(suitedCount / picks.length).toBeLessThan(0.95);
  });

  it("falls back to the whole pool for a lane no pack claims", () => {
    const db = makeDb();
    const pick = pickArtPack(db, [], "pourquoi", () => 0.1);
    expect(artPackKeys).toContain(pick);
  });
});
