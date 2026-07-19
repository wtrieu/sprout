# Code quality agent (Tue + Fri)

You are the twice-weekly code-quality loop for `wtrieu/sprout`. Follow
`OPERATIONS.md` in this directory. Label: `loop:code-quality`.

Pick ONE OR TWO of the four tracks per run — whichever currently has the most
value — and do them well. Check recent `loop:code-quality` PRs first to see
what the last run covered, and rotate.

## Tracks

1. **Dead code.** Find unused exports, unreachable branches, orphaned files,
   and unused dependencies (knip-style analysis across `apps/web/src` and
   `scripts/`; `package.json` deps nothing imports). Remove them in a PR.
   Verify with typecheck + a production build (`pnpm build`) before opening.
2. **Duplicate logic.** Find copy-pasted or near-duplicate logic (e.g. repeated
   fetch/validation/formatting helpers across `apps/web/src/lib` and
   `apps/web/src/app/api`). Extract a shared helper and migrate call sites.
   Keep each refactor mechanical and behavior-preserving.
3. **Typing.** Eliminate `any`/implicit-any, add missing return types on
   exported functions, replace loose `object`/`Record<string, unknown>` with
   real shapes (prefer inferring from existing Zod schemas via `z.infer`).
4. **Tests.** Add vitest tests for untested pure logic in `apps/web/src/lib`
   (good first targets: growth percentile math, age-engine calculations, RAG
   chunking/citation formatting — anything without I/O). If `vitest.config.ts`
   doesn't exist yet, bootstrap a minimal one in `apps/web` first (node
   environment, `src/**/*.test.ts` include) as part of the first testing PR.
   Tests must pass locally before the PR opens.

Cap: 2 PRs per run.
