# scripts — seeds & job entrypoints

Standalone TypeScript entrypoints run through the web workspace with `tsx`
(they import from `apps/web/src`). Invoke them via the pnpm aliases in
`apps/web/package.json` — e.g. `pnpm --filter web run job:nightly` — so paths
and env resolve correctly. `env.ts` loads `apps/web/.env.local` in dev; launchd
env wins in production.

## Seeds (`pnpm --filter web db:seed` runs all four)

| Script | Seeds |
|---|---|
| `seed-sources.ts` | crawlable source registry (PubMed, MedlinePlus, AAP RSS, Open Food Facts) |
| `seed-milestones.ts` | CDC milestone checklist (+ embeddings) |
| `seed-who-lms.ts` | WHO growth-standard LMS tables |
| `seed-materials.ts` | household materials for the activity generator |

## Jobs & tools

| Script | Alias | What it does |
|---|---|---|
| `run-jobs.ts` | `job:run` | **The** orchestrator — drains llm then imagegen lanes sequentially under a job lock (see `docs/ARCHITECTURE.md`) |
| `nightly-pipeline.ts` | `job:nightly` | Crawl all sources + journal extraction, then hand off to `run-jobs` (launchd 02:30) |
| `nightly-story-candidates.ts` | `job:stories` | Draft 2 bedtime-story candidates via headless `claude -p` for review (launchd 05:00) |
| `weekly-activities.ts` | `job:activities` | Enqueue the weekly activity generation (launchd Sun 06:00) |
| `weekly-digest.ts` | `job:digest` | Send the weekly digest email (launchd Sun 06:30) |
| `eval-rag.ts` | `eval:rag` | Generate corpus questions, run the qwen3 pipeline, judge citation faithfulness (needs `ANTHROPIC_API_KEY`) |
| `corpus-audit.ts` | `job:audit` | Re-grade relevance, flag stale guidance, review pending sources (report-only; needs `ANTHROPIC_API_KEY`) |
| `import-story-candidate.ts` | `story:import` | Import a story-candidate JSON file into the DB after craft-check validation |

Reports from `eval:rag` and `job:audit` land in `data/evals/` and `data/audits/`
(gitignored).
