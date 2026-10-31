/**
 * Image verification — deterministic, keyless, injectable fetch: the readings
 * rule applied to pictures. The model proposes an image as Commons search
 * terms; nothing is shown until this module resolves the proposal to a real
 * Wikimedia Commons file with real dimensions and attribution. Rejections
 * carry a reason and are stored, never displayed, so the threshold can be
 * tuned from real data later.
 *
 * Resolution prefers the node's own verified Wikipedia article's media list
 * (relevance grounded in a page that was itself verified), falling back to a
 * Commons full-text search. Exact file titles are never asked of the model —
 * it would mostly hallucinate them.
 */
import { USER_AGENT, decodeEntities, titleSimilarity, type FetchLike } from "./verify";
import type { ImageProposal } from "./visuals";

export type ImageVerifiedVia = "article_media" | "commons_search";

export type VerifiedImage = {
  slug: string;
  query: string;
  caption: string;
  why: string | null;
  fileTitle: string;
  verifiedVia: ImageVerifiedVia;
  url: string;
  thumbUrl: string;
  descUrl: string | null;
  author: string | null;
  license: string | null;
  width: number;
  height: number;
};

export type RejectedImage = ImageProposal & { reason: string };

export type VerifyImageOptions = {
  /** Pause between proposals so we are polite to public endpoints. */
  gapMs?: number;
  timeoutMs?: number;
  threshold?: number;
  thumbWidth?: number;
};

export const IMAGE_THRESHOLD = 0.3;
/** Reject anything smaller than this on either side: thumbnails and icons. */
export const MIN_IMAGE_DIMENSION = 400;
export const THUMB_WIDTH = 640;

/** Real pictures only: bitmaps, never SVG (that is where the logos live). */
const BITMAP_RE = /\.(jpe?g|png|gif)$/i;
/** Interface furniture that rides along on article media lists. */
const JUNK_RE = /(commons-logo|wik(i|t)[a-z]*-logo|\blogo\b|question[_ ]book|ambox|padlock|disambig|stub[_ ]?icon|edit[_ ]?icon|p_vip|symbol[_ ]support)/i;

const cleanFileTitle = (t: string): string =>
  t
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_/g, " ");

const stripHtml = (s: string): string =>
  decodeEntities(s.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "";

type Candidate = { fileTitle: string; caption: string | null };

const headers = { "user-agent": USER_AGENT, accept: "application/json" };

/**
 * The media list of the node's verified Wikipedia article. Any failure here
 * degrades to "no article candidates" — the Commons search still runs.
 */
export const articleMediaCandidates = async (
  wikipediaTitle: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<Candidate[]> => {
  try {
    const slug = encodeURIComponent(wikipediaTitle.trim().replace(/\s+/g, "_"));
    const res = await fetchImpl(`https://en.wikipedia.org/api/rest_v1/page/media-list/${slug}`, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      items?: Array<{ title?: string; type?: string; caption?: { text?: string } }>;
    };
    return (json.items ?? [])
      .filter(
        (i): i is { title: string; type: string; caption?: { text?: string } } =>
          i.type === "image" && !!i.title && BITMAP_RE.test(i.title) && !JUNK_RE.test(i.title),
      )
      .map((i) => ({ fileTitle: i.title, caption: i.caption?.text?.trim() || null }));
  } catch {
    return [];
  }
};

const commonsSearchCandidates = async (
  query: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<Candidate[]> => {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    list: "search",
    srnamespace: "6",
    srlimit: "8",
    srsearch: query,
  });
  const res = await fetchImpl(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`commons search responded ${res.status}`);
  const json = (await res.json()) as { query?: { search?: Array<{ title?: string }> } };
  return (json.query?.search ?? [])
    .filter((r): r is { title: string } => !!r.title && BITMAP_RE.test(r.title) && !JUNK_RE.test(r.title))
    // The search snippet echoes the query by construction, so the filename is
    // the only honest thing to score against.
    .map((r) => ({ fileTitle: r.title, caption: null }));
};

const score = (query: string, c: Candidate): number =>
  Math.max(
    titleSimilarity(query, cleanFileTitle(c.fileTitle)),
    c.caption ? titleSimilarity(query, c.caption) : 0,
  );

const best = (query: string, candidates: Candidate[]): { c: Candidate; score: number } | null => {
  let top: { c: Candidate; score: number } | null = null;
  for (const c of candidates) {
    const s = score(query, c);
    if (!top || s > top.score) top = { c, score: s };
  }
  return top;
};

type ImageInfo = {
  url: string;
  descUrl: string | null;
  thumbUrl: string | null;
  width: number;
  height: number;
  author: string | null;
  license: string | null;
};

const imageInfo = async (
  fileTitle: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  thumbWidth: number,
): Promise<ImageInfo | null> => {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: String(thumbWidth),
    titles: fileTitle,
  });
  const res = await fetchImpl(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`commons imageinfo responded ${res.status}`);
  const json = (await res.json()) as {
    query?: {
      pages?: Array<{
        missing?: boolean;
        imageinfo?: Array<{
          url?: string;
          descriptionurl?: string;
          thumburl?: string;
          width?: number;
          height?: number;
          extmetadata?: Record<string, { value?: string }>;
        }>;
      }>;
    };
  };
  const page = json.query?.pages?.[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing || !info?.url) return null;
  const meta = info.extmetadata ?? {};
  return {
    url: info.url,
    descUrl: info.descriptionurl ?? null,
    thumbUrl: info.thumburl ?? null,
    width: info.width ?? 0,
    height: info.height ?? 0,
    author: meta.Artist?.value ? stripHtml(meta.Artist.value) || null : null,
    license: meta.LicenseShortName?.value ? stripHtml(meta.LicenseShortName.value) || null : null,
  };
};

type Outcome = { ok: true; image: VerifiedImage } | { ok: false; reason: string };

const verifyImage = async (
  p: ImageProposal,
  articleCandidates: Candidate[],
  fetchImpl: FetchLike,
  opts: Required<Pick<VerifyImageOptions, "timeoutMs" | "threshold" | "thumbWidth">>,
): Promise<Outcome> => {
  // The article's own media first; Commons search only when it has nothing.
  let top = best(p.query, articleCandidates);
  let via: ImageVerifiedVia = "article_media";
  if (!top || top.score < opts.threshold) {
    const searched = best(p.query, await commonsSearchCandidates(p.query, fetchImpl, opts.timeoutMs));
    if (searched && (!top || searched.score > top.score)) {
      top = searched;
      via = "commons_search";
    }
  }
  if (!top) return { ok: false, reason: `no commons candidates for "${p.query}"` };
  if (top.score < opts.threshold) {
    return {
      ok: false,
      reason: `best match below threshold ("${top.c.fileTitle}", ${top.score.toFixed(2)})`,
    };
  }
  const info = await imageInfo(top.c.fileTitle, fetchImpl, opts.timeoutMs, opts.thumbWidth);
  if (!info) return { ok: false, reason: `"${top.c.fileTitle}" not found on wikimedia commons` };
  if (info.width < MIN_IMAGE_DIMENSION || info.height < MIN_IMAGE_DIMENSION) {
    return { ok: false, reason: `image too small (${info.width}×${info.height})` };
  }
  return {
    ok: true,
    image: {
      slug: p.slug,
      query: p.query,
      caption: p.caption,
      why: p.why ?? null,
      fileTitle: top.c.fileTitle,
      verifiedVia: via,
      url: info.url,
      thumbUrl: info.thumbUrl ?? info.url,
      descUrl: info.descUrl,
      author: info.author,
      license: info.license,
      width: info.width,
      height: info.height,
    },
  };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sequential verification with dedupe by Commons file title. */
export const verifyImages = async (
  proposals: ImageProposal[],
  input: { wikipediaTitle?: string | null },
  fetchImpl: FetchLike,
  options: VerifyImageOptions = {},
): Promise<{ verified: VerifiedImage[]; rejected: RejectedImage[] }> => {
  const opts = {
    timeoutMs: options.timeoutMs ?? 8000,
    threshold: options.threshold ?? IMAGE_THRESHOLD,
    thumbWidth: options.thumbWidth ?? THUMB_WIDTH,
  };
  const verified: VerifiedImage[] = [];
  const rejected: RejectedImage[] = [];
  if (proposals.length === 0) return { verified, rejected };

  const articleCandidates = input.wikipediaTitle
    ? await articleMediaCandidates(input.wikipediaTitle, fetchImpl, opts.timeoutMs)
    : [];

  const seen = new Set<string>();
  for (let i = 0; i < proposals.length; i++) {
    if (i > 0 && (options.gapMs ?? 300) > 0) await sleep(options.gapMs ?? 300);
    const p = proposals[i];
    let out: Outcome;
    try {
      out = await verifyImage(p, articleCandidates, fetchImpl, opts);
    } catch (err) {
      out = { ok: false, reason: `fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!out.ok) {
      rejected.push({ ...p, reason: out.reason });
      continue;
    }
    if (seen.has(out.image.fileTitle)) {
      rejected.push({ ...p, reason: "duplicate of an already verified image" });
      continue;
    }
    seen.add(out.image.fileTitle);
    verified.push(out.image);
  }
  return { verified, rejected };
};
