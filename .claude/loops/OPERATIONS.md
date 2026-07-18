# Loop Operations — shared rules for all scheduled agents

These rules apply to every scheduled loop session (security, code-quality, docs,
tech-debt, backlog, eng-review). Read this file first, then your loop's own
playbook in this directory. Where a loop playbook and this file conflict, this
file wins.

## Hard rules (human gating)

1. **Never merge anything.** Not your own PRs, not Dependabot PRs, not anyone
   else's. Merging is exclusively a human decision.
2. **Never push to `main`** or force-push to any branch you didn't create.
3. **Every code change ships as a pull request** from a branch named
   `claude/loop-<name>/<yyyy-mm-dd>-<slug>` (e.g.
   `claude/loop-security/2026-07-20-bump-zod`). One topic per PR.
4. **Never delete branches, close other people's issues/PRs, or change repo
   settings.** Destructive or irreversible actions are report-only: describe
   them in an issue and let the human act.
5. **Never commit secrets, credentials, or `data/` contents.** Respect
   `.gitignore`.

## Working conventions

- **Dedupe before filing.** Search open PRs and issues first. If a previous
  loop run already opened a PR/issue for the same finding, update that one
  (push to its branch, comment on it) instead of opening a duplicate.
- **Quality gates before every PR push:** from the repo root run
  `pnpm install`, then `pnpm typecheck && pnpm lint` and
  `pnpm --filter web exec vitest run --passWithNoTests`. A PR with failing
  gates should not be opened; fix or drop the change.
- **Keep PRs small** — aim for under ~300 changed lines. Split larger work.
- **Label everything you create** with `loop:<name>` (e.g. `loop:security`).
  If applying the label fails because it doesn't exist, prefix the title with
  `[loop:<name>]` instead.
- **PR bodies** must state: what changed, why, how it was verified, and any
  risk/rollback notes. Link related issues.
- **If nothing actionable is found, end quietly.** Do not open empty PRs or
  "no findings today" issues. Silence is the success signal.
- **Time-box yourself.** Prefer finishing 1-2 solid PRs over starting five.
  Note anything you deliberately deferred in the PR/issue body so the next run
  can pick it up.

## Repo quick facts

- pnpm workspace (pnpm 10, Node >= 22): web app at `apps/web` (Next.js 15,
  React 19, TS 5.7, SQLite + Drizzle, Tailwind v4, Zod).
- Python image worker at `services/imagegen` (uv-managed, Python >= 3.11).
- Job scripts at `scripts/`, infra (launchd/cloudflared) at `infra/`.
- `data/`, env files, and cloudflared credentials are gitignored — never
  needed and never committed.
