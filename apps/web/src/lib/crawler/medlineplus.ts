import type { CrawlAdapter, FetchedDoc } from "./types";

// NLM Web Service search over health topics (public domain, cache ≥24h —
// the nightly cadence satisfies that).
const WSEARCH = "https://wsearch.nlm.nih.gov/ws/query";

const stripTags = (s: string): string =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

export const medlineplusAdapter: CrawlAdapter = async (source) => {
  const topics = (source.config.topics as string[] | undefined) ?? [];
  if (topics.length === 0) throw new Error("medlineplus source missing config.topics");

  const docs: FetchedDoc[] = [];
  for (const topic of topics) {
    const res = await fetch(
      `${WSEARCH}?db=healthTopics&term=${encodeURIComponent(topic)}&retmax=10`,
    );
    if (!res.ok) throw new Error(`medlineplus wsearch ${res.status} for ${topic}`);
    const xml = await res.text();

    const docRe = /<document\s+rank="\d+"\s+url="([^"]+)">([\s\S]*?)<\/document>/g;
    let m;
    while ((m = docRe.exec(xml)) !== null) {
      const url = m[1];
      const body = m[2];
      const title = stripTags(
        /<content name="title">([\s\S]*?)<\/content>/.exec(body)?.[1] ?? "",
      );
      const summary = stripTags(
        /<content name="FullSummary">([\s\S]*?)<\/content>/.exec(body)?.[1] ?? "",
      );
      if (!title || !summary) continue;
      docs.push({
        externalId: `mlp-${url.split("/").pop() ?? title.toLowerCase().replace(/\W+/g, "-")}`,
        url,
        title,
        content: `${title}\n\n${summary}`,
        summary: summary.slice(0, 300),
      });
    }
  }

  // Dedupe across topic queries.
  const seen = new Set<string>();
  return {
    docs: docs.filter((d) => (seen.has(d.externalId) ? false : (seen.add(d.externalId), true))),
    suggestions: [],
  };
};
