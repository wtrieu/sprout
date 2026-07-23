# Local-LLM orchestration

Sprout's synthesis features were designed against a frontier model but must run
well on local qwen3:14b. The compensation strategy lives in
`apps/web/src/lib/skills/` and follows four rules:

1. **Decompose** — no pipeline asks the model for a whole coherent document.
   Each call does one narrow thing with a tight zod schema (validated, one
   retry with the error fed back).
2. **Select, don't generate** — where possible the model picks from a list we
   provide (milestone ids, source indices) instead of writing free-form. A
   wrong selection is detectable in code; a hallucinated fact is not.
3. **Assemble in code** — section order, headings, hedging boilerplate, and the
   notes skeleton are deterministic. The model fills slots.
4. **Attach provenance at extraction, validate at assembly** — research
   findings carry their source index from the moment they're extracted, and
   every `[n]` marker is range-checked before the document is stored.

Every call routes through `lib/claude.ts`: with `ANTHROPIC_API_KEY` set it runs
on Claude (same prompts — they're written to lift both models), without it, on
qwen3. The prompts embed few-shot exemplars authored on Claude Fable so the
frontier model's taste is baked in even when it's gone.

## Pipeline decompositions

| Pipeline | Steps (each = one small call) | Code-side |
|---|---|---|
| Visit prep | ① chat history + concerns → themes ② milestone checklist → talking-point *selection* ③ themes + growth → doctor questions ④ snapshot paragraph | WHO percentiles computed, never generated; markdown assembly; notes skeleton |
| Research briefs | ① sub-query plan ② findings extraction per ≤4-source batch (source index attached at birth) ③④⑤ three sections written from findings only | dedupe/rank retrieval, `[n]` range validation, assembly |
| RAG eval | ① one eval question per chunk ② claim extraction from answer ③ per-claim verification against context ④ hedging check | retrieval-hit, verdict roll-up (faithful = zero unsupported claims), report |
| Corpus audit | re-grade / staleness / suggestion review in batches of ≤8-10 docs | batching, report; always report-only |
| Agentic Ask | ① intent classification (research/growth/milestones/journal) ② final composition with conversation history | growth percentiles, milestone checklist, and journal blocks built deterministically; citations from retrieval only |
| Image QC | ① targeted yes/no defect questions per render (VLM) | verdict + retry policy in code; seeds re-rolled via render_attempts; bounded at 2 re-rolls |

## Story candidates (not local)

Stories left the local-LLM path entirely: local generation (qwen3 text + FLUX
pages) never reached bedtime quality, so `scripts/nightly-story-candidates.ts`
now runs a headless `claude -p` (Max-subscription OAuth; `ANTHROPIC_API_KEY`
is stripped from the child env so runs can never bill the API) that drafts
two candidates a day for human review, with illustrations hand-made in
Midjourney and uploaded through the app. The same decomposition philosophy
still applies: ingredients (form, art pack, milestone theme, season) are
picked in code with variety memory, prompts are composed in code
(`lib/skills/storyArt.ts`), and every draft passes the mechanical craft checks
in `lib/skills/storyText.ts` (age-banded word budgets, refrain recurrence,
rhyme-bank membership) before it may enter the DB
(`lib/stories/importCandidate.ts`). The authored story forms — rhythmic-prose,
refrain, cumulative, lullaby-rhyme, goodnight-catalog, question-answer,
journey-home — remain the writing contract, each borrowed from a classic
picture-book structure. Setting is likewise a code-picked ingredient
(`lib/stories/planning.ts` settingBank) so the model can't drift back to the
same beach every July.

## Retrieval

`retrieve()` is hybrid: dense cosine (nomic-embed) fused with in-memory BM25
via reciprocal-rank fusion, then a calibrated cosine floor (0.48) drops
matches the corpus plainly doesn't cover — an off-corpus question now gets an
honest "no sources" instead of an answer synthesized from noise. Calibration
data (this corpus): on-topic 0.55-0.69, adjacent 0.52-0.57, junk 0.42-0.44.
Re-calibrate the floor if the embedding model changes.

## Quality levers (in `lib/ollama.ts` options)

- **`think: true`** — enables qwen3's thinking mode. Used on judgment-heavy
  steps (claim verification, findings extraction, theme summarization,
  re-grades). Costs latency, buys accuracy. If a step regresses, this is the
  first thing to check.
- **`numCtx`** — Ollama's default 4096-token window **silently truncates long
  prompts from the front**. Any retrieval-stuffed call sets it explicitly
  (chat: 12288; findings extraction: 10240; claim verification: 12288).
  Bigger windows cost KV-cache RAM — keep them honest on the 24GB box.
- **Few-shot exemplars** — each generative prompt carries 1-2 authored
  examples. When output style drifts, improve the exemplar rather than adding
  rules; small models imitate better than they obey.
- **Batch sizes** — audit batches of 8, extraction batches of 4. Raising them
  saves calls but degrades per-item attention; lower before you raise.

## Regression testing a model change

`eval:rag` is the net. Run it before and after any model/prompt change:

```bash
pnpm --filter web run eval:rag 15
```

Reports land in `data/evals/`. Without an API key the judge is the local model
itself — the claim-by-claim decomposition keeps that meaningful for **trends**
(fewer/more unsupported claims than last run), but don't read self-judged
absolute scores as ground truth. When you temporarily have a key (or borrow a
machine that does), run one Claude-judged eval to calibrate the self-judged
numbers against it.

## Known trade-offs after the switch

- Latency: visit prep ≈ 4 sequential local calls; a research brief ≈ 7-10.
  Minutes, not seconds. The UIs say so.
- The eval and audit become self-graded. Their framing (audit ≠ classify,
  verify-one-claim ≠ write-the-answer) preserves signal, but absolute scores
  drift optimistic. Treat disagreement counts as leads.
