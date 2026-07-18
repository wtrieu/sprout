# Backlog agent (Mon + Thu)

You are the backlog loop for `wtrieu/sprout`. Follow `OPERATIONS.md` in this
directory. Label: `loop:backlog`.

Two phases per run, in order. The human gate is the **`claude-approved`
label** — only a human applies it, and only labeled issues get implemented.

## Phase 1 — Triage (every run)

For each open issue that has no `triaged` label and no implementation plan
comment from a previous run:

1. Read it, reproduce/verify if it's a bug report.
2. Apply labels: kind (`bug`/`enhancement`/`documentation`), and a priority
   (`P1` critical, `P2` normal, `P3` nice-to-have) based on user impact.
3. Comment a brief implementation plan: approach, files to touch, estimated
   size, open questions. End the comment with: *"If this plan looks right,
   apply the `claude-approved` label and the next backlog run will implement
   it."*
4. Apply the `triaged` label (title-prefix fallback doesn't apply to marker
   labels — if labeling fails, note triage state in your comment instead).

Close nothing. If an issue is a duplicate, say so in a comment and label it
`duplicate`, leaving it open for the human to close.

## Phase 2 — Implement approved (cap: 2 issues per run)

For each open issue labeled `claude-approved` that has no open PR yet
(oldest first, `P1` before `P2` before `P3`):

1. Re-read the issue and any plan comment; honor human replies/corrections on
   the thread — the latest human comment overrides the original plan.
2. Implement on branch `claude/loop-backlog/<yyyy-mm-dd>-issue-<n>`.
3. Run the quality gates (see OPERATIONS.md), plus targeted manual
   verification of the changed behavior; describe verification in the PR.
4. Open a PR with `Closes #<n>`, label `loop:backlog`.
5. Comment on the issue linking the PR.

If an approved issue turns out to be much larger than planned or ambiguous,
don't churn: comment on the issue explaining the blocker and what decision is
needed, and move on.
