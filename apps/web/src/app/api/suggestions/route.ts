import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sourceSuggestions, sources } from "@/db/schema";

const PatchSchema = z.object({
  id: z.number().int(),
  status: z.enum(["approved", "rejected"]),
});

/**
 * Approving a suggestion records the decision; if it's a PubMed article link
 * it becomes a single-article source of kind "web" is overkill — instead we
 * simply mark it approved so the library page lists it for manual reading.
 * (Full auto-ingest of arbitrary approved URLs is a follow-up.)
 */
export const PATCH = async (req: NextRequest) => {
  const body = PatchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }
  const suggestion = db
    .select()
    .from(sourceSuggestions)
    .where(eq(sourceSuggestions.id, body.data.id))
    .get();
  if (!suggestion) return NextResponse.json({ error: "not found" }, { status: 404 });

  db.update(sourceSuggestions)
    .set({ status: body.data.status })
    .where(eq(sourceSuggestions.id, body.data.id))
    .run();

  // Approved PubMed links become a tiny crawlable source so the article's
  // abstract is ingested on the next nightly run.
  if (body.data.status === "approved") {
    const pmid = /pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/.exec(suggestion.url)?.[1];
    if (pmid) {
      db.insert(sources)
        .values({
          slug: `pubmed-article-${pmid}`,
          name: suggestion.title ?? `PubMed article ${pmid}`,
          kind: "pubmed",
          config: { query: `${pmid}[uid]`, retmax: 1 },
          license: "public domain (abstract)",
          fetchPolicy: "full_text",
          enabled: true,
          status: "approved",
        })
        .onConflictDoNothing()
        .run();
    }
  }
  return NextResponse.json({ ok: true });
};
