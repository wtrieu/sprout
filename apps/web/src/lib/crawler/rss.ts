import type { CrawlAdapter, FetchedDoc } from "./types";

const stripTags = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const pick = (xml: string, tag: string): string | null => {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1] : null;
};

/**
 * Generic RSS 2.0 / Atom adapter. Used for copyrighted feeds (AAP): the
 * source's fetch_policy=summary_link_only means we only ever store what the
 * publisher put in the feed itself (title + summary) plus a deep link.
 */
export const rssAdapter: CrawlAdapter = async (source) => {
  const feedUrl = String(source.config.feedUrl ?? "");
  if (!feedUrl) throw new Error("rss source missing config.feedUrl");

  const res = await fetch(feedUrl, {
    headers: { "user-agent": "sprout-home-server/1.0 (personal use)" },
  });
  if (!res.ok) throw new Error(`rss fetch ${res.status}`);
  const xml = await res.text();

  const items = [
    ...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g),
    ...xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g),
  ].map((m) => m[1]);

  const docs: FetchedDoc[] = [];
  for (const item of items) {
    const title = stripTags(pick(item, "title") ?? "");
    // RSS <link>text</link> vs Atom <link href="..."/>
    const link =
      stripTags(pick(item, "link") ?? "") ||
      /<link[^>]*href="([^"]+)"/.exec(item)?.[1] ||
      "";
    const desc = stripTags(pick(item, "description") ?? pick(item, "summary") ?? "");
    const pubDate = pick(item, "pubDate") ?? pick(item, "published");
    if (!title || !link) continue;
    docs.push({
      externalId: link,
      url: link,
      title,
      content: desc ? `${title}\n\n${desc}` : title,
      summary: desc.slice(0, 300),
      publishedAt: pubDate ? new Date(stripTags(pubDate)) : undefined,
    });
  }
  return { docs, suggestions: [] };
};
