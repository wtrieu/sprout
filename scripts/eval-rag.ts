/**
 * RAG citation-faithfulness eval. The chat pipeline's whole value proposition
 * is "trustworthy, cited answers" — this measures it:
 *
 *   1. sample embedded chunks from relevant docs
 *   2. write a parent-style question each chunk can answer
 *   3. run the PRODUCTION pipeline (retrieve → buildChatPrompt → qwen3)
 *   4. judge via claim decomposition: extract atomic claims, verify each
 *      against the retrieved context, roll the verdict up in code
 *
 * Judging runs on Claude when ANTHROPIC_API_KEY is set (independent judge —
 * the gold standard) and on the local model otherwise (self-judge: still a
 * useful REGRESSION signal because the claim-by-claim decomposition is much
 * harder to game than holistic grading, but treat absolute numbers gently).
 *
 * Run: pnpm --filter web run eval:rag [n=10]
 */
import "./env";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../apps/web/src/db/client";
import { children } from "../apps/web/src/db/schema";
import { ageInMonths } from "../apps/web/src/lib/age";
import { retrieve, toCitations } from "../apps/web/src/lib/rag";
import { claudeAvailable } from "../apps/web/src/lib/claude";
import { composeAnswer } from "../apps/web/src/lib/skills/ask";
import {
  writeEvalQuestion,
  extractClaims,
  verifyClaims,
  checkHedging,
  rollUpVerdicts,
  type AnswerJudgment,
} from "../apps/web/src/lib/skills/judge";

const N = Number(process.argv[2] ?? 10);

type CaseResult = {
  question: string;
  sourceDocId: number;
  retrievalHit: boolean;
  answer: string;
  judgment: AnswerJudgment;
  hedged: boolean;
  hedgeNote: string;
};

const main = async () => {
  const judgeLabel = claudeAvailable()
    ? "Claude (independent)"
    : "local qwen3 (self-judge — regression signal, not ground truth)";

  const child = db.select().from(children).limit(1).get();
  const months = child ? ageInMonths(child.dob) : 18;
  const childName = child?.name ?? "the child";

  const sample = db.all<{ id: number; documentId: number; text: string; title: string }>(sql`
    SELECT c.id, c.document_id as documentId, c.text, d.title
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
      AND d.relevance = 'relevant'
      AND length(c.text) > 200
      AND (d.age_min_months IS NULL OR d.age_min_months <= ${months + 3})
      AND (d.age_max_months IS NULL OR d.age_max_months >= ${months - 3})
    ORDER BY RANDOM()
    LIMIT ${N}
  `);
  if (sample.length === 0) {
    console.error("no embedded, relevant, age-eligible chunks in the corpus — run the nightly pipeline first.");
    process.exit(1);
  }
  console.log(`sampled ${sample.length} chunks · judge: ${judgeLabel}`);

  const results: CaseResult[] = [];
  for (const src of sample) {
    const question = await writeEvalQuestion(src.text, src.title, months);
    process.stdout.write(`  · ${question.slice(0, 70)}… `);

    const retrieved = await retrieve(db, question, months, 8);
    const retrievalHit = retrieved.some((r) => r.docId === src.documentId);
    if (retrieved.length === 0) {
      console.log("(no retrieval — pipeline refuses, counts as faithful)");
      results.push({
        question,
        sourceDocId: src.documentId,
        retrievalHit: false,
        answer: "(pipeline returned the no-sources fallback)",
        judgment: {
          faithful: true,
          citationsAccurate: true,
          unsupportedClaims: [],
          misattributedClaims: [],
          claimCount: 0,
        },
        hedged: true,
        hedgeNote: "No chunks retrieved; pipeline correctly refuses rather than inventing an answer.",
      });
      continue;
    }

    // The production composer, research-context-only (what chat runs for
    // corpus questions — child-data blocks are excluded so the judge grades
    // pure citation faithfulness).
    const answer = await composeAnswer({
      question,
      months,
      childName,
      history: [],
      ctx: { blocks: [], retrieved, citations: toCitations(retrieved) },
    });

    // Claim-decomposed judging: narrow yes/no checks instead of one holistic
    // grade — the piece that keeps this meaningful on a small judge model.
    const claims = await extractClaims(answer);
    const verdicts = await verifyClaims(
      claims,
      retrieved.map((r) => ({ title: r.title, text: r.text })),
    );
    const judgment = rollUpVerdicts(claims, verdicts);
    const hedging = await checkHedging(answer, question);

    console.log(
      judgment.faithful ? `✓ faithful (${judgment.claimCount} claims)` : `✗ UNFAITHFUL (${judgment.unsupportedClaims.length}/${judgment.claimCount} claims)`,
    );
    results.push({
      question,
      sourceDocId: src.documentId,
      retrievalHit,
      answer,
      judgment,
      hedged: hedging.appropriately_hedged,
      hedgeNote: hedging.note,
    });
  }

  const n = results.length;
  const faithful = results.filter((r) => r.judgment.faithful).length;
  const hits = results.filter((r) => r.retrievalHit).length;
  const citOk = results.filter((r) => r.judgment.citationsAccurate).length;
  const hedged = results.filter((r) => r.hedged).length;
  const totalClaims = results.reduce((s, r) => s + r.judgment.claimCount, 0);
  const badClaims = results.reduce((s, r) => s + r.judgment.unsupportedClaims.length, 0);
  const pct = (x: number, of = n) => `${((100 * x) / Math.max(1, of)).toFixed(0)}%`;

  const date = new Date().toISOString().slice(0, 10);
  const report = `# RAG eval — ${date}

${n} questions · child age ${months} months · model under test: local qwen3 pipeline · judge: ${judgeLabel}
${claudeAvailable() ? "" : "\n> ⚠️ Self-judged run: the judge shares the model under test. Claim-level decomposition keeps this useful for TRENDS between runs; don't read the absolute scores as ground truth.\n"}
| Metric | Score |
| --- | --- |
| Faithful answers (every claim grounded) | ${faithful}/${n} (${pct(faithful)}) |
| Citation markers accurate | ${citOk}/${n} (${pct(citOk)}) |
| Retrieval hit (source doc in top-8) | ${hits}/${n} (${pct(hits)}) |
| Appropriately hedged | ${hedged}/${n} (${pct(hedged)}) |
| Claim-level: unsupported / total | ${badClaims}/${totalClaims} (${pct(badClaims, totalClaims)}) |

## Cases

${results
  .map(
    (r, i) => `### ${i + 1}. ${r.question}

- faithful: **${r.judgment.faithful}** (${r.judgment.claimCount} claims) · citations accurate: ${r.judgment.citationsAccurate} · retrieval hit: ${r.retrievalHit} · hedged: ${r.hedged}
${r.judgment.unsupportedClaims.length > 0 ? `- unsupported claims:\n${r.judgment.unsupportedClaims.map((c) => `  - "${c}"`).join("\n")}` : ""}
${r.judgment.misattributedClaims.length > 0 ? `- supported but wrongly cited:\n${r.judgment.misattributedClaims.map((c) => `  - "${c}"`).join("\n")}` : ""}
- hedging: ${r.hedgeNote}

<details><summary>answer</summary>

${r.answer.trim()}

</details>`,
  )
  .join("\n\n")}
`;

  const outDir = path.resolve(process.cwd(), "../../data/evals");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `rag-eval-${date}.md`);
  fs.writeFileSync(outPath, report);
  fs.writeFileSync(outPath.replace(/\.md$/, ".json"), JSON.stringify(results, null, 2));

  console.log(
    `\nfaithful ${pct(faithful)} · citations ${pct(citOk)} · retrieval-hit ${pct(hits)} · hedged ${pct(hedged)} · bad claims ${badClaims}/${totalClaims}`,
  );
  console.log(`report: ${outPath}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
