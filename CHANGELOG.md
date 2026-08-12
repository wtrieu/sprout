# Changelog

All notable changes to Sprout are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project isn't
versioned yet, so sections are dated (`## YYYY-MM-DD`), newest first, and
generated from merged pull requests and `git log`.

## 2026-08-12

### Added

- `docs/ARCHITECTURE.md` — the two feature halves, the shared age engine, the
  crawl → SQLite → RAG → UI data flow, the premise-first story engine (now
  `ENGINE_VERSION = 3`), the split illustration paths (Midjourney page prompts
  vs local FLUX character references), the memory-constrained sequential job
  lanes, and the launchd + Cloudflare deployment.
- `CHANGELOG.md` — this file.
- Short READMEs for `scripts/` and `services/imagegen/`.

### Fixed

- README refreshed to current behavior: the storybook half is commissioned from
  a Claude Max subscription (not local qwen3), story **pages** are exported as
  Midjourney prompt briefs the parent renders (local FLUX now renders only the
  per-character reference sheets), and the on-demand "Write a book now" / express
  flow and premise inbox are documented. The "Jobs & automation" table lists the
  daily `job:stories` run and the `docs/` layout entry.
- `apps/web/.env.example` — removed the dead `SPROUT_DAILY_STORY` knob (no code
  reads it; the nightly cadence is governed by the `storyCandidatesPerDay`
  setting on the Stories page) and dropped "story arcs" from the
  `ANTHROPIC_API_KEY` comment (the story engine runs on the Max subscription,
  not the metered API key).

## 2026-08-09

### Fixed

- Midjourney prompts that overran the model's attention window (#66). Shipped
  books averaged ~188 descriptive words, well past the ~70-word ceiling where
  Midjourney stops resolving a prompt, which came back as mis-scaled, misplaced
  background scenery.

## 2026-08-08

### Added

- **Express stories — on-demand "Write a book now" (#64).**
  `scripts/express-story.ts` (`job:express-story`, spawned by
  `POST /api/stories/express`) takes an optional parent request, commissions a
  small premise batch steered by it, keeps only the ranked winner, and writes
  the book immediately through the full stage B+C pipeline. The pending premise
  inbox is never consumed or cluttered.

## 2026-08-07

### Changed

- **Story engine v3 (#60): nonfiction shelf + layered second-look
  illustrations.** `ENGINE_VERSION` bumped 2 → 3. Adds a nonfiction lane and
  layered page art (foreground moment + one scale-anchored background element
  that recurs and pays off across the book).
- **Illustrations moved to Midjourney prompt briefs (#63).** Page art is now
  composed in code (`lib/skills/storyArt.ts`) into length-disciplined Midjourney
  prompts the parent renders externally; a one-paste page-1 style reference
  (`--sref`) carries the look across every page. Local FLUX rendering is retained
  for the per-character reference sheets. Migration `0011` stores the writer's
  raw illustration layers so composer changes reach already-queued books
  (`scripts/rebuild-art-prompts.ts` back-fills books queued before the overhaul).
- **On-demand "Generate now" (#61).** A Stories-page button commissions a story
  immediately; superseded clear-outs stay out of the taste signal.

### Fixed

- `com.sprout.web` PATH: a missing `~/.local/bin` broke direct book-writes
  spawned from the web process (#62).

## 2026-08-04

### Changed

- **Story engine overhaul (#50, #51) — premise-first commissioned library
  (`ENGINE_VERSION = 2`).** Replaced the hardcoded bedtime-prompt template era.
  A nightly frontier-model call proposes premises across genre lanes into a
  parent-reviewed premise inbox (`/premises`); greenlighting writes the book on
  a detached spawn, and an independent editor-judge gates every draft (stages
  A/B/C). Runs on a Claude Max subscription over the headless CLI, with
  `ANTHROPIC_API_KEY` stripped so it can never bill the metered API.
  - **Phase 2:** seed premise corpus, age-banded vocab stretch words, and
    interests/north-stars intake (`/interests`).
  - **Phase 3:** the learning loop — taste distillation into an editorial memo,
    review-as-intake taste signal, and a digest report.
- **World bible (#52): The Nine Cloud Villages.** The `fantasy-world` lane now
  draws on one persistent invented world (`lib/stories/worlds.ts`,
  `docs/world-bible-concepts.md`) that accretes canon instead of resetting
  nightly.

## 2026-07-31

### Added

- Weekly product-ideation loop playbook (#41).

### Fixed

- Resolved `next` specifier drift between `package.json` and the lockfile so CI
  checks pass (#42).

## 2026-07-27

### Security

- Pinned `brace-expansion` `>=5.0.8` to clear CVE-2026-14257 (#33).
- Bound the production web server to loopback `127.0.0.1` (#32).
- Bumped `next` to a patched release to clear advisories (#28).

### Changed

- Upgraded `lucide-react` 0.469 → 1.28 (major) (#36).
- Dependabot minor-and-patch group bump across 12 updates (#24).

## 2026-07-22

### Added

- Stories UX fixes: fixed the finicky mobile delete button on the stories list
  (#31), and stopped injecting the same journal preference + season into every
  story (#30).

## 2026-07-21

### Changed

- Stories quality overhaul (#22): bedtime stories became curated rather than
  fully local — a nightly headless `claude -p` run drafts candidates for human
  review, and the fullscreen reader gained Ken Burns motion.

## 2026-07-20

### Changed

- Landing page redesigned as a painted "paper theater": manifest-driven sky
  layers, Midjourney backdrops, ambient video loops, and copy-scrim legibility
  polish (#18, #19). Retired the earlier low-poly 3D geometry.
- Landing art docs rewritten for the painted pipeline (`docs/landing-art-pipeline.md`).

### Security

- Bumped `tailwind-merge` 2.6.1 → 3.6.0 (#13).

## 2026-07-19

### Added

- Cinematic 3D parallax landing page — a seed's journey from soil to starlight
  (#16) — plus its architecture notes (`docs/landing-page.md`).
- Scheduled agent loop playbooks (`.claude/loops/`), CodeQL, Dependabot, CI,
  and a non-interactive ESLint config for `next lint` (#3).

### Security

- Bumped `next` 15.1.4 → 15.5.20 to clear critical/high advisories (#15).

## 2026-07-07

### Added

- Story craft engine: authored read-aloud forms (rhythmic prose, refrain,
  cumulative, lullaby-rhyme) with an editor-judge revise pass.
- Illustration overhaul with per-(character, style) reference sheets and VLM
  visual QC, autonomy (nightly crawl/classify), the journal, the agentic Ask
  router, and hybrid dense+BM25 retrieval with a relevance floor.

## 2026-07-05

### Added

- Claude-powered synthesis features (visit prep, research briefs, RAG eval,
  corpus audit), then re-engineered to run on local qwen3 via the decomposed,
  skill-based pipelines in `apps/web/src/lib/skills/`.

## 2026-07-03

### Added

- Project scaffold: Next.js + SQLite/Drizzle monorepo, job-queue core, and
  launchd/cloudflared infra.
- Child profile, CDC/WHO seeds, age-scoped RAG chat with citations, growth
  percentiles.
- Source crawlers (PubMed / MedlinePlus / RSS / Open Food Facts), LLM relevance
  filter, job orchestrator, weekly digest, sources/library UI.
- FLUX.2-klein storybook pipeline (ref-conditioned character consistency),
  bedtime reader, PDF export, activity generator, jobs UI.
