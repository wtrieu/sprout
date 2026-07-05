/**
 * Corpus curation audit — report-only, nothing is changed automatically:
 *
 *   1. re-grade a sample of the relevance filter's keep/reject calls
 *   2. flag old "relevant" guidance that may be outdated (recommendations change)
 *   3. recommend approve/reject for pending source suggestions
 *
 * Runs on Claude when ANTHROPIC_API_KEY is set; otherwise on the local model
 * in small batches (see lib/skills/audit.ts). A local re-grade of the local
 * filter still catches drift — the audit prompt frames the task differently
 * than the classification prompt — but flag counts, not certainties.
 *
 * Run: pnpm --filter web run job:audit — then act via the Sources/Library pages.
 */
import "./env";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { claudeAvailable } from "../apps/web/src/lib/claude";
import {
  AUDIT_BATCH_SIZE,
  inBatches,
  regradeBatch,
  stalenessBatch,
  suggestionBatch,
  type GradedDoc,
  type OldDoc,
  type PendingSuggestion,
} from "../apps/web/src/lib/skills/audit";

const main = async () => {
  const auditorLabel = claudeAvailable() ? "Claude (independent)" : "local qwen3 (self-audit)";
  const sections: string[] = [];
  const date = new Date().toISOString().slice(0, 10);

  // --- 1. Re-grade relevance decisions -------------------------------------
  const graded = db.all<GradedDoc>(sql`
    SELECT id, title, substr(content, 1, 600) as content, relevance,
           age_min_months as ageMin, age_max_months as ageMax
    FROM documents
    WHERE relevance IN ('relevant', 'irrelevant')
    ORDER BY RANDOM()
    LIMIT 30
  `);

  let disagreements: Array<{ id: number; title: string; was: string; reason: string }> = [];
  if (graded.length > 0) {
    console.log(`re-grading ${graded.length} relevance decisions…`);
    const byId = new Map(graded.map((d) => [d.id, d]));
    for (const batch of inBatches(graded, AUDIT_BATCH_SIZE)) {
      const verdicts = await regradeBatch(batch);
      disagreements.push(
        ...verdicts
          .filter((v) => !v.agree && byId.has(v.id))
          .map((v) => ({
            id: v.id,
            title: byId.get(v.id)!.title,
            was: byId.get(v.id)!.relevance,
            reason: v.reason,
          })),
      );
    }

    sections.push(`## Relevance filter re-grade

Sampled ${graded.length} decided documents; disagreed with **${disagreements.length}**.

${
  disagreements.length === 0
    ? "No disagreements — the filter is holding up."
    : disagreements
        .map((d) => `- doc #${d.id} "${d.title}" — labeled \`${d.was}\`, auditor disagrees: ${d.reason}`)
        .join("\n")
}`);
  } else {
    sections.push("## Relevance filter re-grade\n\nNo decided documents yet.");
  }

  // --- 2. Staleness flags on older relevant guidance ------------------------
  const old = db.all<{ id: number; title: string; content: string; published: number | null }>(sql`
    SELECT id, title, substr(content, 1, 400) as content, published_at as published
    FROM documents
    WHERE relevance = 'relevant'
      AND published_at IS NOT NULL
      AND published_at < unixepoch('now', '-24 months')
    ORDER BY published_at ASC
    LIMIT 25
  `);

  let staleFlags: Array<{ id: number; title: string; year: string; reason: string }> = [];
  if (old.length > 0) {
    console.log(`checking ${old.length} older documents for stale guidance…`);
    const oldDocs: OldDoc[] = old.map((d) => ({
      id: d.id,
      title: d.title,
      content: d.content,
      year: String(new Date((d.published ?? 0) * 1000).getFullYear()),
    }));
    const byId = new Map(oldDocs.map((d) => [d.id, d]));
    for (const batch of inBatches(oldDocs, AUDIT_BATCH_SIZE)) {
      const flags = await stalenessBatch(batch, date);
      staleFlags.push(
        ...flags
          .filter((f) => f.stale_risk && byId.has(f.id))
          .map((f) => ({
            id: f.id,
            title: byId.get(f.id)!.title,
            year: byId.get(f.id)!.year,
            reason: f.reason,
          })),
      );
    }

    sections.push(`## Staleness check

Reviewed ${old.length} documents older than 24 months; flagged **${staleFlags.length}** as stale-risk.

${
  staleFlags.length === 0
    ? "Nothing flagged."
    : staleFlags.map((f) => `- doc #${f.id} "${f.title}" (${f.year}) — ${f.reason}`).join("\n")
}`);
  } else {
    sections.push("## Staleness check\n\nNo relevant documents older than 24 months.");
  }

  // --- 3. Pending source suggestions ----------------------------------------
  const pending = db.all<PendingSuggestion>(sql`
    SELECT id, url, title, reason FROM source_suggestions WHERE status = 'pending' ORDER BY id DESC LIMIT 20
  `);

  if (pending.length > 0) {
    console.log(`reviewing ${pending.length} pending source suggestions…`);
    const byId = new Map(pending.map((s) => [s.id, s]));
    const lines: string[] = [];
    for (const batch of inBatches(pending, 10)) {
      const recommendations = await suggestionBatch(batch);
      lines.push(
        ...recommendations
          .filter((r) => byId.has(r.id))
          .map((r) => `- **${r.recommend}** #${r.id} ${byId.get(r.id)!.url} — ${r.reason}`),
      );
    }
    sections.push(`## Pending source suggestions\n\n${lines.join("\n")}`);
  } else {
    sections.push("## Pending source suggestions\n\nQueue is empty.");
  }

  // --- report ---------------------------------------------------------------
  const report = `# Corpus audit — ${date}

Auditor: ${auditorLabel}. Report-only: nothing was changed. Act on findings via the Sources and Library pages.
${claudeAvailable() ? "" : "\n> ⚠️ Self-audited run: the auditor shares the model with the relevance filter. Disagreements are leads to check, not verdicts.\n"}
${sections.join("\n\n")}
`;

  const outDir = path.resolve(process.cwd(), "../../data/audits");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `corpus-audit-${date}.md`);
  fs.writeFileSync(outPath, report);

  console.log(
    `\ndisagreements: ${disagreements.length} · stale-risk: ${staleFlags.length} · suggestions reviewed: ${pending.length}`,
  );
  console.log(`report: ${outPath}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
