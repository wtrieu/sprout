import { describe, expect, it } from "vitest";
import {
  appearanceHair,
  baseHairOf,
  equippedIn,
  initLook,
  lookCategories,
  lookReducer,
  ownedRefs,
  removeHeadwear,
  sameLook,
  savePatch,
  wearHeadwear,
  type Category,
  type CategoryId,
  type LookAction,
  type LookState,
} from "./look";
import { FRAME_ACCENTS, MAP_STYLE_ACCENTS, parseLoadout } from "./loadout";
import { readManifest } from "./sprite/fsParts";
import type { SpriteManifest } from "./sprite/manifest";
import { RENDERED_SPRITE_STYLE } from "@/lib/atlas/spriteStyle";

const m = readManifest(RENDERED_SPRITE_STYLE);
const own = (kind: string, ref: string, status = "owned") => ({ kind, ref, status });
const cat = (cats: Category[], id: CategoryId) => {
  const c = cats.find((x) => x.id === id);
  if (!c) throw new Error(`no ${id}`);
  return c;
};
const run = (s: LookState, ...actions: LookAction[]) => actions.reduce((st, a) => lookReducer(m, st, a), s);

describe("lookCategories", () => {
  it("lists prize categories in slot order; no cape or aura without parts", () => {
    expect(lookCategories(m, []).map((c) => c.id)).toEqual(["outfit", "item", "headwear", "frame", "mapStyle"]);
  });

  it("shows cape and aura once the manifest has prize parts for them", () => {
    const more: SpriteManifest = {
      ...m,
      parts: [
        ...m.parts,
        { id: "cape-scholar", slot: "cape", animations: ["idle"], swap: [], grantedBy: "loot" },
        { id: "aura-glow", slot: "aura-front", animations: ["idle"], swap: [], grantedBy: "loot" },
      ],
    };
    expect(lookCategories(more, []).map((c) => c.id)).toEqual([
      "outfit",
      "item",
      "headwear",
      "frame",
      "mapStyle",
      "cape",
      "aura",
    ]);
  });

  it("marks owned vs locked and counts prizes only", () => {
    const cats = lookCategories(m, [
      own("sprite_part", "outfit-vest-epic"),
      own("sprite_part", "hair-hood", "used"),
      own("frame", "frame-ivy"),
    ]);
    const outfit = cat(cats, "outfit");
    expect(outfit.tiles.map((t) => [t.id, t.owned])).toEqual([
      ["outfit-vest", true],
      ["outfit-vest-rare", false],
      ["outfit-vest-epic", true],
    ]);
    expect([outfit.found, outfit.total, outfit.canEmpty]).toEqual([1, 2, false]);
    // Headwear lists loot hair only; a non-owned status does not count.
    const hw = cat(cats, "headwear");
    expect(hw.tiles.map((t) => t.id)).toEqual(["hair-hood"]);
    expect([hw.found, hw.total, hw.canEmpty]).toEqual([0, 1, true]);
    const frame = cat(cats, "frame");
    expect(frame.tiles.map((t) => t.id)).toEqual(Object.keys(FRAME_ACCENTS));
    expect([frame.found, frame.total]).toEqual([1, 4]);
    expect(cat(cats, "mapStyle").total).toBe(Object.keys(MAP_STYLE_ACCENTS).length);
  });

  it("names tiles warmly, never with raw ids or tier words", () => {
    const tiles = lookCategories(m, []).flatMap((c) => c.tiles);
    const labels = tiles.map((t) => t.label);
    expect(labels).toContain("Vest");
    expect(labels).toContain("Wanderer's hood");
    expect(labels).toContain("Night map");
    for (const t of tiles) {
      expect(t.label).not.toMatch(/rare|epic/i);
      expect(t.label).not.toBe(t.id);
      expect(t.label).not.toBe(t.id.replace(/-/g, " "));
    }
  });

  it("keeps an owned frame the accent table does not know", () => {
    const frame = cat(lookCategories(m, [own("frame", "frame-cork")]), "frame");
    expect(frame.tiles.at(-1)).toMatchObject({ id: "frame-cork", label: "Cork", owned: true });
  });

  it("ownedRefs keeps only owned items of the kind", () => {
    expect([...ownedRefs([own("frame", "a"), own("frame", "b", "used"), own("map_style", "c")], "frame")]).toEqual([
      "a",
    ]);
  });
});

describe("equippedIn", () => {
  const cats = lookCategories(m, []);
  it("an unset outfit shows the base default; empty slots are null", () => {
    const look = parseLoadout({ sprite: {} });
    expect(equippedIn(m, cat(cats, "outfit"), look)).toBe("outfit-vest");
    expect(equippedIn(m, cat(cats, "item"), look)).toBeNull();
    expect(equippedIn(m, cat(cats, "headwear"), look)).toBeNull();
    expect(equippedIn(m, cat(cats, "frame"), look)).toBeNull();
  });
  it("base hair is not headwear; the hood is", () => {
    expect(equippedIn(m, cat(cats, "headwear"), parseLoadout({ sprite: { hair: "hair-bob" } }))).toBeNull();
    expect(equippedIn(m, cat(cats, "headwear"), parseLoadout({ sprite: { hair: "hair-hood" } }))).toBe(
      "hair-hood",
    );
  });
});

describe("headwear helper", () => {
  const saved = parseLoadout({ sprite: { hair: "hair-long" } });
  it("wearing remembers the covered hair; removing restores it", () => {
    const on = wearHeadwear(m, { look: parseLoadout({ sprite: { hair: "hair-bob" } }), hairUnderHeadwear: undefined }, "hair-hood");
    expect(on.look.sprite.hair).toBe("hair-hood");
    expect(on.hairUnderHeadwear).toBe("hair-bob");
    const off = removeHeadwear(m, on, saved);
    expect(off.look.sprite.hair).toBe("hair-bob");
    expect(off.hairUnderHeadwear).toBeUndefined();
  });
  it("falls back to the saved base hair, then the slot default", () => {
    const hooded = parseLoadout({ sprite: { hair: "hair-hood" } });
    expect(removeHeadwear(m, { look: hooded, hairUnderHeadwear: undefined }, saved).look.sprite.hair).toBe(
      "hair-long",
    );
    const off = removeHeadwear(m, { look: hooded, hairUnderHeadwear: undefined }, hooded);
    expect("hair" in off.look.sprite).toBe(false);
  });
  it("swapping headwear keeps the original hair memory", () => {
    const d = { look: parseLoadout({ sprite: { hair: "hair-hood" } }), hairUnderHeadwear: "hair-curly" };
    expect(wearHeadwear(m, d, "hair-hood").hairUnderHeadwear).toBe("hair-curly");
    expect(baseHairOf(m, "hair-hood")).toBeUndefined();
    expect(baseHairOf(m, "hair-bob")).toBe("hair-bob");
  });
});

describe("lookReducer", () => {
  const items = [
    own("sprite_part", "outfit-vest-epic"),
    own("sprite_part", "hair-hood"),
    own("sprite_part", "item-staff"),
    own("frame", "frame-oak"),
  ];
  const cats = lookCategories(m, items);
  const saved = parseLoadout({ sprite: { hair: "hair-pigtails" }, tones: { skin: "tan" } });
  const tap = (id: CategoryId, ref: string): LookAction => ({ type: "tap", category: cat(cats, id), id: ref });

  it("try-on edits the draft only; undo resets; save patches the difference", () => {
    const s = run(initLook(saved), tap("outfit", "outfit-vest-epic"), tap("frame", "frame-oak"));
    expect(s.saved).toBe(saved);
    expect(s.draft.sprite.outfit).toBe("outfit-vest-epic");
    expect(savePatch(s)).toEqual({ frame: "frame-oak", sprite: { outfit: "outfit-vest-epic" } });
    const undone = run(s, { type: "undo" });
    expect(sameLook(saved, undone.draft)).toBe(true);
    expect(savePatch(undone)).toBeNull();
  });

  it("locked tiles do nothing; the equipped outfit cannot be emptied", () => {
    const s0 = initLook(saved);
    expect(run(s0, tap("outfit", "outfit-vest-rare")).draft).toBe(saved);
    expect(run(s0, tap("outfit", "outfit-vest")).draft).toBe(saved);
  });

  it("tapping an equipped emptiable tile takes it off", () => {
    const s = run(initLook(saved), tap("item", "item-staff"), tap("frame", "frame-oak"));
    const off = run(s, tap("item", "item-staff"), tap("frame", "frame-oak"));
    expect(sameLook(saved, off.draft)).toBe(true);
  });

  it("headwear on and off returns to the hair underneath", () => {
    const on = run(initLook(saved), { type: "part", slot: "hair", id: "hair-bob" }, tap("headwear", "hair-hood"));
    expect(on.draft.sprite.hair).toBe("hair-hood");
    expect(appearanceHair(m, on)).toBe("hair-bob");
    expect(run(on, tap("headwear", "hair-hood")).draft.sprite.hair).toBe("hair-bob");
    // Picking a hairstyle in Appearance takes the headwear off.
    const picked = run(on, { type: "part", slot: "hair", id: "hair-curly" });
    expect(picked.draft.sprite.hair).toBe("hair-curly");
    expect(picked.hairUnderHeadwear).toBeUndefined();
  });

  it("tones, slot selection and the appearance toggle", () => {
    const s = run(initLook(saved), { type: "tone", group: "hair", tone: "gold" }, { type: "open", category: "item" });
    expect(s.draft.tones).toEqual({ skin: "tan", hair: "gold" });
    expect(savePatch(s)).toEqual({ tones: { hair: "gold" } });
    expect(s.open).toBe("item");
    expect(run(s, { type: "open", category: "item" }).open).toBeNull();
    expect(s.appearanceOpen).toBe(false);
    expect(run(s, { type: "toggleAppearance" }).appearanceOpen).toBe(true);
  });
});
