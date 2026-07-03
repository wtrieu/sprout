/**
 * Seed CDC "Learn the Signs. Act Early." milestones (vendored JSON, public
 * domain) into both the structured `milestones` table and the RAG corpus
 * (one document per age bucket, chunked + embedded inline so chat works on
 * day one). Requires Ollama running with the embed model pulled.
 *
 * Run from apps/web (pnpm --filter web db:seed) so module resolution and the
 * default DATABASE_URL both work.
 */
import fs from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { milestones, sources, documents, chunks } from "../apps/web/src/db/schema";
import { embed, toBuffer } from "../apps/web/src/lib/embeddings";
import { formatAge } from "../apps/web/src/lib/age";

type MilestoneRow = { ageMonths: number; domain: string; description: string };

const dataPath = path.resolve(__dirname, "data/cdc-milestones.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf-8")) as {
  source: string;
  milestones: MilestoneRow[];
};

const CDC_URL = "https://www.cdc.gov/ncbddd/actearly/milestones/index.html";

const main = async () => {
  // 1. Structured rows (idempotent via externalId).
  let inserted = 0;
  data.milestones.forEach((m, i) => {
    const externalId = `cdc-ltsae-${m.ageMonths}m-${i}`;
    const res = db
      .insert(milestones)
      .values({
        domain: m.domain as (typeof milestones.$inferInsert)["domain"],
        ageMonths: m.ageMonths,
        description: m.description,
        sourceRef: "CDC LTSAE 2022",
        externalId,
      })
      .onConflictDoNothing()
      .run();
    inserted += res.changes;
  });
  console.log(`milestones: ${inserted} inserted (${data.milestones.length} in file)`);

  // 2. Corpus source row.
  db.insert(sources)
    .values({
      slug: "cdc-milestones",
      name: "CDC developmental milestones (Learn the Signs. Act Early.)",
      kind: "socrata",
      config: { vendored: true },
      license: "public domain (US government work)",
      fetchPolicy: "full_text",
      enabled: false, // vendored — nothing to crawl
    })
    .onConflictDoNothing()
    .run();
  const source = db.select().from(sources).where(eq(sources.slug, "cdc-milestones")).get()!;

  // 3. One corpus document per age bucket, embedded now.
  const ages = [...new Set(data.milestones.map((m) => m.ageMonths))].sort((a, b) => a - b);
  for (const age of ages) {
    const externalId = `cdc-milestones-${age}m`;
    const existing = db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.sourceId, source.id), eq(documents.externalId, externalId)))
      .get();
    if (existing) continue;

    const rows = data.milestones.filter((m) => m.ageMonths === age);
    const byDomain = new Map<string, string[]>();
    for (const r of rows) {
      byDomain.set(r.domain, [...(byDomain.get(r.domain) ?? []), r.description]);
    }
    const body = [...byDomain.entries()]
      .map(([domain, items]) => `${domain}:\n${items.map((d) => `- ${d}`).join("\n")}`)
      .join("\n\n");
    const content = `CDC developmental milestones for a child at ${formatAge(age)} (things most children — 75% or more — can do by this age):\n\n${body}\n\nIf a child is not meeting milestones, the CDC advises talking with the pediatrician about developmental screening.`;

    const doc = db
      .insert(documents)
      .values({
        sourceId: source.id,
        externalId,
        url: CDC_URL,
        title: `CDC milestones — ${formatAge(age)}`,
        contentHash: externalId,
        content,
        summary: `What most children can do by ${formatAge(age)}.`,
        ageMinMonths: age,
        ageMaxMonths: age + (age < 12 ? 3 : 6),
        topics: ["milestones", "development"],
        relevance: "relevant",
      })
      .returning({ id: documents.id })
      .get();

    const [vec] = await embed([content]);
    db.insert(chunks)
      .values({
        documentId: doc.id,
        chunkIndex: 0,
        text: content,
        embedding: toBuffer(vec),
      })
      .run();
    console.log(`corpus doc embedded: ${formatAge(age)}`);
  }
  console.log("seed-milestones done");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
