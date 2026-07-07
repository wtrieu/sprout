# Sprout

Self-hosted family companion on the Mac mini. Two halves, one age engine:

- **Research copilot** — age-aware, citation-first RAG over authoritative pediatric
  sources (CDC, WHO, PubMed, MedlinePlus). Ask routes each question to what it
  needs — corpus retrieval (hybrid dense+BM25 with a relevance floor), the
  child's own growth math, the CDC milestone checklist, or the journal — and
  follows conversation history. Low touch: a nightly crawler ingests and
  auto-classifies new material, a weekly digest email arrives Sunday morning, and
  newly discovered sources queue for one-click approval.
- **Storybook & activities** — locally generated bedtime stories (qwen3 text +
  FLUX.2-klein illustrations, fullscreen reader + printable PDF) and weekly
  age-appropriate activity ideas that only use materials you own.

## Synthesis features

All of the below run locally on qwen3 via decomposed, skill-based pipelines
(`apps/web/src/lib/skills/` — see `docs/local-llm-orchestration.md`).
Optionally set `ANTHROPIC_API_KEY` (+ `CLAUDE_MODEL`) to run the same pipelines
on Claude for a quality lift:

- **Visit prep** (`/visit-prep`) — one-page pediatrician-appointment brief:
  WHO percentiles, milestone talking points, questions synthesized from recent
  chat history and typed-in concerns. Printable.
- **Story arcs** (`/stories`) — a connected mini-series where each story gently
  models a skill from the child's current milestone bucket.
- **Research briefs** (`/research`) — deep dive on one topic: corpus sweep +
  live PubMed search, synthesized with citations.
- **Journal** (`/journal`) — persistent facts about the child: quick notes,
  current loves, milestone checklist, measurement history. Auto-fed nightly by
  extracting stated facts from chat questions; personalizes stories,
  activities, visit briefs, and the digest.
- **Daily surprise story** — the nightly pipeline plans one story per day
  (skipped if you made one yourself): least-recently-used style and character,
  a frontier milestone theme, seasonal flavor. Disable with
  `SPROUT_DAILY_STORY=false`.
- **RAG eval** — `pnpm --filter web run eval:rag [n]` generates questions from
  the corpus, runs the production qwen3 pipeline, and has Claude judge citation
  faithfulness (report in `data/evals/`). Requires the API key.
- **Corpus audit** — `pnpm --filter web run job:audit` re-grades relevance
  decisions, flags stale guidance, reviews pending source suggestions
  (report-only, in `data/audits/`). Requires the API key.

## Stack

Next.js 15 (App Router) · TypeScript · SQLite + Drizzle · Tailwind v4 · Ollama
(qwen3:14b + nomic-embed-text) · mflux/MLX (FLUX.2-klein-4B, 4-bit) · launchd ·
Cloudflare Tunnel + Access. Web runs on port **3100** (Pulse owns 3000).

## Memory discipline (24GB)

qwen3:14b (~9GB) and FLUX (~10GB) cannot coexist. `scripts/run-jobs.ts` is the
only thing that executes queued jobs and it runs lanes strictly in sequence:
llm jobs → unload Ollama → spawn the Python image worker (drain-and-exit, so the
process dying releases the memory). Chat returns a friendly 503 while a batch
holds the lock.

## Quickstart

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
ollama pull qwen3:14b && ollama pull nomic-embed-text
pnpm --filter web db:generate && pnpm --filter web db:migrate
pnpm --filter web db:seed              # sources, CDC milestones (+embeddings), WHO LMS, materials
pnpm --filter web dev                  # http://localhost:3100
```

Image generation (one-time):

```bash
brew install uv
cd services/imagegen && uv sync
uv run gen_reference.py "a cheerful toddler with..." /tmp/test.png   # downloads weights, ~10min first run
```

## Illustration styles & visual QC

Stories pick from 8 art-direction packs (`apps/web/src/lib/stylePacks.json` —
shared with the image worker); each (character, style) pair gets its own
reference sheet so ref-conditioned pages stay on-style. After every image
batch the orchestrator grades renders with a local VLM (anatomy, garbled
areas, stray text) and re-rolls failed seeds, bounded at 2 retries. Enable QC
with:

```bash
ollama pull qwen2.5vl:7b        # ~6GB; QC is skipped gracefully if absent
```

If the configured VLM isn't pulled, QC falls back to `gemma3:12b` when
present (also multimodal). Expect gross defects (stray text, garbled regions,
wrong limb counts) to be caught; borderline soft anatomy can slip past small
vision models.

Reference sheets render at `SPROUT_IMAGE_REF_STEPS` (default 10) and pages at
`SPROUT_IMAGE_STEPS` (default 6) — raise them if quality matters more than
batch time.

## Jobs & automation

| Job | Schedule (launchd) | Manual |
|---|---|---|
| Nightly pipeline (crawl → classify/embed → render images) | 02:30 daily | `pnpm --filter web run job:nightly` |
| Weekly activities | Sun 06:00 | `pnpm --filter web run job:activities` |
| Weekly digest email | Sun 06:30 | `pnpm --filter web run job:digest` |
| Drain queue only | — | `pnpm --filter web run job:run` |

Install launchd agents (after fixing paths/env in the plists):

```bash
cp infra/launchd/com.sprout.*.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.sprout.web.plist        # + the others
```

Logs land in `/tmp/sprout-*.log`.

## Exposure (Cloudflare)

Same pattern as Pulse — see `infra/cloudflared/config.yml` for tunnel setup, then
add an Access application for `sprout.<domain>` allowing your emails, and list the
same emails in `ALLOWED_EMAILS`.

## Layout

```
apps/web/            # Next.js app (UI, API routes, DB, lib)
services/imagegen/   # Python (uv) FLUX worker — drain-and-exit
scripts/             # seeds + job entrypoints (run via pnpm --filter web)
infra/               # launchd plists + cloudflared config
data/                # sqlite db + generated images (gitignored)
```

## Content licensing notes

- CDC milestones: vendored JSON (public domain) in `scripts/data/`.
- WHO growth standards: fetched from WHO's official GitHub (public domain).
- PubMed abstracts / MedlinePlus: public domain, fetched via official APIs.
- AAP HealthyChildren RSS: **copyrighted** — stored as title+summary+deep link
  only (`fetch_policy=summary_link_only`), never republished.

Sprout summarizes sources; it is not medical advice.
