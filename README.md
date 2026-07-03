# Sprout

Self-hosted family companion on the Mac mini. Two halves, one age engine:

- **Research copilot** — age-aware, citation-first RAG over authoritative pediatric
  sources (CDC, WHO, PubMed, MedlinePlus). Low touch: a nightly crawler ingests and
  auto-classifies new material, a weekly digest email arrives Sunday morning, and
  newly discovered sources queue for one-click approval.
- **Storybook & activities** — locally generated bedtime stories (qwen3 text +
  FLUX.2-klein illustrations, fullscreen reader + printable PDF) and weekly
  age-appropriate activity ideas that only use materials you own.

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
