import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { sources, documents, crawlRuns, sourceSuggestions } from "../db/schema";
import { getAdapter } from "./crawler/registry";
import { enqueue } from "./jobs";

const hash = (s: string): string => createHash("sha256").update(s).digest("hex");

export type CrawlSummary = {
  slug: string;
  seen: number;
  inserted: number;
  error: string | null;
};

/**
 * Crawl every enabled+approved source. Per-source failures are recorded on
 * the source row and never block other sources. New docs are inserted as
 * relevance='pending' and get a relevance + embed job enqueued.
 */
export const crawlAllSources = async (db: DB): Promise<CrawlSummary[]> => {
  const rows = db
    .select()
    .from(sources)
    .where(and(eq(sources.enabled, true), eq(sources.status, "approved")))
    .all();

  const summaries: CrawlSummary[] = [];
  for (const source of rows) {
    const adapter = getAdapter(source.kind);
    if (!adapter) continue; // vendored kinds (socrata/who_csv) have no crawler

    const run = db
      .insert(crawlRuns)
      .values({ sourceId: source.id })
      .returning({ id: crawlRuns.id })
      .get();

    let seen = 0;
    let inserted = 0;
    let error: string | null = null;
    try {
      const result = await adapter({
        id: source.id,
        slug: source.slug,
        kind: source.kind,
        config: source.config as Record<string, unknown>,
        fetchPolicy: source.fetchPolicy,
      });
      seen = result.docs.length;

      for (const doc of result.docs) {
        const contentHash = hash(doc.content);
        const existing = db
          .select({ id: documents.id, contentHash: documents.contentHash })
          .from(documents)
          .where(
            and(eq(documents.sourceId, source.id), eq(documents.externalId, doc.externalId)),
          )
          .get();
        if (existing) continue; // idempotent re-crawl

        const rec = db
          .insert(documents)
          .values({
            sourceId: source.id,
            externalId: doc.externalId,
            url: doc.url,
            title: doc.title,
            publishedAt: doc.publishedAt,
            contentHash,
            content: doc.content,
            summary: doc.summary,
            relevance: "pending",
          })
          .returning({ id: documents.id })
          .get();
        inserted += 1;
        enqueue(db, { type: "relevance", lane: "llm", payload: { documentId: rec.id }, priority: 50 });
        enqueue(db, { type: "embed_doc", lane: "llm", payload: { documentId: rec.id }, priority: 60 });
      }

      for (const s of result.suggestions) {
        db.insert(sourceSuggestions)
          .values({ url: s.url, title: s.title, reason: s.reason })
          .onConflictDoNothing()
          .run();
      }

      db.update(sources)
        .set({ lastFetchedAt: new Date(), error: null })
        .where(eq(sources.id, source.id))
        .run();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      db.update(sources).set({ error }).where(eq(sources.id, source.id)).run();
    }

    db.update(crawlRuns)
      .set({ endedAt: new Date(), docsSeen: seen, docsNew: inserted, error })
      .where(eq(crawlRuns.id, run.id))
      .run();
    summaries.push({ slug: source.slug, seen, inserted, error });
  }
  return summaries;
};
