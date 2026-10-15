# Architecture

Sprout is a self-hosted family companion that runs entirely on a 24GB Mac mini.
It has **two feature halves** joined by a **shared age engine**, and everything
heavy funnels through **one sequential job orchestrator** so the large models
never fight for memory.

```
                       ┌──────────────────────────────┐
                       │  Next.js app (apps/web, :3100)│
                       │  UI pages + API routes + libs │
                       └───────────────┬──────────────┘
                                       │ reads/writes
                             ┌─────────▼─────────┐
                             │  SQLite + Drizzle │  (data/sprout.db)
                             └─────────▲─────────┘
                                       │ claim/complete jobs
   crawlers ──enqueue──►  jobs queue  ─┤
   web "run now" ────────►(network/    │
   nightly scripts ──────► llm/        │──► run-jobs.ts orchestrator
                           imagegen)   │      ├─ llm lane   → Ollama (qwen3)
                                       │      └─ imagegen   → Python FLUX worker
                                       │                        + QC VLM re-rolls
```

## The two halves

### 1. Research copilot (citation-first RAG)

Age-aware retrieval over authoritative pediatric sources (CDC, WHO, PubMed,
MedlinePlus, Open Food Facts).

- **Ingest.** `lib/crawler/*` fetches each enabled source (`pubmed.ts`,
  `medlineplus.ts`, `rss.ts`, `openfoodfacts.ts`, dispatched through
  `registry.ts`). `lib/crawl.ts` runs them, stores raw `documents`, and enqueues
  an LLM `relevance` classification plus an `embed_doc` job per new document.
- **Classify & embed.** `lib/executors.ts` runs the `relevance` prompt
  (relevant?, age window, topic tags) and `embed_doc` (chunk → `nomic-embed-text`
  vectors), writing `chunks` with embeddings.
- **Retrieve.** `lib/rag.ts` `retrieve()` is hybrid: dense cosine fused with
  in-memory BM25 via reciprocal-rank fusion, then a calibrated cosine floor
  (0.48) that returns an honest "no sources" for off-corpus questions.
- **Answer.** The agentic Ask pipeline (`lib/skills/ask.ts`) classifies intent
  (research / growth / milestones / journal) and composes an answer whose growth
  math, milestone checklist, and journal blocks are built deterministically in
  code; only corpus citations come from retrieval.
- **Research briefs** (`lib/skills/research.ts`) add a live PubMed sweep and a
  decomposed, provenance-tracked write-up.

### 2. Storybook & activities generator

- **Story candidates** (`scripts/nightly-story-candidates.ts`) are drafted by a
  headless `claude -p` run, not the local model — local generation never reached
  bedtime quality. Ingredients (form, art pack, milestone theme, season) are
  picked in code with variety memory; drafts must pass mechanical craft checks
  (`lib/skills/storyText.ts`) before entering the DB via
  `lib/stories/importCandidate.ts`. Illustrations are made in Midjourney and
  uploaded through the app; the fullscreen reader (`lib/stories/motion.ts`) adds
  Ken Burns motion, and `lib/stories/finalize.ts` builds the printable PDF.
- **Activities** (`scripts/weekly-activities.ts` → `activities` executor)
  generate age-appropriate ideas constrained to materials the family owns
  (`materials` / `user_materials`).

The local-LLM compensation strategy (decompose, select-don't-generate,
assemble-in-code, provenance-at-extraction) is documented in
`local-llm-orchestration.md`.

## Shared age engine

`lib/age.ts` converts a child's DOB to months/days and exposes `ageWindow()`
and `formatAge()`. Every feature scopes to the child's age through it: RAG
filters documents by age window, growth uses WHO LMS percentiles
(`lib/growth.ts`), milestones surface the current CDC bucket, and story/activity
generation targets the current milestone band.

## Data flow

1. **Crawlers → SQLite/Drizzle.** New material lands in `documents`, then LLM
   jobs enrich it into classified, embedded `chunks`.
2. **SQLite → RAG → UI.** Chat and research read `chunks` through `retrieve()`
   and render cited answers in the Next.js app.
3. **Job queue → executors → workers.** UI actions and nightly scripts
   `enqueue()` work; the orchestrator drains it against Ollama or the Python
   FLUX worker.

## Memory-constrained sequential lanes

The box has 24GB; qwen3:14b (~9GB) and FLUX (~10-12GB) cannot coexist.
`scripts/run-jobs.ts` is the **only** process that executes queued jobs, guarded
by a single-row `job_lock` (stale after 2h). It runs lanes strictly in sequence:

1. Drain the **llm** lane (relevance, embeddings, activities) through Ollama.
2. Unload Ollama (`keep_alive:0` + `ollama stop`) to free the chat model.
3. Spawn `services/imagegen/worker.py` in **drain-and-exit** mode: it loads FLUX
   once, renders everything pending, then dies — releasing its memory.
4. Grade fresh renders with a QC VLM (`qwen2.5vl:7b`, falling back to
   `gemma3:12b`), re-queueing failed seeds with a bumped `render_attempts`,
   bounded at 2 re-rolls. FLUX exits before the VLM loads, and vice versa.

Because a batch holds the lock, live chat returns a friendly 503 while jobs run.
Job lanes are `network`, `llm`, `imagegen`; job types include `crawl_source`,
`relevance`, `embed_doc`, `char_reference`, `digest`, and `activities`
(`apps/web/src/db/schema.ts`).

## Deployment

Everything runs under **launchd** on the Mac mini, exposed through a **Cloudflare
Tunnel + Access** (email allowlist). The agents in `infra/launchd/` are:

| Agent | What it runs | Schedule |
|---|---|---|
| `com.sprout.web` | `pnpm --filter web start` (port 3100) | RunAtLoad |
| `com.sprout.nightly` | `job:nightly` (crawl → classify/embed → images) | 02:30 daily |
| `com.sprout.stories` | `job:stories` (Claude story candidates) | 05:00 daily |
| `com.sprout.activities` | `job:activities` | Sun 06:00 |
| `com.sprout.digest` | `job:digest` (weekly email) | Sun 06:30 |
| `com.sprout.cloudflared` | Cloudflare tunnel | RunAtLoad |

Tunnel config lives in `infra/cloudflared/config.yml`; logs land in
`/tmp/sprout-*.log`.
