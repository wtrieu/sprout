import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CANON_PROMPT_LINES,
  appendCanon,
  canonLineFor,
  defaultWorld,
  getWorld,
  readCanon,
  worldBlock,
  worldBrief,
  worldKeys,
} from "./worlds";

const CJK_RE = /[぀-ヿ㄀-ㄯ㐀-䶿一-鿿豈-﫿]/;

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sprout-canon-"));
  process.env.WORLD_CANON_PATH = path.join(tmpDir, "nested", "world-canon.md");
});

afterEach(() => {
  delete process.env.WORLD_CANON_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const story = (id: number, title: string) => ({
  id,
  title,
  characterName: "Bo",
  prompt: "Puff drifts off toward the Mountain's Shoulder. Bo crosses three kite-bridges.",
});

describe("the world bible", () => {
  it("registers the default world under its own key", () => {
    expect(worldKeys.has(defaultWorld.key)).toBe(true);
    expect(getWorld(defaultWorld.key)).toBe(defaultWorld);
    expect(getWorld("no-such-world")).toBeNull();
    expect(getWorld(null)).toBeNull();
  });

  it("carries places, characters and rules into the book block", () => {
    const block = worldBlock(defaultWorld);
    for (const place of defaultWorld.places) expect(block).toContain(place.name);
    for (const character of defaultWorld.characters) expect(block).toContain(character.name);
    for (const rule of defaultWorld.rules) expect(block).toContain(rule);
  });

  it("never renders CJK script in a prompt block", () => {
    // Owner decision 2026-08-03: romanization only. `script` is stored, never shown.
    expect(CJK_RE.test(worldBlock(defaultWorld))).toBe(false);
    expect(CJK_RE.test(worldBrief(defaultWorld))).toBe(false);
  });
});

describe("the canon log", () => {
  it("round-trips appended lines and is created on first write", () => {
    expect(readCanon(defaultWorld.key)).toEqual([]);
    expect(appendCanon(defaultWorld.key, "first thing")).toBe(true);
    expect(appendCanon(defaultWorld.key, "second thing")).toBe(true);
    expect(readCanon(defaultWorld.key)).toEqual(["first thing", "second thing"]);
    expect(fs.existsSync(process.env.WORLD_CANON_PATH!)).toBe(true);
  });

  it("ignores a repeat of a line it already holds", () => {
    expect(appendCanon(defaultWorld.key, "the tea is never quite ready")).toBe(true);
    expect(appendCanon(defaultWorld.key, "the tea is never quite ready")).toBe(false);
    expect(appendCanon(defaultWorld.key, "  the tea is  never quite ready ")).toBe(false);
    expect(readCanon(defaultWorld.key)).toHaveLength(1);
  });

  it("keeps each world's lines in its own section", () => {
    appendCanon(defaultWorld.key, "ours");
    appendCanon("some-other-world", "theirs");
    appendCanon(defaultWorld.key, "ours again");
    expect(readCanon(defaultWorld.key)).toEqual(["ours", "ours again"]);
    expect(readCanon("some-other-world")).toEqual(["theirs"]);
  });

  it("caps how much canon rides into a prompt", () => {
    for (let i = 0; i < CANON_PROMPT_LINES + 5; i++) {
      appendCanon(defaultWorld.key, `canon line ${i}`);
    }
    const block = worldBlock(defaultWorld);
    expect(block).not.toContain("canon line 0");
    expect(block).toContain(`canon line ${CANON_PROMPT_LINES + 4}`);
    // The log itself keeps everything — only the prompt window is bounded.
    expect(readCanon(defaultWorld.key)).toHaveLength(CANON_PROMPT_LINES + 5);
  });

  it("builds a traceable one-line canon entry from a published story", () => {
    const line = canonLineFor(story(12, "Puff Goes Wandering"), new Date("2026-08-04T09:00:00Z"));
    expect(line).toBe(
      `[#12 2026-08-04] "Puff Goes Wandering": Bo — Puff drifts off toward the Mountain's Shoulder.`,
    );
    expect(line.split("\n")).toHaveLength(1);
  });

  it("falls back to a title placeholder and no character prefix", () => {
    const line = canonLineFor(
      { id: 3, title: null, characterName: null, prompt: "A village spends a week being fog" },
      new Date("2026-08-04T09:00:00Z"),
    );
    expect(line).toBe(`[#3 2026-08-04] "untitled": A village spends a week being fog`);
  });
});
