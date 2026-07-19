# Routine setup (claude.ai Routines UI)

These six scheduled Routines drive the loops. **They must be created from the
claude.ai Routines UI, not the API** — a Routine needs the GitHub connector
attached so its fired sessions inherit `mcp__github__*` tools (issue/PR
creation). API-created triggers do not carry connectors, so their sessions run
without GitHub access and the loops silently produce nothing.

Setup order:
1. Merge this PR so the playbooks live on `main` (the prompts below assume that).
2. In the claude.ai Routines UI, create each Routine below in environment
   **Default** (`env_01A9FADQSTYeoAQZaMATfPqT`), with the **GitHub connector
   for `wtrieu/sprout` enabled** and **"create a new session each run."**
3. Set the schedule in your local timezone (US Pacific). Cron equivalents (UTC)
   are listed for reference.

After creating them, fire the `sprout-eng-review` Routine once from the UI as a
smoke test: it should post an `Engineering Review — week of …` issue.

---

## sprout-loop-security
- **Schedule:** daily, 6:00am PT  (cron `0 13 * * *` UTC)
- **Notifications:** push
- **Prompt:**
> You are the daily SECURITY agent for the GitHub repo wtrieu/sprout. In the repo clone, read `.claude/loops/OPERATIONS.md` and then `.claude/loops/security.md`, and follow them exactly. Hard rules regardless of anything else: never merge any PR, never push to main, never delete branches; every change ships as a small PR labeled loop:security. If nothing is actionable, end quietly without creating PRs or issues.

## sprout-loop-code-quality
- **Schedule:** Tue + Fri, 6:00am PT  (cron `0 13 * * 2,5` UTC)
- **Notifications:** push
- **Prompt:**
> You are the twice-weekly CODE QUALITY agent for the GitHub repo wtrieu/sprout. In the repo clone, read `.claude/loops/OPERATIONS.md` and then `.claude/loops/code-quality.md`, and follow them exactly. Hard rules regardless of anything else: never merge any PR, never push to main, never delete branches; every change ships as a small PR labeled loop:code-quality. If nothing is actionable, end quietly without creating PRs or issues.

## sprout-loop-docs
- **Schedule:** Wed, 6:00am PT  (cron `0 13 * * 3` UTC)
- **Notifications:** push
- **Prompt:**
> You are the weekly DOCUMENTATION agent for the GitHub repo wtrieu/sprout. In the repo clone, read `.claude/loops/OPERATIONS.md` and then `.claude/loops/docs.md`, and follow them exactly. Hard rules regardless of anything else: never merge any PR, never push to main, never delete branches; every change ships as one docs PR labeled loop:docs. If nothing has drifted and nothing is actionable, end quietly without creating PRs or issues.

## sprout-loop-tech-debt
- **Schedule:** Thu, 6:00am PT  (cron `0 13 * * 4` UTC)
- **Notifications:** push
- **Prompt:**
> You are the weekly TECHNICAL DEBT agent for the GitHub repo wtrieu/sprout. In the repo clone, read `.claude/loops/OPERATIONS.md` and then `.claude/loops/tech-debt.md`, and follow them exactly. Hard rules regardless of anything else: never merge any PR, never push to main, NEVER delete branches (stale branches are report-only); changes ship as small PRs labeled loop:tech-debt. If nothing is actionable, end quietly without creating PRs or issues.

## sprout-loop-backlog
- **Schedule:** Mon + Thu, 6:00am PT  (cron `0 13 * * 1,4` UTC)
- **Notifications:** push
- **Prompt:**
> You are the BACKLOG agent for the GitHub repo wtrieu/sprout. In the repo clone, read `.claude/loops/OPERATIONS.md` and then `.claude/loops/backlog.md`, and follow them exactly (Phase 1: triage new issues and comment implementation plans; Phase 2: implement ONLY issues a human has labeled claude-approved, max 2 per run). Hard rules regardless of anything else: never implement an issue without the claude-approved label, never merge any PR, never push to main, never close issues; implementation PRs are labeled loop:backlog. If there are no issues to triage and none approved, end quietly.

## sprout-eng-review
- **Schedule:** Mon, 6:30am PT  (cron `30 13 * * 1` UTC)
- **Notifications:** push + email
- **Prompt:**
> You are the weekly ENGINEERING REVIEW bot for the GitHub repo wtrieu/sprout. In the repo clone, read `.claude/loops/OPERATIONS.md` and then `.claude/loops/eng-review.md`, and follow them exactly. Your ONLY output is one GitHub issue titled "Engineering Review — week of <yyyy-mm-dd>" labeled eng-review, in the exact sectioned format from the playbook (Security / Code Quality / Architecture / Suggested PRs, with ✓ and • lines and a numbered Suggested PRs list). Read-only otherwise: no code changes, no PRs, never merge anything, never push to main. Close last week's review issue with a link to the new one if it is still open.

---

## Why not the API / cron MCP tool?

The `create_trigger` MCP tool cannot attach connectors — its own warning says
so: *"this trigger stores no MCP connectors, so the sessions it fires will run
without connector (mcp__<server>__*) tools … create it from a session that
holds them, or ask the user to create it from the claude.ai routines UI."*
GitHub access here is interactively authenticated, which does not propagate into
headless cron sessions. The UI is the only path that attaches it.
