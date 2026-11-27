import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LookPanel } from "./LookPanel";
import { initLook, lookCategories, lookReducer, savePatch, type LookState } from "./look";
import { FRAME_ACCENTS, MAP_STYLE_ACCENTS, parseLoadout, type LoadoutPatch } from "./loadout";
import { readManifest } from "./sprite/fsParts";
import { RENDERED_SPRITE_STYLE } from "@/lib/atlas/spriteStyle";

const m = readManifest(RENDERED_SPRITE_STYLE);
const items = [
  { id: 1, kind: "sprite_part", ref: "outfit-vest-epic", status: "owned" },
  { id: 2, kind: "frame", ref: "frame-ivy", status: "owned" },
];
const saved = parseLoadout({ sprite: { body: "body-girl" }, tones: { skin: "tan", hair: "black" } });
const render = (initial?: Partial<Omit<LookState, "saved">>, onSave: (p: LoadoutPatch) => void = () => {}) =>
  renderToStaticMarkup(
    <LookPanel manifest={m} items={items} loadout={saved} onSave={onSave} initial={initial} />,
  );

describe("LookPanel", () => {
  it("opens on prize slots, with appearance collapsed", () => {
    const html = render();
    for (const label of ["Outfit", "Item", "Headwear", "Frame", "Map style"]) {
      expect(html).toContain(`tracking-wide text-neutral-500">${label}</span>`);
    }
    expect(html).not.toMatch(/>Cape<|>Aura</);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Change appearance");
    expect(html).not.toContain("Skin tone");
    expect(html).not.toContain("Body: Girl");
    expect(html).not.toContain('id="look-picker"');
    expect(html).not.toContain("<select");
    // Save and Undo wait for a change.
    expect(html).toMatch(/disabled=""[^>]*>Save look/);
    expect(html).toMatch(/disabled=""[^>]*>Undo changes/);
  });

  it("a selected slot shows its grid, unfound items as locked silhouettes", () => {
    const html = render({ open: "outfit" });
    const grid = html.slice(html.indexOf('id="look-picker"'));
    expect(grid).toContain("1 of 2 found");
    expect(grid).toContain("Ember-stitch vest");
    expect(grid).not.toContain("Starlit vest");
    expect(grid).toContain('aria-disabled="true" aria-label="Not found yet"');
    expect(grid).toContain("???");
    expect(grid).toContain("border-dashed");
    // The base vest is on (default), with a text badge, not colour alone.
    expect(grid).toMatch(/aria-pressed="true"[^>]*>.*?On<\/span>.*?Vest</);
    expect(html).not.toMatch(/rare|epic</i);
  });

  it("frames grid shows swatches; locked ones darkened", () => {
    const html = render({ open: "frame" });
    const grid = html.slice(html.indexOf('id="look-picker"'));
    expect(grid).toContain("1 of 4 found");
    expect(grid).toContain(FRAME_ACCENTS["frame-ivy"]);
    expect(grid).toContain("Ivy frame");
    expect(grid).not.toContain("Brass frame");
    expect(grid).toContain("grayscale");
  });

  it("try-on updates the draft preview and Save sends the patch", () => {
    const cats = lookCategories(m, items);
    let s = initLook(saved);
    for (const [cid, id] of [
      ["outfit", "outfit-vest-epic"],
      ["frame", "frame-ivy"],
    ] as const) {
      s = lookReducer(m, s, { type: "tap", category: cats.find((c) => c.id === cid)!, id });
    }
    expect(savePatch(s)).toEqual({ frame: "frame-ivy", sprite: { outfit: "outfit-vest-epic" } });
    const html = render({ draft: s.draft, open: "outfit" });
    const preview = html.slice(html.indexOf('data-testid="look-preview"'));
    expect(preview).toContain(FRAME_ACCENTS["frame-ivy"]);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?On<\/span>.*?Ember-stitch vest/);
    expect(html).not.toMatch(/disabled=""[^>]*>Save look/);
    expect(html).toContain("Trying it on, not saved yet.");
    // The slot button now names what is on.
    expect(html).toContain("Ivy frame");
  });

  it("the appearance menu opens with body, hair and tones marked from the draft", () => {
    const html = render({ appearanceOpen: true });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toMatch(/aria-pressed="true" aria-label="Skin tone: Tan"/);
    expect(html).toMatch(/aria-pressed="true" aria-label="Hair color: Black"/);
    expect(html).toMatch(/aria-pressed="false" aria-label="Skin tone: Default"/);
    expect(html).toMatch(/aria-pressed="true" title="Girl"/);
    expect(html).toContain("Hair: Bob");
    // Appearance lists base hair only; the hood is headwear.
    expect(html).not.toContain("Hair: Hood");
    // Editing a tone from the menu lands in the same draft Save sends.
    const s = lookReducer(m, initLook(saved, { appearanceOpen: true }), {
      type: "tone",
      group: "skin",
      tone: "deep",
    });
    expect(savePatch(s)).toEqual({ tones: { skin: "deep" } });
    expect(render({ appearanceOpen: true, draft: s.draft })).toMatch(
      /aria-pressed="true" aria-label="Skin tone: Deep"/,
    );
  });

  it("an unframed, plain look previews with neither accent", () => {
    const html = renderToStaticMarkup(
      <LookPanel manifest={m} items={[]} loadout={parseLoadout({ sprite: {} })} onSave={() => {}} />,
    );
    for (const c of [...Object.values(FRAME_ACCENTS), ...Object.values(MAP_STYLE_ACCENTS)]) {
      expect(html).not.toContain(c);
    }
  });

  it("the preview wears the saved frame over the saved map style", () => {
    const html = renderToStaticMarkup(
      <LookPanel
        manifest={m}
        items={[
          { id: 1, kind: "frame", ref: "frame-ivy", status: "owned" },
          { id: 2, kind: "map_style", ref: "style-botanical", status: "owned" },
        ]}
        loadout={parseLoadout({ frame: "frame-ivy", mapStyle: "style-botanical", sprite: {} })}
        onSave={() => {}}
      />,
    );
    const preview = html.slice(html.indexOf('data-testid="look-preview"'));
    expect(preview).toContain(MAP_STYLE_ACCENTS["style-botanical"]);
    expect(preview).toContain(FRAME_ACCENTS["frame-ivy"]);
  });
});
