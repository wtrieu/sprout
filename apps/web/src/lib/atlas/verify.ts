/**
 * Reading verification — deterministic, keyless, injectable fetch.
 *
 * The model proposes readings; nothing it proposes is shown until this
 * module confirms the thing exists:
 *
 *   wikipedia → REST page summary (follows redirects; rejects disambiguation)
 *   book      → Open Library search (title similarity + author surname)
 *   web       → GET the page, compare <title>/og:title with the proposal
 *
 * Rejections carry a reason and are stored, never displayed, so thresholds
 * can be tuned from real data later.
 */

export type ReadingKind = "wikipedia" | "book" | "web";

export type ReadingProposal = {
  kind: ReadingKind;
  title: string;
  author?: string | null;
  url?: string | null;
  why?: string | null;
};

export type VerifiedVia = "wikipedia_summary" | "openlibrary" | "url_title";

export type VerifiedReading = {
  kind: ReadingKind;
  title: string;
  author: string | null;
  url: string;
  why: string | null;
  verifiedVia: VerifiedVia;
  snippet: string | null;
};

export type RejectedReading = ReadingProposal & { reason: string };

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type VerifyOptions = {
  /** Pause between proposals so we are polite to public endpoints. */
  gapMs?: number;
  timeoutMs?: number;
  wikipediaThreshold?: number;
  bookThreshold?: number;
  webThreshold?: number;
};

export const THRESHOLDS = { wikipedia: 0.6, book: 0.6, web: 0.5 } as const;
const MAX_HTML_BYTES = 256 * 1024;
export const USER_AGENT = "Sprout-Atlas/1.0 (self-hosted family app; link verification)";

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "on", "in", "to", "for"]);

/**
 * Lowercase, strip diacritics, drop parentheticals and site suffixes
 * ("Stoicism - Wikipedia", "Stoicism (Stanford Encyclopedia of Philosophy)"),
 * drop punctuation and stopwords.
 */
// Letters NFKD leaves alone because they are letters in their own right.
const LETTER_MAP: Record<string, string> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ð: "d",
  þ: "th",
  ł: "l",
  đ: "d",
  ı: "i",
};

export const normalizeTitle = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[øæœßðþłđı]/g, (ch) => LETTER_MAP[ch] ?? ch)
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+[|–—-]\s+/)[0]
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .join(" ");

/**
 * Two tokens match when equal, or when both are long enough to share a
 * 5-letter stem ("stoics" / "stoicism", "plato" / "platonism") — Wikipedia's
 * REST endpoint follows redirects, and the redirected title must still pass.
 */
const tokenMatch = (a: string, b: string): boolean =>
  a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

/** Dice coefficient over normalized token sets (0..1), with stem-tolerant matching. */
export const titleSimilarity = (a: string, b: string): number => {
  const ta = [...new Set(normalizeTitle(a).split(" ").filter(Boolean))];
  const tb = [...new Set(normalizeTitle(b).split(" ").filter(Boolean))];
  if (ta.length === 0 || tb.length === 0) return 0;
  const used = new Set<number>();
  let shared = 0;
  for (const t of ta) {
    const j = tb.findIndex((u, idx) => !used.has(idx) && tokenMatch(t, u));
    if (j !== -1) {
      used.add(j);
      shared += 1;
    }
  }
  return (2 * shared) / (ta.length + tb.length);
};

const firstSentence = (s: string | undefined | null): string | null => {
  if (!s) return null;
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim().slice(0, 300) || null;
};

const surname = (author: string): string => {
  const parts = normalizeTitle(author).split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? "";
};

type Outcome = { ok: true; reading: VerifiedReading } | { ok: false; reason: string };

const verifyWikipedia = async (
  p: ReadingProposal,
  fetchImpl: FetchLike,
  opts: Required<Pick<VerifyOptions, "timeoutMs" | "wikipediaThreshold">>,
): Promise<Outcome> => {
  const slug = encodeURIComponent(p.title.trim().replace(/\s+/g, "_"));
  const res = await fetchImpl(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) return { ok: false, reason: `wikipedia responded ${res.status}` };
  const json = (await res.json()) as {
    type?: string;
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  if (json.type === "disambiguation") return { ok: false, reason: "wikipedia disambiguation page" };
  const title = json.title ?? "";
  const sim = titleSimilarity(p.title, title);
  if (sim < opts.wikipediaThreshold) {
    return { ok: false, reason: `wikipedia title mismatch ("${title}", ${sim.toFixed(2)})` };
  }
  const url = json.content_urls?.desktop?.page;
  if (!url) return { ok: false, reason: "wikipedia summary had no page url" };
  return {
    ok: true,
    reading: {
      kind: "wikipedia",
      title,
      author: null,
      url,
      why: p.why ?? null,
      verifiedVia: "wikipedia_summary",
      snippet: firstSentence(json.extract),
    },
  };
};

const verifyBook = async (
  p: ReadingProposal,
  fetchImpl: FetchLike,
  opts: Required<Pick<VerifyOptions, "timeoutMs" | "bookThreshold">>,
): Promise<Outcome> => {
  const params = new URLSearchParams({
    title: p.title.trim(),
    limit: "5",
    fields: "key,title,author_name,first_publish_year",
  });
  if (p.author) params.set("author", p.author.trim());
  const res = await fetchImpl(`https://openlibrary.org/search.json?${params.toString()}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) return { ok: false, reason: `open library responded ${res.status}` };
  const json = (await res.json()) as {
    docs?: Array<{ key?: string; title?: string; author_name?: string[] }>;
  };
  const want = p.author ? surname(p.author) : "";
  for (const doc of json.docs ?? []) {
    if (!doc.key || !doc.title) continue;
    const sim = titleSimilarity(p.title, doc.title);
    if (sim < opts.bookThreshold) continue;
    const authors = doc.author_name ?? [];
    if (want && !authors.some((a) => normalizeTitle(a).split(" ").includes(want))) continue;
    return {
      ok: true,
      reading: {
        kind: "book",
        title: doc.title,
        author: authors[0] ?? p.author ?? null,
        url: `https://openlibrary.org${doc.key}`,
        why: p.why ?? null,
        verifiedVia: "openlibrary",
        snippet: null,
      },
    };
  }
  return { ok: false, reason: "no open library match on title/author" };
};

/**
 * One quoted attribute value from a single tag. Each pattern has one
 * quantified class with no overlap, so matching stays linear on hostile
 * input (the page is untrusted bytes).
 */
const attrValue = (tag: string, name: "property" | "name" | "content"): string | null => {
  const re =
    name === "property"
      ? /\bproperty\s*=\s*["']([^"']*)["']/i
      : name === "name"
        ? /\bname\s*=\s*["']([^"']*)["']/i
        : /\bcontent\s*=\s*["']([^"']*)["']/i;
  const m = tag.match(re);
  return m?.[1] ?? null;
};

/**
 * og:title if present (attributes in any order), else the <title> text.
 * Tags are located by plain string scanning, not by HTML-shaped regexes:
 * this is a title sniff over untrusted bytes, never a sanitizer, and it
 * must stay linear.
 */
export const extractHtmlTitle = (html: string): string | null => {
  const lower = html.toLowerCase();
  let from = 0;
  for (;;) {
    const start = lower.indexOf("<meta", from);
    if (start === -1) break;
    const end = lower.indexOf(">", start);
    if (end === -1) break;
    const tag = html.slice(start, end + 1);
    const prop = attrValue(tag, "property") ?? attrValue(tag, "name");
    if (prop?.toLowerCase() === "og:title") {
      const content = attrValue(tag, "content")?.trim();
      if (content) return content;
    }
    from = end + 1;
  }
  const titleAt = lower.indexOf("<title");
  if (titleAt === -1) return null;
  const open = lower.indexOf(">", titleAt);
  if (open === -1) return null;
  const close = lower.indexOf("</title", open);
  if (close === -1) return null;
  return html.slice(open + 1, close).replace(/\s+/g, " ").trim() || null;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  "#39": "'",
  quot: '"',
  ndash: "–",
  mdash: "—",
  nbsp: " ",
};

/** Single pass, so "&amp;quot;" decodes to "&quot;" and never to a quote. */
export const decodeEntities = (s: string): string =>
  s.replace(/&(amp|apos|#39|quot|ndash|mdash|nbsp);/g, (_, name: string) => ENTITIES[name] ?? "");

const stripTracking = (url: string): string => {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
};

const verifyWeb = async (
  p: ReadingProposal,
  fetchImpl: FetchLike,
  opts: Required<Pick<VerifyOptions, "timeoutMs" | "webThreshold">>,
): Promise<Outcome> => {
  if (!p.url) return { ok: false, reason: "web reading had no url" };
  let parsed: URL;
  try {
    parsed = new URL(p.url);
  } catch {
    return { ok: false, reason: "web url did not parse" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "web url must be https" };
  const host = parsed.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.startsWith("[") // bracketed IPv6 literal
  ) {
    return { ok: false, reason: "web url host not allowed" };
  }
  const res = await fetchImpl(parsed.toString(), {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) return { ok: false, reason: `web page responded ${res.status}` };
  const html = (await res.text()).slice(0, MAX_HTML_BYTES);
  const pageTitle = extractHtmlTitle(html);
  if (!pageTitle) return { ok: false, reason: "web page had no title" };
  const decoded = decodeEntities(pageTitle);
  const sim = titleSimilarity(p.title, decoded);
  if (sim < opts.webThreshold) {
    return { ok: false, reason: `web title mismatch ("${decoded.slice(0, 80)}", ${sim.toFixed(2)})` };
  }
  return {
    ok: true,
    reading: {
      kind: "web",
      title: p.title.trim(),
      author: p.author ?? null,
      url: stripTracking(res.url || parsed.toString()),
      why: p.why ?? null,
      verifiedVia: "url_title",
      snippet: null,
    },
  };
};

export const verifyReading = async (
  p: ReadingProposal,
  fetchImpl: FetchLike,
  options: VerifyOptions = {},
): Promise<Outcome> => {
  const opts = {
    timeoutMs: options.timeoutMs ?? 8000,
    wikipediaThreshold: options.wikipediaThreshold ?? THRESHOLDS.wikipedia,
    bookThreshold: options.bookThreshold ?? THRESHOLDS.book,
    webThreshold: options.webThreshold ?? THRESHOLDS.web,
  };
  if (!p.title || !p.title.trim()) return { ok: false, reason: "empty title" };
  try {
    switch (p.kind) {
      case "wikipedia":
        return await verifyWikipedia(p, fetchImpl, opts);
      case "book":
        return await verifyBook(p, fetchImpl, opts);
      case "web":
        return await verifyWeb(p, fetchImpl, opts);
      default:
        return { ok: false, reason: `unknown reading kind ${String(p.kind)}` };
    }
  } catch (err) {
    return { ok: false, reason: `fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sequential verification with dedupe by canonical URL. */
export const verifyReadings = async (
  proposals: ReadingProposal[],
  fetchImpl: FetchLike,
  options: VerifyOptions = {},
): Promise<{ verified: VerifiedReading[]; rejected: RejectedReading[] }> => {
  const verified: VerifiedReading[] = [];
  const rejected: RejectedReading[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < proposals.length; i++) {
    if (i > 0 && (options.gapMs ?? 300) > 0) await sleep(options.gapMs ?? 300);
    const p = proposals[i];
    const out = await verifyReading(p, fetchImpl, options);
    if (!out.ok) {
      rejected.push({ ...p, reason: out.reason });
      continue;
    }
    if (seen.has(out.reading.url)) {
      rejected.push({ ...p, reason: "duplicate of an already verified reading" });
      continue;
    }
    seen.add(out.reading.url);
    verified.push(out.reading);
  }
  return { verified, rejected };
};
