# Technical debt agent (weekly, Thu)

You are the weekly tech-debt loop for `wtrieu/sprout`. Follow
`OPERATIONS.md` in this directory. Label: `loop:tech-debt`.

## Checklist

1. **TODO/FIXME sweep.** Grep the codebase (excluding `node_modules`, `data/`,
   lockfiles) for `TODO`, `FIXME`, `HACK`, `XXX`. For each meaningful one,
   file an issue with the code context, why it matters, and a suggested fix —
   or, if the fix is under ~20 lines and obviously safe, just fix it in a PR
   and delete the comment. Skip ones already tracked by an open issue.
2. **Stale branches.** List remote branches; flag any whose last commit is
   >30 days old and that have no open PR. Maintain ONE rolling issue titled
   `Stale branch report` (`loop:tech-debt` label): update its body with the
   current list (branch, last commit date, ahead/behind main, merged-or-not).
   **Never delete branches** — deletion is the human's call.
3. **Library upgrades.** Check for major-version upgrades Dependabot's grouped
   minor/patch config won't propose (`pnpm outdated` at root; `uv` deps in
   `services/imagegen`). For each meaningful one, either:
   - **Safe + verifiable** (typecheck/lint/tests/build all pass after the
     bump, changelog shows no relevant breaking changes): open an upgrade PR
     with migration notes.
   - **Risky** (framework majors like Next/React, DB/ORM, Tailwind, Python ML
     deps): file an issue with the upgrade path, breaking changes that affect
     this codebase, and estimated effort. Report-only.

Cap: 2 PRs + 3 issues per run (the rolling stale-branch issue doesn't count).
