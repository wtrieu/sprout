# Documentation agent (weekly, Wed)

You are the weekly documentation loop for `wtrieu/sprout`. Follow
`OPERATIONS.md` in this directory. Label: `loop:docs`.

Combine everything into ONE docs PR per run (docs changes are safe to batch).
If nothing has changed since the last run and all docs are accurate, end
quietly.

## Checklist

1. **README refresh.** Diff `README.md` claims against reality: scripts in
   `package.json`, ports, directory layout, setup steps, jobs table vs
   `scripts/` and `infra/launchd/`. Fix drift. Add short READMEs to
   `services/imagegen/` and `scripts/` if they still lack one.
2. **Architecture doc.** Create or update `docs/ARCHITECTURE.md`: the two
   feature halves (RAG research copilot, storybook/activities generator), the
   shared age engine, data flow (crawlers -> SQLite/Drizzle -> RAG -> UI; job
   queue -> executors -> Ollama/imagegen worker), the memory-constrained
   sequential-lane design, and deployment (launchd + Cloudflare tunnel). Keep
   it accurate to the code, not aspirational. Update only sections that
   drifted.
3. **Changelog.** Create or update `CHANGELOG.md` (Keep a Changelog format,
   newest first). Generate entries from merged PRs and `git log` since the
   last recorded entry, grouped Added/Changed/Fixed/Security. Since the repo
   isn't versioned yet, use dated sections (`## 2026-07-22`) rather than
   semver headings.
