import { inArray, or, and, gte, lte, isNull, eq, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { chunks, documents, type Citation } from "../db/schema";
import { embedOne, cosineTopK } from "./embeddings";
import { ageWindow, formatAge } from "./age";

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

  const queryVec = await embedOne(query);
  return cosineTopK(queryVec, candidateChunks, k).map((c) => {
    const meta = docMeta.get(c.documentId)!;
    return {
      text: c.text,
      score: c.score,
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

export const buildChatPrompt = (
  question: string,
  ageMonths: number,
  retrieved: RetrievedChunk[],
  childName: string,
): string => {
  const context = retrieved
    .map((r, i) => `[${i + 1}] (${r.title})\n${r.text}`)
    .join("\n\n---\n\n");

  return `You are a careful parenting research assistant for a parent whose child, ${childName}, is ${formatAge(ageMonths)} old.

Answer the parent's question using ONLY the sourced context below. Rules:
- Ground every claim in the context; reference sources inline as [1], [2] etc.
- If the context does not cover the question, say so plainly — do not invent guidance.
- Where sources disagree, present both views.
- Keep the answer practical and specific to a ${formatAge(ageMonths)}-old.
- You are not a doctor; for anything symptom- or safety-critical, advise checking with a pediatrician.

SOURCED CONTEXT:
${context}

QUESTION: ${question}

Answer:`;
};
