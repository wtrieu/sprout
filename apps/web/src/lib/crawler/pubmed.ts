import type { CrawlAdapter, FetchedDoc, Suggestion } from "./types";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
// NCBI allows 3 req/s unauthenticated; stay well under.
const THROTTLE_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripTags = (s: string): string =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extract = (xml: string, tag: string): string[] => {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
};

/**
 * PubMed E-utilities: esearch (recent matches for the configured query) →
 * efetch (abstracts) → elink (related articles become source suggestions).
 */
export const pubmedAdapter: CrawlAdapter = async (source) => {
  const query = String(source.config.query ?? "");
  const retmax = Number(source.config.retmax ?? 20);
  if (!query) throw new Error("pubmed source missing config.query");

  const searchRes = await fetch(
    `${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&sort=pub_date&retmode=json`,
  );
  if (!searchRes.ok) throw new Error(`esearch ${searchRes.status}`);
  const search = (await searchRes.json()) as { esearchresult: { idlist: string[] } };
  const pmids = search.esearchresult.idlist;
  if (pmids.length === 0) return { docs: [], suggestions: [] };

  await sleep(THROTTLE_MS);
  const fetchRes = await fetch(
    `${EUTILS}/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&rettype=abstract&retmode=xml`,
  );
  if (!fetchRes.ok) throw new Error(`efetch ${fetchRes.status}`);
  const xml = await fetchRes.text();

  const docs: FetchedDoc[] = [];
  for (const articleXml of extract(xml, "PubmedArticle")) {
    const pmid = extract(articleXml, "PMID")[0];
    const title = stripTags(extract(articleXml, "ArticleTitle")[0] ?? "");
    const abstractParts = extract(articleXml, "AbstractText").map(stripTags);
    const year = extract(articleXml, "Year")[0];
    if (!pmid || !title || abstractParts.length === 0) continue;
    docs.push({
      externalId: `pmid-${pmid}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      title,
      content: `${title}\n\n${abstractParts.join("\n\n")}`,
      summary: abstractParts[0]?.slice(0, 300),
      publishedAt: year ? new Date(`${year}-01-01T00:00:00`) : undefined,
    });
  }

  // Related articles for the top hits → suggestion queue.
  const suggestions: Suggestion[] = [];
  for (const pmid of pmids.slice(0, 3)) {
    await sleep(THROTTLE_MS);
    try {
      const linkRes = await fetch(
        `${EUTILS}/elink.fcgi?dbfrom=pubmed&db=pubmed&id=${pmid}&cmd=neighbor&retmode=json`,
      );
      if (!linkRes.ok) continue;
      const link = (await linkRes.json()) as {
        linksets?: Array<{ linksetdbs?: Array<{ linkname: string; links: string[] }> }>;
      };
      const related =
        link.linksets?.[0]?.linksetdbs?.find((l) => l.linkname === "pubmed_pubmed")?.links ?? [];
      for (const rel of related.slice(0, 3)) {
        if (pmids.includes(rel)) continue;
        suggestions.push({
          url: `https://pubmed.ncbi.nlm.nih.gov/${rel}/`,
          reason: `PubMed related article of PMID ${pmid}`,
        });
      }
    } catch {
      // suggestions are best-effort
    }
  }

  return { docs, suggestions };
};
