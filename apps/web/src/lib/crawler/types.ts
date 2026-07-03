export type FetchedDoc = {
  externalId: string;
  url: string | null;
  title: string;
  content: string;
  summary?: string;
  publishedAt?: Date;
};

export type Suggestion = {
  url: string;
  title?: string;
  reason: string;
};

export type CrawlResult = {
  docs: FetchedDoc[];
  suggestions: Suggestion[];
};

export type SourceRow = {
  id: number;
  slug: string;
  kind: string;
  config: Record<string, unknown>;
  fetchPolicy: "full_text" | "summary_link_only";
};

export type CrawlAdapter = (source: SourceRow) => Promise<CrawlResult>;
