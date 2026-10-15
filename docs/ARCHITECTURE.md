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
MedlinePlus, Open Food Facts). Runs locally on qwen3.

- **Ingest.** `lib/crawler/*` fetches each enabled source (`pubmed.ts`,
  `medlineplus.ts`, `rss.ts`, `openfoodfacts.ts`, dispatched through
  `registry.ts`). `lib/crawl.ts` runs them, stores raw `documents`, and enqueues
  an LLM `relevance` classification plus an `embed_doc` job per new document.
- **Classify & embed.** `lib/executors.ts` runs the `relevance` prompt
  (relevant?, age window, topic tags) and `embed_doc` (chunk → `nomic-embed-text`
  vectors), writing `chunks` with embeddings.
- **Retrieve.** `lib/rag.ts` `retrieve()` is hybrid: dense cosine fused with
  in-memory BM25 via reciprocal-rank fusion, then a calibrated cosine floor
  that returns an honest "no sources" for off-corpus questions.
- **Answer.** The agentic Ask pipeline (`lib/skills/ask.ts`) classifies intent
  (research / growth / milestones / journal) and composes an answer whose growth
  math, milestone checklist, and journal blocks are built deterministically in
  code; only corpus citations come from retrieval.
- **Research briefs** (`lib/skills/research.ts`) add a live PubMed sweep and a
  decomposed, provenance-tracked write-up. **Visit prep**
  (`lib/skills/visitPrep.ts`) and the weekly **digest** (`lib/digest.ts`) reuse
  the same local pipelines. Set `ANTHROPIC_API_KEY` (+ `CLAUDE_MODEL`) to run
  these on Claude for a quality lift.

### 2. Storybook & activities generator

The story *generation* engine is **premise-first** and commissioned from a
Claude Max subscription over the headless CLI (`lib/stories/claudeCli.ts` runs
`claude -p` with `ANTHROPIC_API_KEY` stripped so it can never fall back to
metered API billing). `lib/stories/engine.ts` stamps `ENGINE_VERSION = 2` on
everything it produces; version 1 was the retired hardcoded-prompt "template
era". The nightly run (`scripts/nightly-story-candidates.ts`, launchd
`com.sprout.stories`) has three stages:

- **Stage A — propose.** One frontier-model call (`STORY_MODEL_WRITER`, default
  `claude-fable-5`) proposes a batch of premises across genre lanes
  (`lib/stories/lanes.ts`: bedtime-winddown, myth-retelling, folk-tale,
  pourquoi, little-quest, history-vignette, fantasy-world, funny,
  everyday-wonder). Code ranks them for diversity, lesson dial, and north-star
  share, and they land in the **premise inbox** (`premises` table, `/premises`)
  for the parent to greenlight or pass.
- **Stage B — write.** Greenlighting spawns a detached `job:write-book`
  (`scripts/write-book.ts` → `lib/stories/writeBook.ts`) so the full draft is
  reviewable minutes later; the nightly run also (re)writes greenlit leftovers
  and, as a backstop, auto-picks diverse winners from premises that sat
  unreviewed past `premiseAutoPickHours` (default 48h).
- **Stage C — judge.** Every book passes an independent editor-judge
  (`STORY_MODEL_JUDGE`, default `claude-sonnet-5`) against a rubric (coherence,
  freshness, read-aloud, age fit, lesson subtlety); at most one revision is
  allowed before it becomes a reviewable `draft` or is rejected with the verdict
  stored.

Three memory systems steer generation without touching the model weights:

- **Interests & north-stars** (`lib/stories/interests.ts`, `/interests`,
  `interests` table). North-stars are durable throughlines; interests decay.
  Both start as `suggested` (proposed nightly from the journal) and are never
  auto-added — a parent confirms them.
- **Seeds & vocab** (`lib/stories/seeds/`) supply a curated premise corpus and
  age-banded stretch words.
- **World bible** (`lib/stories/worlds.ts`, `docs/world-bible-concepts.md`) —
  the `fantasy-world` lane draws on one persistent invented world that accretes
  canon instead of resetting nightly.
- **Taste loop** (`lib/stories/taste.ts`). Draft rejections and premise passes
  (one-tap `REJECT_REASONS` chips) are raw taste signal; a weekly distillation
  compresses them into an editorial memo fed back into the premise prompt, and
  rejected drafts past retention are compressed to epitaphs.

**Illustrations** still run locally: `writeBook` picks an art pack
(`lib/skills/storyArt.ts`, 8 packs, shared with the worker via
`lib/stylePacks.json`), and the imagegen lane renders a per-(character, style)
`char_reference` then ref-conditioned pages through the FLUX worker.
`lib/stories/finalize.ts` builds the printable PDF once every page image is
`done`. **Activities** (`scripts/weekly-activities.ts` → `activities` executor)
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

1. Drain the **llm** lane (relevance, embeddings, activities, digest) through
   Ollama.
2. Unload Ollama (`keep_alive:0` + `ollama stop`) to free the chat model.
3. Spawn `services/imagegen/worker.py` in **drain-and-exit** mode: it loads FLUX
   once, renders everything pending, then dies — releasing its memory.
4. Grade fresh renders with a QC VLM (`qwen2.5vl:7b`, falling back to
   `gemma3:12b`), re-queueing failed seeds with a bumped `render_attempts`,
   bounded at 2 re-rolls. FLUX exits before the VLM loads, and vice versa.

Because a batch holds the lock, live chat returns a friendly 503 while jobs run.
Job lanes are `network`, `llm`, `imagegen`; job types are `crawl_source`,
`relevance`, `embed_doc`, `char_reference`, `digest`, and `activities`
(`apps/web/src/db/schema.ts`). Story premises and books are written by the
separate headless-CLI story engine, not through this job queue.

## Deployment

Everything runs under **launchd** on the Mac mini, exposed through a **Cloudflare
Tunnel + Access** (email allowlist). The agents in `infra/launchd/` are:

| Agent | What it runs | Schedule |
|---|---|---|
| `com.sprout.web` | `pnpm --filter web start` (port 3100) | RunAtLoad |
| `com.sprout.nightly` | `job:nightly` (crawl → journal/interest extraction → classify/embed → images) | 02:30 daily |
| `com.sprout.stories` | `job:stories` (premise-first story engine on Claude Max) | 05:00 daily |
| `com.sprout.activities` | `job:activities` | Sun 06:00 |
| `com.sprout.digest` | `job:digest` (weekly email) | Sun 06:30 |
| `com.sprout.cloudflared` | Cloudflare tunnel | RunAtLoad |

Tunnel config lives in `infra/cloudflared/config.yml`; logs land in
`/tmp/sprout-*.log`.
