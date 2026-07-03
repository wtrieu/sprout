import type { CrawlAdapter } from "./types";
import { pubmedAdapter } from "./pubmed";
import { medlineplusAdapter } from "./medlineplus";
import { rssAdapter } from "./rss";
import { openfoodfactsAdapter } from "./openfoodfacts";

const adapters: Record<string, CrawlAdapter> = {
  pubmed: pubmedAdapter,
  medlineplus: medlineplusAdapter,
  rss: rssAdapter,
  openfoodfacts: openfoodfactsAdapter,
  // socrata / who_csv are vendored or annual — seeded by scripts, not crawled.
};

export const getAdapter = (kind: string): CrawlAdapter | null => adapters[kind] ?? null;
