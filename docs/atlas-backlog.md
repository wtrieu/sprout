# Atlas — open backlog (2026-11-06)

The scheduled roadmap is complete and deployed: PR1 #96, PR-A #99, PR-B #102,
PR-C #103, PR-D #105, PR2 #106, PR3 #107. Everything below is optional
follow-up work, ordered by priority. Spec of record stays `docs/atlas.md`.

## P1 — correctness follow-ups (from the PR3 review, open)

1. **Frontier double-send** — `atlas_frontier_picks` has no unique index on
   the week, so two simultaneous `note` runs could both pick and both email.
   Fix: unique `(weekStart)` (or `(mapId, weekStart)`) index + claim-style
   insert. Surface: PR2 code (`lib/atlas/frontier.ts`, migration).
   Owner: `atlas-core` (migration) + `learning-engine`.
2. **`regenerateKid` double-spawn** — nothing guards two concurrent
   regenerations of the same bookmark; last writer wins. Fix: a drafting
   claim like the rungs path. Owner: `learning-engine`.
3. **Kid-draft reaper** — a kid generation that dies silently shows
   `drafting` until someone presses "Try again". Needs a started-at column
   and the same stale-reap pattern maps/rungs use. Owner: `atlas-core`
   (column) + `learning-engine`.

## P2 — PR-A follow-ups (proposal card already up)

4. **Release the ready-email claim on failed send** — `preloadMap` sets
   `notified_at` before `sendEmail`; a dry-run or thrown send consumes the
   claim and the map never gets its email. Fix in
   `lib/atlas/preload.ts` + test. Owner: `learning-engine`.
5. **"Prepare the rest" for quiz-less maps** — the button only shows while a
   one-pager is missing/failed; all-ready-but-quizless maps have no button.
   Fix on `(app)/atlas/[mapId]/page.tsx`. Owner: `skill-tree-ui`.

## P3 — game polish

6. **Level-up reveal step** — PR-F's reveal modal covers achievements, loot
   and class offers, but level-ups are not in the queued-rewards data, so
   they get no reveal moment. Add them to `lib/atlas/game/pending.ts`.
   Owner: `progression-engine`.
7. **Real sprite parts** — the `atlas-sprites` repo session produces the
   actual art; parts land as data in `apps/web/public/sprite/<style>/` +
   `manifest.json` (placeholders committed now). The 16-bit-vs-chunky style
   question is still open — the one undecided product question.
   Owner: `skill-tree-ui` (integration only; art is external).

## P4 — smaller known gaps (docs/atlas.md "Known gaps")

8. **Re-verify `fetch failed` readings** — network-rejected readings are
   only retried via "Regenerate"; a cheap re-verify pass would be kinder.
   Owner: `learning-engine`.
9. **Move `lib/stories/claudeCli.ts` → `lib/claudeCli.ts`** — now shared by
   stories and Atlas; move and re-export. Owner: `atlas-core` (cross-area).
10. **Measure the Sonnet quiz pass-rate** against `validateQuiz` on live
    preloads (never measured before the PR-A merge). Owner: `test-runner`
    territory — a measurement, not a change.

## Done recently (for orientation)

- Wire the remaining class perks (old item 6) — PR-F: Scholar/Skeptic/
  Synthesist now emit derived hint marks (`perkMarks` in the map payload),
  rendered on the skill tree; reveal modal got loot-drop sequencing.
- PR-E (#109): eli10 at map creation + backfill, likely-next prefetch,
  JSON repair fix — both live maps at 120/120 ready.
- Draft-time rare marking and the hardcoded "Jun" copy — folded into PR3.
- Engine first run: 27 rares backfilled, run row `ready`, nightly at 04:30
  (`com.sprout.atlas-engine.plist`); frontier note Wednesdays 06:30
  (`com.sprout.atlas.plist`).

## Ops reference

Deploy a merge on the mini: `git pull && pnpm install &&
pnpm --filter web db:migrate && launchctl kickstart -k
gui/$(id -u)/com.sprout.web`. Engine by hand:
`pnpm --filter web run job:atlas engine`; note by hand:
`EMAIL_DRY_RUN=true pnpm --filter web run job:atlas note`.
