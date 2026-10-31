import { describe, expect, it } from "vitest";
import type { FetchLike } from "./verify";
import { IMAGE_THRESHOLD, verifyImages } from "./verifyImages";
import type { ImageProposal } from "./visuals";

const proposal = (slug: string, query: string): ImageProposal => ({
  slug,
  query,
  caption: `${query} — why it is here.`,
  why: null,
});

const MEDIA_LIST = {
  items: [
    { title: "File:Zeno of Citium - bust.jpg", type: "image", caption: { text: "Bust of Zeno" } },
    { title: "File:Commons-logo.svg", type: "image" }, // svg: never a real picture
    { title: "File:Edit icon.png", type: "image" }, // interface junk
    { title: "File:Stoa Poikile reconstruction.jpg", type: "video" }, // wrong type
  ],
};

const info = (over: Record<string, unknown> = {}) => ({
  query: {
    pages: [
      {
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/zeno.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Zeno.jpg",
            thumburl: "https://upload.wikimedia.org/thumb/zeno-640.jpg",
            width: 2000,
            height: 1500,
            extmetadata: {
              Artist: { value: '<a href="https://example.org">Paolo Monti</a>' },
              LicenseShortName: { value: "CC BY-SA 4.0" },
            },
            ...over,
          },
        ],
      },
    ],
  },
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Routes on URL shape; records every URL so tests can assert what ran. */
const fakeFetch = (routes: Array<[match: string, body: unknown | Error]>) => {
  const calls: string[] = [];
  const impl: FetchLike = async (url) => {
    calls.push(url);
    for (const [match, body] of routes) {
      if (url.includes(match)) {
        if (body instanceof Error) throw body;
        return json(body);
      }
    }
    return new Response("nope", { status: 404 });
  };
  return { impl, calls };
};

describe("verifyImages", () => {
  it("resolves from the verified article's media list first, with attribution stripped of HTML", async () => {
    const net = fakeFetch([
      ["page/media-list/Stoicism", MEDIA_LIST],
      ["prop=imageinfo", info()],
    ]);
    const { verified, rejected } = await verifyImages(
      [proposal("zeno-bust", "Zeno of Citium bust")],
      { wikipediaTitle: "Stoicism" },
      net.impl,
      { gapMs: 0 },
    );
    expect(rejected).toEqual([]);
    expect(verified).toHaveLength(1);
    expect(verified[0]).toMatchObject({
      slug: "zeno-bust",
      fileTitle: "File:Zeno of Citium - bust.jpg",
      verifiedVia: "article_media",
      thumbUrl: "https://upload.wikimedia.org/thumb/zeno-640.jpg",
      author: "Paolo Monti",
      license: "CC BY-SA 4.0",
      width: 2000,
      height: 1500,
    });
    // The article satisfied the query: no Commons search ran.
    expect(net.calls.some((u) => u.includes("list=search"))).toBe(false);
  });

  it("falls back to a Commons search when there is no article or no match", async () => {
    const net = fakeFetch([
      ["list=search", { query: { search: [{ title: "File:Parthenon from west.jpg" }] } }],
      ["prop=imageinfo", info()],
    ]);
    const { verified } = await verifyImages(
      [proposal("parthenon", "Parthenon Athens")],
      { wikipediaTitle: null },
      net.impl,
      { gapMs: 0 },
    );
    expect(verified).toHaveLength(1);
    expect(verified[0].verifiedVia).toBe("commons_search");
    expect(verified[0].fileTitle).toBe("File:Parthenon from west.jpg");
  });

  it("rejects below the threshold, naming the best candidate and its score", async () => {
    const net = fakeFetch([
      ["list=search", { query: { search: [{ title: "File:Unrelated harbour scene.jpg" }] } }],
    ]);
    const { verified, rejected } = await verifyImages(
      [proposal("zeno-bust", "Zeno of Citium bust")],
      {},
      net.impl,
      { gapMs: 0 },
    );
    expect(verified).toEqual([]);
    expect(rejected[0].reason).toMatch(/best match below threshold \("File:Unrelated harbour scene\.jpg", 0\.00\)/);
  });

  it("rejects when nothing bitmap comes back at all", async () => {
    const net = fakeFetch([["list=search", { query: { search: [{ title: "File:Only vector.svg" }] } }]]);
    const { rejected } = await verifyImages([proposal("x", "anything at all")], {}, net.impl, { gapMs: 0 });
    expect(rejected[0].reason).toBe('no commons candidates for "anything at all"');
  });

  it("rejects icons and thumbnails by size", async () => {
    const net = fakeFetch([
      ["list=search", { query: { search: [{ title: "File:Zeno of Citium tiny.jpg" }] } }],
      ["prop=imageinfo", info({ width: 300, height: 900 })],
    ]);
    const { rejected } = await verifyImages([proposal("zeno", "Zeno of Citium")], {}, net.impl, {
      gapMs: 0,
    });
    expect(rejected[0].reason).toBe("image too small (300×900)");
  });

  it("rejects a file the imageinfo lookup cannot find", async () => {
    const net = fakeFetch([
      ["list=search", { query: { search: [{ title: "File:Zeno of Citium ghost.jpg" }] } }],
      ["prop=imageinfo", { query: { pages: [{ missing: true }] } }],
    ]);
    const { rejected } = await verifyImages([proposal("zeno", "Zeno of Citium")], {}, net.impl, {
      gapMs: 0,
    });
    expect(rejected[0].reason).toBe('"File:Zeno of Citium ghost.jpg" not found on wikimedia commons');
  });

  it("stores a fetch failure as the reject reason instead of throwing", async () => {
    const net = fakeFetch([["list=search", new Error("socket hung up")]]);
    const { rejected } = await verifyImages([proposal("zeno", "Zeno of Citium")], {}, net.impl, {
      gapMs: 0,
    });
    expect(rejected[0].reason).toBe("fetch failed: socket hung up");
  });

  it("dedupes two proposals that resolve to the same file", async () => {
    const net = fakeFetch([
      ["list=search", { query: { search: [{ title: "File:Zeno of Citium - bust.jpg" }] } }],
      ["prop=imageinfo", info()],
    ]);
    const { verified, rejected } = await verifyImages(
      [proposal("zeno-a", "Zeno of Citium bust"), proposal("zeno-b", "bust of Zeno of Citium")],
      {},
      net.impl,
      { gapMs: 0 },
    );
    expect(verified).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ slug: "zeno-b", reason: "duplicate of an already verified image" });
  });

  it("survives a broken media list by falling back to search", async () => {
    const net = fakeFetch([
      // media-list route missing → 404 → no article candidates
      ["list=search", { query: { search: [{ title: "File:Zeno of Citium - bust.jpg" }] } }],
      ["prop=imageinfo", info()],
    ]);
    const { verified } = await verifyImages(
      [proposal("zeno", "Zeno of Citium bust")],
      { wikipediaTitle: "Stoicism" },
      net.impl,
      { gapMs: 0 },
    );
    expect(verified).toHaveLength(1);
    expect(verified[0].verifiedVia).toBe("commons_search");
  });

  it("exposes the tunable threshold", () => {
    expect(IMAGE_THRESHOLD).toBeGreaterThan(0);
    expect(IMAGE_THRESHOLD).toBeLessThan(1);
  });
});
