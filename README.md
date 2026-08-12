# Sprout

Self-hosted family companion on the Mac mini. Two halves, one age engine:

- **Research copilot** — age-aware, citation-first RAG over authoritative pediatric
  sources (CDC, WHO, PubMed, MedlinePlus). Ask routes each question to what it
  needs — corpus retrieval (hybrid dense+BM25 with a relevance floor), the
  child's own growth math, the CDC milestone checklist, or the journal — and
  follows conversation history. Low touch: a nightly crawler ingests and
  auto-classifies new material, a weekly digest email arrives Sunday morning, and
  newly discovered sources queue for one-click approval.
- **Storybook & activities** — bedtime stories commissioned through a
  premise-first engine you curate (text drafted on a Claude Max subscription;
  page art exported as Midjourney prompts you render; fullscreen reader +
  printable PDF), plus weekly age-appropriate activity ideas that only use
  materials you own.

## Synthesis features

The research-side features below run locally on qwen3 via decomposed,
skill-based pipelines (`apps/web/src/lib/skills/` — see
`docs/local-llm-orchestration.md`); optionally set `ANTHROPIC_API_KEY` (+
`CLAUDE_MODEL`) to run the same pipelines on Claude for a quality lift. The
story features run on a Claude Max subscription over the headless CLI (local
generation never reached bedtime quality) — see `docs/ARCHITECTURE.md`:

- **Visit prep** (`/visit-prep`) — one-page pediatrician-appointment brief:
  WHO percentiles, milestone talking points, questions synthesized from recent
  chat history and typed-in concerns. Printable.
- **Premise inbox** (`/premises`) — the nightly engine proposes story premises
  across genre lanes; you greenlight or pass, and greenlit premises are written
  into full drafts (`/stories`) within minutes. Unreviewed premises are
  auto-picked after a window so the shelf never runs dry.
- **Write a book now** — the `/stories` "Generate now" button (and the express
  flow behind it) commissions one book on demand from an optional topic, skipping
  the premise inbox entirely.
- **Research briefs** (`/research`) — deep dive on one topic: corpus sweep +
  live PubMed search, synthesized with citations.
- **Journal** (`/journal`) — persistent facts about the child: quick notes,
  current loves, milestone checklist, measurement history. Auto-fed nightly by
  extracting stated facts from chat questions; personalizes stories,
  activities, visit briefs, and the digest.
- **Interests & taste** (`/interests`) — durable "north-stars" and decaying
  interests, proposed nightly from your chat journal and never auto-added,
  steer premise generation. One-tap reject/pass chips feed a weekly taste
  distillation that tunes the editor. Cadence is set by the
  `storyCandidatesPerDay` setting on the Stories page.
- **Story craft forms** — story text is written against authored read-aloud
  forms (rhythmic prose, refrain, cumulative list; rhyming lullabies), with
  age-banded word budgets and an editor-judge revision pass.
- **RAG eval** — `pnpm --filter web run eval:rag [n]` generates questions from
  the corpus, runs the production qwen3 pipeline, and has Claude judge citation
  faithfulness (report in `data/evals/`). Requires the API key.
- **Corpus audit** — `pnpm --filter web run job:audit` re-grades relevance
  decisions, flags stale guidance, reviews pending source suggestions
  (report-only, in `data/audits/`). Requires the API key.

## Stack

Next.js 15 (App Router) · TypeScript · SQLite + Drizzle · Tailwind v4 · Ollama
(qwen3:14b + nomic-embed-text) · Claude Max via headless CLI (story text) ·
Midjourney prompts (story page art) · mflux/MLX (FLUX.2-klein-4B, 4-bit — story
character references) · launchd · Cloudflare Tunnel + Access. Web runs on port
**3100** (Pulse owns 3000).

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

Image generation (one-time, for character reference sheets):

```bash
brew install uv
cd services/imagegen && uv sync
uv run gen_reference.py "a cheerful toddler with..." /tmp/test.png   # downloads weights, ~10min first run
```

## Story illustrations

Story **pages** are exported as Midjourney prompt briefs. The engine composes
each page's prompt in code (`apps/web/src/lib/skills/storyArt.ts`) from a shared
per-pack style DNA, the canonical character block, and the page's layered scene,
holding every prompt under a hard word ceiling (Midjourney stops resolving a
prompt past ~70 words). You render the prompts in Midjourney, paste the chosen
page-1 image URL once, and the review UI appends `--sref <url>` to every later
page so the whole book holds one look.

Story **character reference sheets** are rendered locally by the FLUX worker
(`services/imagegen/`) and graded by a local vision model:

```bash
ollama pull qwen2.5vl:7b        # ~6GB; QC is skipped gracefully if absent
```

If the configured VLM isn't pulled, QC falls back to `gemma3:12b` when present
(also multimodal). References render at `SPROUT_IMAGE_REF_STEPS` (default 10) —
raise it if quality matters more than batch time. See
`services/imagegen/README.md`.

## Jobs & automation

| Job | Schedule (launchd) | Manual |
|---|---|---|
| Nightly pipeline (crawl → journal/interest extraction → classify/embed → character refs) | 02:30 daily | `pnpm --filter web run job:nightly` |
| Story engine (premise-first, stages A/B/C) | 05:00 daily | `pnpm --filter web run job:stories` |
| Weekly activities | Sun 06:00 | `pnpm --filter web run job:activities` |
| Weekly digest email | Sun 06:30 | `pnpm --filter web run job:digest` |
| Drain queue only | — | `pnpm --filter web run job:run` |

The story engine bills a Claude Max subscription via the headless CLI (the
`ANTHROPIC_API_KEY` is stripped from its env so it can never fall back to
metered API billing) — see `scripts/nightly-story-candidates.ts` and
`docs/ARCHITECTURE.md`.

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
services/imagegen/   # Python (uv) FLUX worker — drain-and-exit (character refs)
scripts/             # seeds + job entrypoints (run via pnpm --filter web)
infra/               # launchd plists + cloudflared config
docs/                # architecture, orchestration, and landing-page notes
data/                # sqlite db + generated images (gitignored)
```

See `docs/ARCHITECTURE.md` for how the two halves, the shared age engine, and
the sequential job lanes fit together.

## Content licensing notes

- CDC milestones: vendored JSON (public domain) in `scripts/data/`.
- WHO growth standards: fetched from WHO's official GitHub (public domain).
- PubMed abstracts / MedlinePlus: public domain, fetched via official APIs.
- AAP HealthyChildren RSS: **copyrighted** — stored as title+summary+deep link
  only (`fetch_policy=summary_link_only`), never republished.

Sprout summarizes sources; it is not medical advice.
