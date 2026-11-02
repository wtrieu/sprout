import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseLoadout, selectionFromLoadout } from "../loadout";
import { SpriteCanvas, SpriteFallback } from "./SpriteCanvas";
import { loadManifest } from "./manifest";
import { readManifest } from "./fsParts";

describe("SpriteCanvas", () => {
  it("renders the fallback before the manifest arrives (no canvas, sized to scale)", () => {
    const html = renderToStaticMarkup(<SpriteCanvas scale={3} label="Sam's character" />);
    expect(html).toContain('aria-label="Sam&#x27;s character"');
    expect(html).toContain("data-sprite-fallback");
    expect(html).not.toContain("<canvas");
    expect(html).toContain("width:96px");
    expect(html).toContain("height:120px");
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

  it("selects base parts, overridden only by parts the manifest knows", () => {
    const m = readManifest();
    const sel = selectionFromLoadout(
      m,
      parseLoadout(JSON.stringify({ frame: "frame-oak", sprite: { cape: "cape-scholar", hair: "no-such-part" } })),
    );
    expect(sel.parts).toEqual({
      body: "body-default",
      outfit: "outfit-tunic",
      hair: "hair-short",
      cape: "cape-scholar",
    });
    expect(parseLoadout("not json").sprite).toEqual({});
  });
});
