import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  extractHtmlTitle,
  normalizeTitle,
  titleSimilarity,
  verifyReading,
  verifyReadings,
  type FetchLike,
} from "./verify";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const html = (title: string, status = 200) =>
  new Response(`<html><head><title>${title}</title></head><body>…</body></html>`, {
    status,
    headers: { "content-type": "text/html" },
  });

/** Route by URL prefix; anything unmatched is a 404. Records every call. */
const fakeFetch = (routes: Record<string, (url: string) => Response>) => {
  const calls: string[] = [];
  const impl: FetchLike = async (url) => {
    calls.push(url);
    for (const [prefix, make] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return make(url);
    }
    return new Response("nope", { status: 404 });
  };
  return { impl, calls };
};

const WIKI = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const OL = "https://openlibrary.org/search.json";

describe("normalizeTitle / titleSimilarity", () => {
  it("strips diacritics, parentheticals, site suffixes, punctuation and stopwords", () => {
    expect(normalizeTitle("Stoicism - Wikipedia")).toBe("stoicism");
    expect(normalizeTitle("Stoicism (Stanford Encyclopedia of Philosophy)")).toBe("stoicism");
    expect(normalizeTitle("Søren Kierkegaard")).toBe("soren kierkegaard");
    expect(normalizeTitle("The Meditations of Marcus Aurelius")).toBe("meditations marcus aurelius");
  });

  it("scores equal titles 1, unrelated titles 0, and tolerates stems", () => {
    expect(titleSimilarity("Stoicism", "Stoicism – Wikipedia")).toBe(1);
    expect(titleSimilarity("Stoicism", "Quantum chromodynamics")).toBe(0);
    expect(titleSimilarity("Stoics", "Stoicism")).toBe(1);
    expect(titleSimilarity("Meditations", "Meditations (Marcus Aurelius)")).toBe(1);
    expect(titleSimilarity("Plato", "Platonism")).toBe(1);
  });
});

describe("verifyReading: wikipedia", () => {
  it("accepts a matching summary, keeps the canonical url and a one-sentence snippet", async () => {
    const { impl } = fakeFetch({
      [WIKI]: () =>
        json({
          type: "standard",
          title: "Stoicism",
          extract: "Stoicism is a school of Hellenistic philosophy. It was founded by Zeno.",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Stoicism" } },
        }),
    });
    const out = await verifyReading({ kind: "wikipedia", title: "Stoics", why: "the overview" }, impl);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.reading).toMatchObject({
      kind: "wikipedia",
      title: "Stoicism",
      url: "https://en.wikipedia.org/wiki/Stoicism",
      verifiedVia: "wikipedia_summary",
      why: "the overview",
      snippet: "Stoicism is a school of Hellenistic philosophy.",
    });
  });

  it("rejects 404s, disambiguation pages, and title mismatches with a reason", async () => {
    const missing = fakeFetch({});
    expect(await verifyReading({ kind: "wikipedia", title: "Nope" }, missing.impl)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("404"),
    });

    const disambig = fakeFetch({ [WIKI]: () => json({ type: "disambiguation", title: "Mercury" }) });
    expect(await verifyReading({ kind: "wikipedia", title: "Mercury" }, disambig.impl)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("disambiguation"),
    });

    const wrong = fakeFetch({
      [WIKI]: () =>
        json({
          type: "standard",
          title: "Cheese",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Cheese" } },
        }),
    });
    expect(await verifyReading({ kind: "wikipedia", title: "Epicureanism" }, wrong.impl)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("mismatch"),
    });
  });
});

describe("verifyReading: book", () => {
  const docs = [
    { key: "/works/OL1W", title: "Meditations", author_name: ["Marcus Aurelius"] },
    { key: "/works/OL2W", title: "Meditations on First Philosophy", author_name: ["René Descartes"] },
  ];

  it("matches on title similarity and the author's surname", async () => {
    const { impl, calls } = fakeFetch({ [OL]: () => json({ docs }) });
    const out = await verifyReading(
      { kind: "book", title: "Meditations", author: "Marcus Aurelius" },
      impl,
    );
    expect(out).toMatchObject({
      ok: true,
      reading: { kind: "book", url: "https://openlibrary.org/works/OL1W", verifiedVia: "openlibrary" },
    });
    expect(calls[0]).toContain("author=Marcus+Aurelius");
  });

  it("skips candidates whose author does not match, and rejects when none do", async () => {
    const { impl } = fakeFetch({ [OL]: () => json({ docs }) });
    const descartes = await verifyReading(
      { kind: "book", title: "Meditations on First Philosophy", author: "Descartes" },
      impl,
    );
    expect(descartes).toMatchObject({
      ok: true,
      reading: { url: "https://openlibrary.org/works/OL2W" },
    });
    const nobody = await verifyReading({ kind: "book", title: "Meditations", author: "Kant" }, impl);
    expect(nobody).toMatchObject({ ok: false, reason: expect.stringContaining("no open library match") });
  });
});

describe("extractHtmlTitle", () => {
  it("prefers og:title in either attribute order, else falls back to <title>", () => {
    expect(
      extractHtmlTitle(
        `<head><meta property="og:title" content="Stoicism (SEP)"><title>ignored</title></head>`,
      ),
    ).toBe("Stoicism (SEP)");
    expect(
      extractHtmlTitle(`<head><meta content='Epicurus' property='og:title'/></head>`),
    ).toBe("Epicurus");
    expect(extractHtmlTitle(`<head><meta name="description" content="x"><title>\n  Plain\n  Title </title></head>`)).toBe(
      "Plain Title",
    );
    expect(extractHtmlTitle(`<p>no head</p>`)).toBeNull();
  });

  it("stays fast on hostile input", () => {
    const hostile = `<meta ${"a ".repeat(50_000)}`; // never closes
    const started = Date.now();
    expect(extractHtmlTitle(hostile)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("tolerates whitespace in closing tags and ignores an unclosed title", () => {
    expect(extractHtmlTitle(`<TITLE lang="en">Caps</TITLE >`)).toBe("Caps");
    expect(extractHtmlTitle(`<title>never closed`)).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("decodes the common entities in one pass and never double-unescapes", () => {
    expect(decodeEntities("A &amp; B &quot;C&quot; D&#39;s &ndash; E")).toBe(`A & B "C" D's – E`);
    expect(decodeEntities("&amp;quot;")).toBe("&quot;");
    expect(decodeEntities("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });
});

describe("verifyReading: web", () => {
  it("accepts a page whose title matches, stripping tracking params", async () => {
    const { impl } = fakeFetch({
      "https://plato.stanford.edu/": () => html("Stoicism (Stanford Encyclopedia of Philosophy)"),
    });
    const out = await verifyReading(
      {
        kind: "web",
        title: "Stoicism",
        url: "https://plato.stanford.edu/entries/stoicism/?utm_source=x",
      },
      impl,
    );
    expect(out).toMatchObject({
      ok: true,
      reading: { url: "https://plato.stanford.edu/entries/stoicism/", verifiedVia: "url_title" },
    });
  });

  it("rejects http, disallowed hosts, missing urls, and title mismatches", async () => {
    const { impl, calls } = fakeFetch({ "https://": () => html("Totally Different Page") });
    expect(await verifyReading({ kind: "web", title: "X", url: "http://example.com" }, impl)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("https"),
    });
    expect(await verifyReading({ kind: "web", title: "X", url: "https://127.0.0.1/x" }, impl)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("host"),
    });
    expect(await verifyReading({ kind: "web", title: "X" }, impl)).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
    expect(
      await verifyReading({ kind: "web", title: "Stoicism", url: "https://example.com/a" }, impl),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("mismatch") });
  });
});

describe("verifyReadings", () => {
  it("keeps order, dedupes by canonical url, and files every rejection with a reason", async () => {
    const { impl } = fakeFetch({
      [WIKI]: () =>
        json({
          type: "standard",
          title: "Stoicism",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Stoicism" } },
        }),
    });
    const { verified, rejected } = await verifyReadings(
      [
        { kind: "wikipedia", title: "Stoicism" },
        { kind: "wikipedia", title: "Stoics" },
        { kind: "web", title: "Nope", url: "http://nope" },
      ],
      impl,
      { gapMs: 0 },
    );
    expect(verified.map((v) => v.url)).toEqual(["https://en.wikipedia.org/wiki/Stoicism"]);
    expect(rejected.map((r) => r.reason)).toEqual([
      "duplicate of an already verified reading",
      expect.stringContaining("https"),
    ]);
  });
});
