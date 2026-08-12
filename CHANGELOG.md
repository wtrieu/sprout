# Changelog

All notable changes to Sprout are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project isn't
versioned yet, so sections are dated (`## YYYY-MM-DD`), newest first, and
generated from merged pull requests and `git log`.

## 2026-08-05

### Added

- `docs/ARCHITECTURE.md` — the two feature halves, the shared age engine, the
  crawl → SQLite → RAG → UI data flow, the premise-first story engine, the
  memory-constrained sequential job lanes, and the launchd + Cloudflare
  deployment.
- `CHANGELOG.md` — this file.
- Short READMEs for `scripts/` and `services/imagegen/`.

### Fixed

- README refreshed for the premise-first story engine: the storybook half is
  now commissioned from a Claude Max subscription (not local qwen3), the daily
  story flows through the premise inbox (governed by the `storyCandidatesPerDay`
  setting, not the removed `SPROUT_DAILY_STORY` env), and the "Jobs &
  automation" table lists the daily `job:stories` run. Layout section adds
  `docs/`.

## 2026-08-04

### Changed

- **Story engine overhaul (#50, #51) — premise-first commissioned library
  (`ENGINE_VERSION = 2`).** Replaced the hardcoded bedtime-prompt template era.
  A nightly frontier-model call proposes premises across nine genre lanes into a
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
