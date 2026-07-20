import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { children, researchBriefs, type Citation } from "@/db/schema";
import { ageInMonths } from "@/lib/age";
import { retrieve, type RetrievedChunk } from "@/lib/rag";
import { searchPubmed } from "@/lib/crawler/pubmed";
import { claudeAvailable } from "@/lib/claude";
import {
  planQueries,
  extractFindings,
  writeEvidenceSection,
  writePracticalSection,
  writeCaveatsAndBottomLine,
  assembleResearchBrief,
  type NumberedSource,
  type Finding,
} from "@/lib/skills/research";
import { isLocked } from "@/lib/jobs";

export const GET = () => {
  const rows = db
    .select({
      id: researchBriefs.id,
      topic: researchBriefs.topic,
      ageMonths: researchBriefs.ageMonths,
      contentMd: researchBriefs.contentMd,
      citations: researchBriefs.citations,
      createdAt: researchBriefs.createdAt,
    })
    .from(researchBriefs)
    .orderBy(desc(researchBriefs.id))
    .all();
  return NextResponse.json({ briefs: rows });
};

const PostSchema = z.object({
  topic: z.string().min(5).max(300),
});

export const POST = async (req: NextRequest) => {
  const body = PostSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.message }, { status: 400 });
  }

  if (!claudeAvailable() && isLocked(db)) {
    return NextResponse.json(
      { error: "Sprout is busy generating (nightly batch or story images). Try again in a few minutes." },
      { status: 503 },
    );
  }

  const child = db.select().from(children).limit(1).get();
  if (!child) {
    return NextResponse.json({ error: "Set up the child profile first." }, { status: 400 });
  }
  const months = ageInMonths(child.dob);
  const topic = body.data.topic;

  // 1. Fan the topic out into retrieval angles + a PubMed search term.
  const plan = await planQueries(topic, months);

  // 2. Corpus sweep: retrieve per sub-query, dedupe, keep the best.
  const byKey = new Map<string, RetrievedChunk>();
  for (const q of [topic, ...plan.sub_queries]) {
    for (const r of await retrieve(db, q, months, 6)) {
      const key = `${r.docId}:${r.text.slice(0, 60)}`;
      const prev = byKey.get(key);
      if (!prev || r.score > prev.score) byKey.set(key, r);
    }
  }
  const corpusChunks = [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, 14);

  // 3. Live PubMed sweep (best-effort — the corpus alone is fine offline).
  let pubmedDocs: Awaited<ReturnType<typeof searchPubmed>>["docs"] = [];
  try {
    pubmedDocs = (await searchPubmed(plan.pubmed_term, 8, "relevance")).docs;
  } catch {
    // network hiccup or NCBI down — proceed with corpus only
  }

  if (corpusChunks.length === 0 && pubmedDocs.length === 0) {
    return NextResponse.json(
      { error: "Nothing in the corpus or on PubMed matched that topic. Try rephrasing." },
      { status: 404 },
    );
  }

  // 4. Numbered source list — corpus first, then PubMed abstracts.
  const sources: Array<{ label: string; text: string; citation: Citation }> = [
    ...corpusChunks.map((r) => ({
      label: r.title,
      text: r.text,
      citation: { docId: r.docId, title: r.title, url: r.url, snippet: r.text.slice(0, 200) },
    })),
    ...pubmedDocs.map((d) => ({
      label: `PubMed: ${d.title}`,
      text: d.content.slice(0, 1500),
      citation: { docId: 0, title: d.title, url: d.url ?? null, snippet: d.content.slice(0, 200) },
    })),
  ];

  // 5. Extract findings per small source batch — citations attach at
  //    extraction time, so the writers can only cite indices that exist.
  const numbered: NumberedSource[] = sources.map((s, i) => ({
    index: i + 1,
    label: s.label,
    text: s.text,
  }));
  const findings: Finding[] = [];
  for (let i = 0; i < numbered.length; i += 4) {
    findings.push(...(await extractFindings(topic, months, numbered.slice(i, i + 4))));
  }
  if (findings.length === 0) {
    return NextResponse.json(
      { error: "The matched sources contained nothing substantive on that topic. Try rephrasing." },
      { status: 404 },
    );
  }

  // 6. Write each section from the findings only; assemble + validate in code.
  const evidence = await writeEvidenceSection(topic, findings);
  const practical = await writePracticalSection(topic, months, findings);
  const caveatsAndBottomLine = await writeCaveatsAndBottomLine(topic, findings);
  const { md: contentMd } = assembleResearchBrief({
    months,
    evidence,
    practical,
    caveatsAndBottomLine,
    maxIndex: sources.length,
  });

  const brief = db
    .insert(researchBriefs)
    .values({
      childId: child.id,
      topic,
      ageMonths: months,
      contentMd,
      citations: sources.map((s) => s.citation),
    })
    .returning()
    .get();

  return NextResponse.json({ brief });
};
