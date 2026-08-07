import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import type { DB } from "../../db/client";
import { artPacks, artPackKeys, composePagePrompt, pickArtPack } from "./storyArt";

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
  it("every pack carries a depth clause — richness is style-specific, never generic", () => {
    for (const key of artPackKeys) {
      expect(artPacks[key].depth.length).toBeGreaterThan(30);
    }
  });

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

describe("composePagePrompt", () => {
  const character = "a small red fox with a patched satchel";
  const scene = "a hilltop at dawn, the fox looking out over the valley";

  it("orders style DNA, character, scene, layers, and depth into one prompt", () => {
    const prompt = composePagePrompt("watercolor-soft", character, scene, {
      background: "in the valley below, a tiny train puffing between farms",
      hiddenFriend: "a snail with a striped shell",
    });
    const dnaAt = prompt.indexOf("watercolor");
    const charAt = prompt.indexOf("red fox");
    const sceneAt = prompt.indexOf("hilltop");
    const bgAt = prompt.indexOf("in the background, in the valley below");
    const friendAt = prompt.indexOf("hidden somewhere small in the scene, a snail");
    const depthAt = prompt.indexOf(artPacks["watercolor-soft"].depth);
    expect(dnaAt).toBeGreaterThanOrEqual(0);
    expect(charAt).toBeGreaterThan(dnaAt);
    expect(sceneAt).toBeGreaterThan(charAt);
    expect(bgAt).toBeGreaterThan(sceneAt);
    expect(friendAt).toBeGreaterThan(bgAt);
    expect(depthAt).toBeGreaterThan(friendAt);
    expect(prompt).toContain("--ar 3:2");
    expect(prompt).toContain("--no text");
  });

  it("omits the layers cleanly when a candidate has none (older shape)", () => {
    const prompt = composePagePrompt("watercolor-soft", character, scene);
    expect(prompt).not.toContain("in the background,");
    expect(prompt).not.toContain("hidden somewhere small");
    expect(prompt).toContain(artPacks["watercolor-soft"].depth);
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
