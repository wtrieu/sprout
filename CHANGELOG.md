# Changelog

All notable changes to Sprout are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project isn't
versioned yet, so sections are dated (`## YYYY-MM-DD`), newest first, and
generated from merged pull requests and `git log`.

## 2026-07-22

### Added

- `docs/ARCHITECTURE.md` — the two feature halves, the shared age engine, the
  crawl → SQLite → RAG → UI data flow, the memory-constrained sequential job
  lanes, and the launchd + Cloudflare deployment.
- `CHANGELOG.md` — this file.
- Short READMEs for `scripts/` and `services/imagegen/`.

### Fixed

- README "Jobs & automation" table now lists the daily story-candidate job
  (`job:stories` / `com.sprout.stories`, 05:00), which shipped in
  `infra/launchd/` but was undocumented. Layout section adds `docs/`.

## 2026-07-21

### Changed

- Stories quality overhaul (#22): bedtime stories are now curated rather than
  fully local — a nightly headless `claude -p` run drafts candidates for human
  review, illustrations are hand-made in Midjourney and uploaded through the
  app, and the fullscreen reader gained Ken Burns motion.

## 2026-07-20

### Changed

- Landing page redesigned as a painted "paper theater": manifest-driven sky
  layers, Niji 7 Midjourney backdrops, ambient video loops, and copy-scrim
  legibility polish (#18, #19). Retired the earlier low-poly 3D geometry.
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
- Phase 6: illustration overhaul with per-(character, style) reference sheets
  and VLM visual QC, autonomy (nightly crawl/classify), the journal, the
  agentic Ask router, and hybrid dense+BM25 retrieval with a relevance floor.

## 2026-07-05

### Added

- Phase 5: Claude-powered synthesis features (visit prep, research briefs, RAG
  eval, corpus audit), then re-engineered to run on local qwen3 via the
  decomposed, skill-based pipelines in `apps/web/src/lib/skills/`.

## 2026-07-03

### Added

- Project scaffold: Next.js + SQLite/Drizzle monorepo, job-queue core, and
  launchd/cloudflared infra.
- Phase 1: child profile, CDC/WHO seeds, age-scoped RAG chat with citations,
  growth percentiles.
- Phase 2: source crawlers (PubMed / MedlinePlus / RSS / Open Food Facts), LLM
  relevance filter, job orchestrator, weekly digest, sources/library UI.
- Phases 3–4: FLUX.2-klein storybook pipeline (ref-conditioned character
  consistency), bedtime reader, PDF export, activity generator, jobs UI.
