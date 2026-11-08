# Atlas — open backlog (2026-11-07)

The scheduled roadmap is complete and deployed: PR1 #96, PR-A #99, PR-B #102,
PR-C #103, PR-D #105, PR2 #106, PR3 #107, PR-E #109, PR-F #110. Everything
below is optional follow-up work, ordered by priority. Spec of record stays
`docs/atlas.md`.

## P1 — correctness follow-ups

(none open — the PR3-review items shipped in the hardening PR; see Done.)

## P3 — game polish

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

- Hardening PR (2026-11-07): frontier double-send fixed with a
  `(week_start, attempt)` unique index + claim-before-draft insert (`--force`
  numbers attempts); `regenerateKid` races fixed with an atomic drafting
  claim (PATCH returns 409 when busy); kid-draft reaper (`kid_started_at` +
  `reapStaleKids`, 10 min); ready-email claim released on failed/dry-run
  send; level-ups now queue in `lib/atlas/game/pending.ts` and get the first
  step in the reveal modal (ack via POST `/api/atlas/reveals/level-up`);
  quizless count now ignores body-less one-pagers. Known gap: a `note` run
  killed outright mid-draft leaves the week claimed — `note --force`
  recovers it.
- "Prepare the rest" for quiz-less maps (old P2 item 5) — was already fixed
  on main by PR-E (4fdd39e); the hardening PR only extracted the button
  predicate into a tested helper (`components/atlas/preload.ts`).

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
pnpm --filter web db:migrate && pnpm --filter web build &&
launchctl kickstart -k gui/$(id -u)/com.sprout.web`.
**The build step is mandatory**: launchd runs `next start`, which serves
the prebuilt `.next` — a deploy without `build` restarts the old bundle
(this bit us 2026-11-07: prod served an Oct 31 build for a week; raw
`[[visual:…]]` tokens and a missing game UI were the symptoms). Engine by hand:
`pnpm --filter web run job:atlas engine`; note by hand:
`EMAIL_DRY_RUN=true pnpm --filter web run job:atlas note`.
