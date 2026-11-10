import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseLoadout, selectionFromLoadout } from "../loadout";
import { DEFAULT_SPRITE_STYLE, SpriteCanvas, SpriteFallback } from "./SpriteCanvas";
import { loadManifest } from "./manifest";
import { readManifest } from "./fsParts";
import { RENDERED_SPRITE_STYLE } from "@/lib/atlas/spriteStyle";

describe("SpriteCanvas", () => {
  it("renders the fallback before the manifest arrives (no canvas, sized to scale)", () => {
    const html = renderToStaticMarkup(<SpriteCanvas scale={3} label="Sam's character" />);
    expect(html).toContain('aria-label="Sam&#x27;s character"');
    expect(html).toContain("data-sprite-fallback");
    expect(html).not.toContain("<canvas");
    expect(html).toContain("width:192px");
    expect(html).toContain("height:192px");
  });

  it("marks the fallback as missing when art is unavailable", () => {
    const html = renderToStaticMarkup(<SpriteFallback scale={1} label="x" missing />);
    expect(html).toContain('data-sprite-fallback="missing"');
    expect(html).toContain("Character art unavailable");
  });

  it("loadManifest returns null on a 404 or malformed manifest", async () => {
    const notFound = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    expect(await loadManifest("classic", notFound)).toBeNull();
    const junk = (async () => new Response(JSON.stringify({ hi: 1 }))) as typeof fetch;
    expect(await loadManifest("classic", junk)).toBeNull();
    const boom = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await loadManifest("classic", boom)).toBeNull();
  });

  it("selects base parts, overridden only by parts the manifest knows (rendered style)", () => {
    const m = readManifest(RENDERED_SPRITE_STYLE);
    const sel = selectionFromLoadout(
      m,
      parseLoadout(
        JSON.stringify({ frame: "frame-oak", sprite: { item: "item-staff", hair: "no-such-part", cape: "cape-scholar" } }),
      ),
    );
    // Unknown ids (a stale classic cape, a bogus hair) fall back to the base look.
    expect(sel.parts).toEqual({ body: "body-default", outfit: "outfit-vest", hair: "hair-crop", item: "item-staff" });
    expect(parseLoadout("not json").sprite).toEqual({});
  });

  it("still degrades a classic loadout to base parts on the classic manifest", () => {
    const m = readManifest("classic");
    const sel = selectionFromLoadout(m, parseLoadout({ sprite: { cape: "cape-scholar", hair: "nope" } }));
    expect(sel.parts).toEqual({ body: "body-default", outfit: "outfit-tunic", hair: "hair-short", cape: "cape-scholar" });
  });

  it("carries the loadout's tones into the selection; an explicit tones argument wins", () => {
    const m = readManifest(RENDERED_SPRITE_STYLE);
    const lo = parseLoadout(JSON.stringify({ sprite: {}, tones: { skin: "tan", hair: "black", junk: 3 } }));
    expect(lo.tones).toEqual({ skin: "tan", hair: "black" });
    expect(selectionFromLoadout(m, lo).tones).toEqual({ skin: "tan", hair: "black" });
    expect(selectionFromLoadout(m, lo, { skin: "deep" }).tones).toEqual({ skin: "deep" });
    expect(parseLoadout({ sprite: {} }).tones).toBeUndefined();
  });

  it("defaults to the rendered style", () => {
    expect(DEFAULT_SPRITE_STYLE).toBe(RENDERED_SPRITE_STYLE);
  });

  it("renders a toned loadout's fallback without throwing", () => {
    const html = renderToStaticMarkup(
      <SpriteCanvas loadout={{ sprite: {}, tones: { skin: "deep" } }} label="Preview" />,
    );
    expect(html).toContain('aria-label="Preview"');
  });
});
