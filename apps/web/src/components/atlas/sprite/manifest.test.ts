import { describe, expect, it } from "vitest";
import { readManifest } from "./fsParts";
import { SLOT_ORDER, SpriteManifestSchema, defaultSelection } from "./manifest";

const BASE = ["body-default", "outfit-tunic", "hair-short"];
const LOOT = ["cape-scholar", "item-lantern", "hair-laurel", "aura-spark"];

describe("sprite manifest", () => {
  const m = readManifest();

  it("matches the agreed format", () => {
    expect(m.canvas).toEqual({ width: 32, height: 40 });
    expect(m.palette.length).toBeLessThanOrEqual(32);
    expect(m.animations.idle.frames).toBe(2);
    expect(m.animations.celebrate.frames).toBe(4);
    const byZ = [...m.slots].sort((a, b) => a.z - b.z).map((s) => s.id);
    expect(byZ).toEqual([...SLOT_ORDER]);
  });

  it("lists exactly the agreed part ids, base parts always available", () => {
    expect(m.parts.map((p) => p.id).sort()).toEqual([...BASE, ...LOOT].sort());
    for (const id of BASE) expect(m.parts.find((p) => p.id === id)?.grantedBy).toBeNull();
    for (const id of LOOT) expect(m.parts.find((p) => p.id === id)?.grantedBy).toBe("loot");
    const body = m.parts.find((p) => p.id === "body-default")!;
    expect(body.animations).toEqual(["idle", "celebrate"]);
    expect(defaultSelection(m)).toEqual({
      body: "body-default",
      outfit: "outfit-tunic",
      hair: "hair-short",
    });
  });

  it("registers the cosmetic frame and map-style ids", () => {
    expect(m.cosmetics.frames).toEqual(["frame-oak", "frame-brass", "frame-ivy", "frame-stellar"]);
    expect(m.cosmetics.mapStyles).toEqual(["style-parchment", "style-night", "style-botanical"]);
  });

  it("rejects malformed manifests", () => {
    expect(SpriteManifestSchema.safeParse({}).success).toBe(false);
    const tooManyColors = { ...m, palette: Array.from({ length: 33 }, () => m.palette[0]) };
    expect(SpriteManifestSchema.safeParse(tooManyColors).success).toBe(false);
    const noIdle = { ...m, parts: [{ ...m.parts[0], animations: ["celebrate"] }] };
    expect(SpriteManifestSchema.safeParse(noIdle).success).toBe(false);
    const badSwap = { ...m, parts: [{ ...m.parts[0], swap: ["nope"] }] };
    expect(SpriteManifestSchema.safeParse(badSwap).success).toBe(false);
  });
});
