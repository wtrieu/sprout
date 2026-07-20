import { inArray, or, and, gte, lte, isNull, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { chunks, documents, type Citation } from "../db/schema";
import { embedOne, cosine, fromBuffer } from "./embeddings";
import { ageWindow } from "./age";

// Calibrated on this corpus (nomic-embed-text): on-topic chunks score
// 0.55-0.69, topically-adjacent 0.52-0.57, unrelated junk 0.42-0.44. The
// floor drops the junk so an off-corpus question gets an honest "no sources"
// instead of an answer synthesized from noise.
const COSINE_FLOOR = 0.48;
const RRF_K = 60;

const STOPWORDS = new Set(
  "the a an and or but for nor of to in on at by with from as is are was were be been being do does did have has had how what when where why who which my our your his her its their this that these those it he she they them we you i".split(" "),
);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));

/** Classic BM25 over an in-memory candidate set (k1=1.2, b=0.75). */
const bm25Scores = (query: string, docs: string[]): number[] => {
  const qTerms = [...new Set(tokenize(query))];
  const docTokens = docs.map(tokenize);
  const avgLen = docTokens.reduce((s, d) => s + d.length, 0) / Math.max(1, docTokens.length);
  const df = new Map<string, number>();
  for (const term of qTerms) {
    df.set(term, docTokens.filter((d) => d.includes(term)).length);
  }
  const n = docs.length;
  return docTokens.map((tokens) => {
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of qTerms) {
      const tf = counts.get(term) ?? 0;
      if (tf === 0) continue;
      const idf = Math.log(1 + (n - df.get(term)! + 0.5) / (df.get(term)! + 0.5));
      score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (tokens.length / avgLen)));
    }
    return score;
  });
};

export type RetrievedChunk = {
  text: string;
  score: number;
  docId: number;
  title: string;
  url: string | null;
};

/**
 * Retrieve top-K chunks for a query, restricted to documents whose age window
 * overlaps the child's current age (±pad months) or that carry no age tag.
 */
export const retrieve = async (
  db: DB,
  query: string,
  ageMonths: number,
  k = 8,
): Promise<RetrievedChunk[]> => {
  const win = ageWindow(ageMonths, 3);

  const eligibleDocs = db
    .select({ id: documents.id, title: documents.title, url: documents.url })
    .from(documents)
    .where(
      and(
        inArray(documents.relevance, ["relevant", "pending"]),
        or(
          and(isNull(documents.ageMinMonths), isNull(documents.ageMaxMonths)),
          and(
            lte(sql`COALESCE(${documents.ageMinMonths}, 0)`, win.max),
            gte(sql`COALESCE(${documents.ageMaxMonths}, 1200)`, win.min),
          ),
        ),
      ),
    )
    .all();
  if (eligibleDocs.length === 0) return [];

  const docMeta = new Map(eligibleDocs.map((d) => [d.id, d]));
  const candidateChunks = db
    .select({
      documentId: chunks.documentId,
      text: chunks.text,
      embedding: chunks.embedding,
    })
    .from(chunks)
    .where(inArray(chunks.documentId, [...docMeta.keys()]))
    .all();

  // Hybrid ranking: dense cosine catches paraphrase, BM25 catches exact terms
  // ("cow milk" beats generic nutrition); reciprocal-rank fusion combines the
  // two orderings without score-scale juggling. The cosine floor then drops
  // anything the corpus plainly doesn't cover.
  const queryVec = await embedOne(query);
  const scored = candidateChunks
    .filter((c) => c.embedding !== null)
    .map((c) => ({ ...c, cos: cosine(queryVec, fromBuffer(c.embedding as Buffer)) }));
  const bm = bm25Scores(query, scored.map((c) => c.text));

  const byCos = [...scored.keys()].sort((a, b) => scored[b].cos - scored[a].cos);
  const byBm = [...scored.keys()].sort((a, b) => bm[b] - bm[a]);
  const rrf = new Array<number>(scored.length).fill(0);
  byCos.forEach((idx, rank) => (rrf[idx] += 1 / (RRF_K + rank)));
  byBm.forEach((idx, rank) => (rrf[idx] += 1 / (RRF_K + rank)));
  const byRrf = [...scored.keys()].sort((a, b) => rrf[b] - rrf[a]);

  // Semantic recall floor: the top-3 pure-cosine chunks always make the cut —
  // equal-weight fusion alone can let several keyword-matching mediocre chunks
  // displace the semantically best one (measured via eval:rag). BM25 shapes
  // the remaining slots.
  const chosen: number[] = [];
  for (const idx of [...byCos.slice(0, 3), ...byRrf]) {
    if (chosen.includes(idx) || scored[idx].cos < COSINE_FLOOR) continue;
    chosen.push(idx);
    if (chosen.length === k) break;
  }

  return chosen.map((idx) => {
    const c = scored[idx];
    const meta = docMeta.get(c.documentId)!;
    return {
      text: c.text,
      score: c.cos,
      docId: c.documentId,
      title: meta.title,
      url: meta.url,
    };
  });
};

/** Citations come from retrieval metadata — never from model output. */
export const toCitations = (retrieved: RetrievedChunk[]): Citation[] => {
  const seen = new Set<number>();
  const out: Citation[] = [];
  for (const r of retrieved) {
    if (seen.has(r.docId)) continue;
    seen.add(r.docId);
    out.push({
      docId: r.docId,
      title: r.title,
      url: r.url,
      snippet: r.text.slice(0, 200),
    });
  }
  return out;
};

