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
  tileLook,
  wearHeadwear,
  type Category,
  type CategoryId,
  type LookAction,
  type LookState,
} from "./look";
import { FRAME_ACCENTS, MAP_STYLE_ACCENTS, loadoutPatch, parseLoadout, selectionFromLoadout } from "./loadout";
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
    // Owned first (manifest order within), locked silhouettes after.
    expect(outfit.tiles.map((t) => [t.id, t.owned])).toEqual([
      ["outfit-vest", true],
      ["outfit-vest-epic", true],
      ["outfit-vest-rare", false],
    ]);
    expect([outfit.found, outfit.total, outfit.canEmpty]).toEqual([1, 2, false]);
    // Headwear lists loot hair only; a non-owned status does not count.
    const hw = cat(cats, "headwear");
    expect(hw.tiles.map((t) => t.id)).toEqual(["hair-hood"]);
    expect([hw.found, hw.total, hw.canEmpty]).toEqual([0, 1, true]);
    const frame = cat(cats, "frame");
    expect(frame.tiles.map((t) => t.id)).toEqual([
      "frame-ivy",
      ...Object.keys(FRAME_ACCENTS).filter((f) => f !== "frame-ivy"),
    ]);
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
    expect(frame.tiles[0]).toMatchObject({ id: "frame-cork", label: "Cork", owned: true });
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

describe("tileLook (thumbnails)", () => {
  const cats = lookCategories(m, []);
  const mine = parseLoadout({
    sprite: { body: "body-girl", hair: "hair-curly", item: "item-staff" },
    tones: { skin: "deep", hair: "red" },
  });
  it("composes on the player's own body, tones and parts, swapping only that slot", () => {
    const outfit = cat(cats, "outfit").tiles.find((t) => t.id === "outfit-vest-epic")!;
    expect(tileLook(mine, cat(cats, "outfit"), outfit)).toEqual({
      sprite: { body: "body-girl", hair: "hair-curly", item: "item-staff", outfit: "outfit-vest-epic" },
      tones: { skin: "deep", hair: "red" },
    });
    const hood = cat(cats, "headwear").tiles[0];
    expect(selectionFromLoadout(m, tileLook(mine, cat(cats, "headwear"), hood)).parts).toMatchObject({
      body: "body-girl",
      hair: "hair-hood",
      item: "item-staff",
    });
  });
});

describe("loadoutPatch carries hairUnder", () => {
  it("diffs hairUnder: new value out, removed as null, unchanged omitted", () => {
    const a = parseLoadout({ sprite: {} });
    const b = parseLoadout({ sprite: {}, hairUnder: "hair-bob" });
    expect(loadoutPatch(a, b)).toEqual({ hairUnder: "hair-bob" });
    expect(loadoutPatch(b, a)).toEqual({ hairUnder: null });
    expect(loadoutPatch(b, { ...b })).toEqual({});
  });
});

describe("headwear helper", () => {
  const saved = parseLoadout({ sprite: { hair: "hair-long" } });
  it("wearing records the covered hair in hairUnder; removing restores and clears it", () => {
    const on = wearHeadwear(m, parseLoadout({ sprite: { hair: "hair-bob" } }), "hair-hood");
    expect(on).toEqual({ sprite: { hair: "hair-hood" }, hairUnder: "hair-bob" });
    const off = removeHeadwear(m, on, saved);
    expect(off).toEqual({ sprite: { hair: "hair-bob" } });
    expect("hairUnder" in off).toBe(false);
  });
  it("falls back to the saved base hair, then the slot default", () => {
    const hooded = parseLoadout({ sprite: { hair: "hair-hood" } });
    expect(removeHeadwear(m, hooded, saved).sprite.hair).toBe("hair-long");
    expect("hair" in removeHeadwear(m, hooded, hooded).sprite).toBe(false);
  });
  it("swapping headwear keeps the original memory; only base hair is remembered", () => {
    const d = parseLoadout({ sprite: { hair: "hair-hood" }, hairUnder: "hair-curly" });
    expect(wearHeadwear(m, d, "hair-hood").hairUnder).toBe("hair-curly");
    // Headwear over headwear with no memory: nothing non-base gets recorded.
    expect("hairUnder" in wearHeadwear(m, parseLoadout({ sprite: { hair: "hair-hood" } }), "hair-hood")).toBe(
      false,
    );
    expect(baseHairOf(m, "hair-hood")).toBeUndefined();
    expect(baseHairOf(m, "hair-bob")).toBe("hair-bob");
  });
  it("hairUnder is data only: never rendered, never sent by the creator", () => {
    const look = parseLoadout({ sprite: { hair: "hair-hood" }, hairUnder: "hair-bob" });
    expect(look.hairUnder).toBe("hair-bob");
    expect(selectionFromLoadout(m, look).parts.hair).toBe("hair-hood");
    expect(Object.values(selectionFromLoadout(m, look).parts)).not.toContain("hair-bob");
    expect(parseLoadout({ sprite: {}, hairUnder: 7 }).hairUnder).toBeUndefined();
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
    expect(savePatch(m, s)).toEqual({ frame: "frame-oak", sprite: { outfit: "outfit-vest-epic" } });
    const undone = run(s, { type: "undo" });
    expect(sameLook(saved, undone.draft)).toBe(true);
    expect(savePatch(m, undone)).toBeNull();
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
    expect(on.draft.hairUnder).toBe("hair-bob");
    expect(appearanceHair(m, on)).toBe("hair-bob");
    expect(run(on, tap("headwear", "hair-hood")).draft.sprite.hair).toBe("hair-bob");
    // Picking a hairstyle in Appearance takes the headwear off and forgets the memory.
    const picked = run(on, { type: "part", slot: "hair", id: "hair-curly" });
    expect(picked.draft.sprite.hair).toBe("hair-curly");
    expect("hairUnder" in picked.draft).toBe(false);
  });

  it("the hair under headwear survives a save and a fresh panel", () => {
    // Session 1: hood on over pigtails, save.
    const first = run(initLook(saved), tap("headwear", "hair-hood"));
    const patch = savePatch(m, first);
    expect(patch).toEqual({ sprite: { hair: "hair-hood" }, hairUnder: "hair-pigtails" });
    // The server applies the patch; the page remounts the panel from the stored loadout.
    const stored = parseLoadout(JSON.stringify({ ...saved, sprite: { hair: "hair-hood" }, hairUnder: "hair-pigtails" }));
    // Session 2: take the hood off.
    const later = run(initLook(stored), tap("headwear", "hair-hood"));
    expect(later.draft.sprite.hair).toBe("hair-pigtails");
    expect(savePatch(m, later)).toEqual({ sprite: { hair: "hair-pigtails" }, hairUnder: null });
  });

  it("never sends a hairUnder that is not a base hair", () => {
    const bad = initLook(saved, { draft: { ...saved, sprite: { hair: "hair-hood" }, hairUnder: "hair-hood" } });
    expect(savePatch(m, bad)).toEqual({ sprite: { hair: "hair-hood" } });
    // A stale non-base memory in the saved look does not light Save, and
    // clears with the next real change rather than being echoed.
    const stale = parseLoadout({ sprite: { hair: "hair-hood" }, hairUnder: "outfit-vest" });
    expect(savePatch(m, initLook(stale))).toBeNull();
    expect(savePatch(m, run(initLook(stale), { type: "tone", group: "skin", tone: "deep" }))).toEqual({
      tones: { skin: "deep" },
      hairUnder: null,
    });
  });

  it("tones, slot selection and the appearance toggle", () => {
    const s = run(initLook(saved), { type: "tone", group: "hair", tone: "gold" }, { type: "open", category: "item" });
    expect(s.draft.tones).toEqual({ skin: "tan", hair: "gold" });
    expect(savePatch(m, s)).toEqual({ tones: { hair: "gold" } });
    expect(s.open).toBe("item");
    expect(run(s, { type: "open", category: "item" }).open).toBeNull();
    expect(s.appearanceOpen).toBe(false);
    expect(run(s, { type: "toggleAppearance" }).appearanceOpen).toBe(true);
  });
});
