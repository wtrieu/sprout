import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CharacterCreator } from "./CharacterCreator";
import { LoadoutPicker } from "./Collection";
import { creatorSlots, defaultLook, lookBody, partLabel, toneGroups } from "./creator";
import { loadoutPatch, parseLoadout } from "./loadout";
import { readManifest } from "./sprite/fsParts";
import type { SpriteManifest } from "./sprite/manifest";
import { RENDERED_SPRITE_STYLE } from "@/lib/atlas/spriteStyle";

const m = readManifest(RENDERED_SPRITE_STYLE);
const loot = m.parts.filter((p) => p.grantedBy !== null).map((p) => p.id);

describe("creator choices from the manifest", () => {
  it("offers only slots with a real base-part choice, in layer order", () => {
    const slots = creatorSlots(m);
    expect(slots.map((s) => s.slot)).toEqual(["body", "hair"]);
    expect(slots[0].options.map((o) => o.id)).toEqual(["body-default", "body-girl"]);
    expect(slots[1].options.map((o) => o.id)).toEqual([
      "hair-crop",
      "hair-long",
      "hair-pigtails",
      "hair-curly",
      "hair-bob",
    ]);
  });

  it("never offers loot parts", () => {
    expect(loot.length).toBeGreaterThan(0);
    const offered = creatorSlots(m).flatMap((s) => s.options.map((o) => o.id));
    for (const id of loot) expect(offered).not.toContain(id);
    // A manifest whose only extra outfit is loot does not grow an outfit row.
    expect(creatorSlots(m).some((s) => s.slot === "outfit")).toBe(false);
  });

  it("follows the manifest, not a hardcoded list", () => {
    const more: SpriteManifest = {
      ...m,
      parts: [...m.parts, { id: "outfit-smock", slot: "outfit", animations: ["idle"], swap: [], grantedBy: null }],
    };
    expect(creatorSlots(more).map((s) => s.slot)).toEqual(["body", "outfit", "hair"]);
  });

  it("derives tone rows from swapGroups with base + shade swatches", () => {
    const groups = toneGroups(m);
    expect(groups.map((g) => [g.group, g.label])).toEqual([
      ["skin", "Skin tone"],
      ["hair", "Hair color"],
    ]);
    expect(groups[0].tones.map((t) => t.id)).toEqual(["default", "fair", "tan", "deep"]);
    expect(groups[1].tones.map((t) => t.id)).toEqual(["brown", "black", "red", "gold"]);
    expect(groups[0].tones[2]).toEqual({
      id: "tan",
      label: "Tan",
      base: m.swapGroups.skin.tones.tan[0],
      shade: m.swapGroups.skin.tones.tan[1],
    });
  });

  it("starts from the base selection and each group's first tone", () => {
    expect(defaultLook(m)).toEqual({
      sprite: { body: "body-default", hair: "hair-crop", outfit: "outfit-vest" },
      tones: { skin: "default", hair: "brown" },
    });
    expect(partLabel("hair-pigtails", "hair")).toBe("Pigtails");
  });

  it("posts base parts and known tones only", () => {
    const body = lookBody(m, {
      sprite: { body: "body-girl", hair: "hair-hood", outfit: "outfit-vest", item: "item-staff" },
      tones: { skin: "tan", hair: "plaid", eyes: "green" },
    });
    expect(body).toEqual({ sprite: { body: "body-girl", outfit: "outfit-vest" }, tones: { skin: "tan" } });
    const def = lookBody(m, { ...defaultLook(m), sprite: { ...defaultLook(m).sprite, hair: "hair-bob" } });
    expect(def.sprite).toEqual({ body: "body-default", hair: "hair-bob", outfit: "outfit-vest" });
  });
});

describe("CharacterCreator", () => {
  const personas = { a: { title: "Voice A", pitch: "pitch" }, b: { title: "Voice B", pitch: "pitch" } };

  it("renders the preview, part thumbnails and tone swatches from the manifest", () => {
    const html = renderToStaticMarkup(
      <CharacterCreator manifest={m} personas={personas} onCreate={() => {}} />,
    );
    expect(html).toContain("Create your character");
    expect(html).toContain("Your character&#x27;s character");
    for (const label of ["Body: Girl", "Hair: Pigtails", "Hair: Bob"]) expect(html).toContain(label);
    for (const label of ["Skin tone: Deep", "Hair color: Gold"]) expect(html).toContain(label);
    expect(html).not.toContain("Hood");
    expect(html).not.toContain("<select");
    expect(html).toContain("Voice A");
  });

  it("still offers name and voice when the art is missing", () => {
    const html = renderToStaticMarkup(
      <CharacterCreator manifest={null} personas={personas} onCreate={() => {}} />,
    );
    expect(html).toContain("Your name on the map");
    expect(html).not.toContain("Skin tone");
  });
});

describe("tones in the loadout", () => {
  it("loadoutPatch diffs tones: changed and new tones out, cleared ones as null", () => {
    const saved = parseLoadout({ sprite: { hair: "hair-long" }, tones: { skin: "tan", hair: "red" } });
    expect(loadoutPatch(saved, { ...saved, tones: { skin: "deep", hair: "red" } })).toEqual({
      tones: { skin: "deep" },
    });
    expect(loadoutPatch(saved, { ...saved, tones: { skin: "tan" } })).toEqual({ tones: { hair: null } });
    expect(loadoutPatch(saved, { ...saved, tones: { ...saved.tones } })).toEqual({});
    const bare = parseLoadout({ sprite: {} });
    expect(loadoutPatch(bare, { ...bare, tones: { hair: "gold" } })).toEqual({ tones: { hair: "gold" } });
    expect(loadoutPatch(bare, { sprite: { hair: "hair-bob" }, tones: { skin: "fair" } })).toEqual({
      sprite: { hair: "hair-bob" },
      tones: { skin: "fair" },
    });
  });

  it("the Look picker shows tone swatches marked from the saved tones", () => {
    const html = renderToStaticMarkup(
      <LoadoutPicker
        manifest={m}
        items={[]}
        loadout={parseLoadout({ sprite: {}, tones: { skin: "tan", hair: "black" } })}
        onSave={() => {}}
      />,
    );
    expect(html).toMatch(/aria-pressed="true" aria-label="Skin tone: Tan"/);
    expect(html).toMatch(/aria-pressed="true" aria-label="Hair color: Black"/);
    expect(html).toMatch(/aria-pressed="false" aria-label="Skin tone: Default"/);
  });
});
