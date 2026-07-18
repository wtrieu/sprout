# Sprout — agent guide

Self-hosted family/parenting companion (Mac mini): a citation-first RAG
research copilot over pediatric sources + a storybook/activities generator,
sharing an age engine.

## Layout

- `apps/web` — Next.js 15 app (React 19, TS 5.7, SQLite + Drizzle, Tailwind
  v4, Zod). Port 3100. Source in `src/app` (pages + API routes), `src/lib`
  (rag, crawler, jobs, executors, embeddings, ollama, email, digest, growth,
  auth), `src/db` (schema + migrations).
- `services/imagegen` — Python image worker (uv, mflux/MLX).
- `scripts/` — job runners and seeds. `infra/` — launchd + cloudflared.
- pnpm workspace (pnpm 10, Node >= 22); `packages/` slot exists but is empty.

## Quality gates

From the repo root: `pnpm typecheck`, `pnpm lint`, and
`pnpm --filter web exec vitest run --passWithNoTests`. Run all three before
opening any PR.

## Scheduled loops

Scheduled maintenance sessions (security, code-quality, docs, tech-debt,
backlog, eng-review) are driven by playbooks in `.claude/loops/`. Their shared
rules live in `.claude/loops/OPERATIONS.md` — most importantly: **never merge,
never push to `main`; all changes go through PRs a human reviews**. Those
rules apply to any session doing automated maintenance here.
