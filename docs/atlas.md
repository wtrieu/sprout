# Atlas — design notes

Atlas is the module for the parent's own curiosity: a persistent, personal
atlas of the fields they want to understand, with a bridge for passing
learnings to the child. It exists because the owner stopped opening Sprout —
the pediatric corpus is a trickle by design and everything in the app was
child-facing — and because a bookstore "history of philosophy with one spread
per school" showed what the app could do better.

## Product decisions (owner, 2026-10-19)

| Axis | Decision |
|---|---|
| Why open this instead of a chat or a book | A **persistent personal atlas**: it remembers what was read, shows what's adjacent, grows over months. |
| Unit | A **field map**: a two-level tree (branches → schools / thinkers / concepts / texts), ~30–50 nodes, each with a one-line blurb that states the live question it answers. |
| Depth | A **ladder per node**: `eli10` (120–220 words), `onepager` (300–450, the default), `deepdive` (900–1200 + Further reading). Generated on demand, cached forever. |
| Sourcing | **Model-drafted prose + verified links.** Links are never written in prose; every reading is machine-verified (Wikipedia REST summary, Open Library search, GET + title check) before display. Rejects are stored with a reason, never shown. |
| Trigger (PR2) | A **weekly frontier note**: one unvisited node next to where you left off, pre-drafted, delivered as its own midweek email with the full one-pager inline and four links (open · go deeper · save for the child · skip this branch). |
| Child bridge (PR3) | **Bookmark = node + note + optional target age** (time capsule). Saving generates a **kid version** at the child's current age band plus one question or activity for today. "Make it a story" is a later button onto `POST /api/stories/express`. |
| Capture (PR3) | One "Add to Atlas" box: a title, URL, or idea becomes a seed the next draft places. |
| Model path | Headless `claude -p` on the Max subscription, exactly as stories (`lib/stories/claudeCli.ts`): no API billing, no local-LLM memory lock. Never qwen3 for Atlas prose. |
| First map | Philosophy (`lib/atlas/presets.ts`); the bar is the bookstore book. |

Success for the two-week solo test: opened unprompted 3+ times a week; both
weekly notes read with at least one rung climbed; 5+ saves for the child with
one used in person; a request for a second map.

## Architecture

```
apps/web/src/lib/atlas/
  llm.ts        atlasModels() + cliLlm: claudeCli + zod validation + one repair pass
  presets.ts    PHILOSOPHY_BRIEF (anchors + the bar; not an outline)
  draftMap.ts   M1 outline call → M2 one call per branch → normalize (dedupe, trim ≤50) → store
  rungs.ts      ensureRung(): draft → validate (+1 repair) → judge (+1 revision) → verify readings + images → store
  verify.ts     deterministic, keyless reading verification (injectable fetch)
  visuals.ts    model-drawn visual specs (sidebyside/diagram/geomap), [[visual:slug]] markers, validateVisuals
  verifyImages.ts  deterministic, keyless Wikimedia Commons image verification
  worldOutline.ts  generated Natural Earth 110m land outline for the geomap renderer
  picker.ts     frontier ordering: child → sibling → next-branch → fallback (pure)
  runner.ts     detached spawn of scripts/atlas.ts (+ preload shards) + stale-drafting reaper
  preload.ts    preloadMap(): one shard's one-pagers + quiz backfill + the atomic "ready" email claim
  email.ts      renderMapReadyEmail() (PR2 adds renderFrontierEmail)
  events.ts     the append-only event log: logEvent(), KNOWN_VERBS, legacy import
  players.ts    one character per Access email: create (first imports legacy), update
  game.ts       pure math: tiers from events, branch/field/discipline levels, fog
  progress.ts   composition: map/node progress payloads, household summaries
  quiz.ts       parse/strip/grade the stored quiz; answers never leave the server
  persona.ts    hand-written voice lines per persona per moment (seeded pick)
  disciplines.ts  the five definitions + the per-branch backfill classifier
  game/         the PR-D engine: achievements (base rules), loot, classes,
                engine (nightly model pass + rare backfill), items, hooks
scripts/atlas.ts            draft-map | rung | preload | disciplines | engine  (PR2 adds: note; PR3 adds: kid)
apps/web/src/app/api/atlas  maps, maps/[id], maps/[id]/preload, nodes/[id], nodes/[id]/rungs/[level],
                            /visit, /skip, nodes/[id]/quiz, me, players, players/me
apps/web/src/app/(app)/atlas  /atlas, /atlas/[mapId], /atlas/[mapId]/[nodeId]
```

Rules the code enforces:

- **Decompose; select, don't generate; assemble in code** (see
  `docs/local-llm-orchestration.md`). The map structure is two small calls per
  branch, not one big one. The deep dive's Further reading is assembled from
  verified rows, never written by the model.
- **Body markdown is the `lib/markdown.ts` subset** (`###`, `**bold**`,
  `- bullets`) and may not contain a link; `validateRungBody` lints it and the
  draft gets one repair pass, then fails loudly. The one exception is a
  visual marker alone on its own line (`[[visual:slug]]` / `[[image:slug]]`,
  PR-B): the UI splits on markers (`components/atlas/RungBody`), a marker
  with no matching stored row renders nothing, and `stripVisualMarkers` is
  for anything that feeds `mdToHtml` directly (emails).
- **The model never draws.** A "model-drawn" visual is a typed JSON spec
  (zod) that code renders to SVG; model-emitted SVG/HTML would go through
  `dangerouslySetInnerHTML` and is an XSS hole. Visuals never fail a rung:
  still broken after the repair pass they are dropped, unlike the quiz.
- **The row is the job status.** Maps and rungs are inserted as `drafting`
  before the detached run starts and flipped to `ready`/`failed` when it
  lands; the UI only polls those rows. A run that dies silently is reaped as
  `failed` after 20 min (maps) / 10 min (rungs).
- **The child's name is never hardcoded.** Read `children.name` / `dob`.

## Data model (migrations 0013–0016)

`atlas_maps`, `atlas_nodes` (self-referencing `parent_id`, two levels),
`atlas_rungs` (unique per node+level), `atlas_readings` (verified + rejected),
`atlas_frontier_picks` (PR2), `atlas_bookmarks` (PR3), `atlas_seeds` (PR3).
0014 added `atlas_rungs.quiz_json` and `atlas_maps.notified_at`. 0015 (PR-C)
added `atlas_players`, `atlas_events` (append-only; `verb` is TEXT on
purpose — new verbs are data, not code) and `atlas_nodes.discipline`.
0016 (PR-B, renumbered past PR-C's 0015 when main moved first) added
`atlas_rungs.visuals_json` and `atlas_images` (verified + rejected, the
readings rule for pictures).

## Operations

- Env: `ATLAS_MODEL_WRITER` (default `claude-fable-5`), `ATLAS_MODEL_JUDGE`
  (default `claude-sonnet-5`), `ATLAS_JUDGE=false` to skip the editor-judge
  on deep dives (faster, less checked), `ATLAS_MODEL_ONEPAGER` (default
  `claude-sonnet-5`; one-pagers are never judged), `ATLAS_PRELOAD_WORKERS`
  (default 3). The web plist must carry `RESEND_API_KEY`, `DIGEST_FROM`,
  `DIGEST_TO` and `SPROUT_BASE_URL` for the "map is ready" email.
- By hand: `pnpm --filter web run job:atlas draft-map --map <id>`,
  `pnpm --filter web run job:atlas rung --node <id> --level <eli10|onepager|deepdive> [--force]`,
  `pnpm --filter web run job:atlas preload --map <id> [--shard k --shards n]`
  and `pnpm --filter web run job:atlas disciplines --map <id> [--force]` (the
  PR-C backfill for maps drafted before discipline tags).
  Detached runs started from the web process log nothing; run by hand to watch.
  The nightly achievement pass is
  `pnpm --filter web run job:atlas engine [--player <id>] [--window-days <n>]`
  (launchd runs it daily at 04:30, `com.sprout.atlas-engine.plist`); inspect
  grants with `select slug,source,hidden,title from atlas_achievements order
  by granted_at desc` and loot with
  `select kind,ref,status from atlas_items`.
- The quiz UI is on the node page's one-pager tab (PR-C). Inspect stored
  quizzes with
  `select n.title, json_extract(q.value,'$.question') from atlas_rungs r join atlas_nodes n on n.id = r.node_id, json_each(r.quiz_json) q where r.level='onepager'`.
- Rejected readings are the tuning data for the verifier thresholds
  (`THRESHOLDS` in `verify.ts`): `select kind,title,reject_reason from atlas_readings where status='rejected'`.
- Rejected images tune `IMAGE_THRESHOLD` in `verifyImages.ts` the same way:
  `select slug,query,reject_reason from atlas_images where status='rejected'`.


## Status and how to resume

**Shipped:**

- PR1 (#96, merged 2026-10-19) — maps, node ladders, verified readings,
  visited state, skip.
- PR-A (#99, merged 2026-10-27) — one-pagers (with quizzes) preloaded on
  map creation by sharded workers, one "map is ready" email, Sonnet without
  the judge for one-pagers. Built as specified below except: the shard spawn
  lives in `scripts/atlas.ts` after `draftMap` returns (lib stays free of
  `child_process`). The owner merged it on a light review and will review
  it properly alongside PR-C; the live pass rate of Sonnet quizzes against
  `validateQuiz` was not measured before merge.
- PR-C (#103, merged 2026-10-31) — game foundation: players, the
  append-only event log, quiz grading + stamps, branch/field/discipline
  levels, fog + collection grid, personas. Spec below. It reached `main`
  while PR-B was still in review, so PR-B's migration was renumbered 0016.

**Order of what's left:** PR-D (built with the spec below, in review),
then PR2 and PR3 (the owner's PR1 feedback put the v2 track first). PR-B
merged as #102 on 2026-10-31.

Follow-ups from PR-A, not scheduled (fold into whichever PR touches them):

- A dry run consumes the notification claim: `preloadMap` sets
  `notified_at` before `sendEmail`, and `sendEmail` returns `sent: false`
  without a Resend key, so a map preloaded under a plist missing the key
  never gets its email. Fix: release the claim (set `notified_at` back to
  null) when `send` returns `sent: false` or throws, plus a test.
- "Prepare the rest" only appears while a one-pager is missing or failed; a
  map whose one-pagers are all ready but quiz-less has no button (run
  `preload` by hand).

To pick this up in a fresh session, paste this prompt:

> Read `docs/atlas.md` top to bottom, then skim `apps/web/src/lib/atlas/`
> and `apps/web/src/db/schema.ts` (Module C). Next up is PR-D (engine):
> the nightly achievement pass over the event log, class offers at
> total-level gates, loot on achievements, and the layered sprite — the
> decisions are all in this file under "Owner feedback on PR1" (engine,
> classes, loot, sprite workflow). It has no build spec yet. First, write
> one in the shape of the PR-A/PR-B/PR-C specs under "Remaining work",
> put it to me, and wait for my agreement before building. Then build it,
> tests first. Run `pnpm typecheck`, `pnpm lint` and `pnpm --filter web
> exec vitest run --passWithNoTests` before every push. Branch
> `claude/atlas-engine` from `main`; never push to `main`; open a PR when
> green, with the agreed spec committed to `docs/atlas.md` in the same PR.
> Do not start PR2. If the spec and the code disagree, follow the code and
> note the deviation in the PR description.

Then:

1. Read this file top to bottom, then skim `apps/web/src/lib/atlas/` (start
   with `rungs.ts` and `picker.ts`) and `scripts/atlas.ts`.
2. Check the live data on the Mac mini before designing anything:
   `select kind,title,reject_reason from atlas_readings where status='rejected'`
   tells you whether the verifier thresholds need tuning. PR1 could not test
   live verification — the cloud session's egress blocked Wikipedia, Open
   Library and SEP, so every live proposal there was rejected with
   `fetch failed`.
3. Branch from `main` as `claude/atlas-<slug>`, run the three quality gates
   before every push, never push to `main` (`.claude/loops/OPERATIONS.md`).
4. Deploying a merge on the mini: `git pull && pnpm install &&
   pnpm --filter web db:migrate && launchctl kickstart -k gui/$(id -u)/com.sprout.web`.

## Owner feedback on PR1 and the v2 direction (2026-10-19)

Three problems with PR1, in the owner's words: (1) click-and-wait — the
field submission and every page are generated on demand, and a one-line
blurb does not hold attention for 60–90 s; (2) text is not always the best
way to learn — diagrams, side-by-sides and maps belong in the page; (3)
nothing tracks what has been learned, and there is no reason to come back.
The fix for (3) is a game layer, and it is the owner's priority: the feel
is Khan Academy mastery levels + Brilliant's skill tree + Dungeon Crawler
Carl's system-that-notices-you + Balatro's collection grid with mastery
stickers + RuneScape's levels and capes — a character that ends up unique
to the learner because combinations of what they've learned produce things.

### Decisions

| Axis | Decision |
|---|---|
| Order | PR-A (speed) → PR-B (visuals) → PR-C (game foundation) → PR-D (engine), then PR2, PR3. |
| Preload | Every one-pager (with its quiz) is drafted as soon as a map is created, on Sonnet and **without** the editor-judge. A map may take some minutes; the owner gets one email when it is ready (push notifications deferred). Eli10 and deep dive stay on demand. |
| Visuals | Model-drawn diagrams, side-by-sides and maps (geographic or concept, by context), labeled as model-drawn; real images only (e.g. Wikimedia), never generated art. Atlas may be less strict than the medical half of the app. |
| Players | Per-person progress from the start: shared maps, separate progress, separate characters. Built for the owner and their wife first; extended family / other users later. Sharing map, character and achievements between players is an option, never forced. |
| "Learned" | Quizzes are **in** (reversed from the first pass): a node is mastered by reading + a quiz, not by a trust-based "mark complete". No flashcards or spaced-recall prompts. |
| Mastery | Three layers, levels never drop (below). No hard locks anywhere: unexplored nodes are fog, always clickable. |
| Achievements | A small hand-written base plus a nightly model pass over the activity log that grants one-off hidden achievements, titles and class offers. The action vocabulary must be extensible (new verbs = data, not code). |
| Persona | The learner picks one of two system voices (below). Family-friendly: the child may see the screen. |
| Classes | Offered at total-level gates (below). Change title, look, persona treatment, suggestion tilt and one habit perk; never lock content. |
| Sprite | Open — see "Open questions". Lean on Claude / Midjourney-class tools; the storybook image worker stays tabled. Still sprite with gear/effects is the v1 floor; animations follow. |
| Tabled | Eurekas (real-world actions that accelerate a branch), audio narration (own branch, next phase), the local image generator. |

### Mastery: three layers

1. **Branches are the skills.** Each branch (Ethics, Metaphysics, …) levels
   1–99; XP is scaled to the branch's node count so a small branch and a
   large one both mean "fully mastered" at 99. 99 earns the branch's skill
   cape.
2. **Fields are the maps.** A field shows its own total, e.g.
   `Philosophy 412 / 594`. Maxing every branch earns the field cape; several
   field capes earn a trimmed / polymath cape.
3. **Disciplines are the account-wide spine.** A small fixed set of
   cross-field skills — Reasoning, Evidence, Language, Systems, Creativity —
   that every node is tagged to at draft time, so they level as a byproduct.
   The account-wide total level is the sum of disciplines, which stays
   stable and comparable as fields are added, and rewards transfer (logic in
   Philosophy and in Math both feed Reasoning).

Per node, the ladder is the mastery tier (Balatro stickers): eli10 →
one-pager → deep dive, each stamped on the collection grid, with the quiz as
the gate to "mastered". Unseen nodes are `?` slots.

### The engine (Dungeon Crawler Carl)

- **Actions are the raw material.** PR1 has four (open, read a rung, skip,
  complete). Planned additions, all logged as typed events: pass a quiz,
  write a one-line takeaway, add a seed (PR3 capture), save for the child
  (PR3), discuss with the other player, read a suggested book, start a
  second field. The event log is the single input to every reward.
- **Hidden achievements** fire on specific, sometimes absurd behavior
  ("three Stoics before 6 am → *Dawn Ascetic*"). The nightly pass reads the
  week's events + the learner's history and grants at most a few; a base
  rule set covers the obvious milestones deterministically.
- **Combination beats raw power.** Cross-field discipline mixes are the
  source of rare wildcard classes.

### Persona (pick one at character creation)

1. **The obsessive cartographer** — a fussy archivist who has spent forever
   charting the field and cannot finish alone; your finds fill its map. It
   is thrilled by rare finds, complains about half-documented entries,
   grumbles at unexplored regions. Humor points at its obsessions and at the
   material, never at you. Loot = *expedition supplies* it sends for good
   finds. (Blathers in Animal Crossing.)
2. **The protégé** — a naive entity (young AI, apprentice creature) you are
   teaching; its skill tree is what you've taught it. It misapplies concepts
   in funny ways and gets things right only when you did. Flips the
   positioning (you are the expert being watched) and uses the protégé
   effect (Betty's Brain). Loot = *gifts* it brings back from adventures
   using what you taught it.

### Classes

- Offers arrive at total-level gates the learner can see coming; contents
  are built from what they actually did, and an offer waits if there is not
  enough signal yet.
- Three options: two reflecting the learner's pattern, one rare wildcard
  unlocked by a hidden achievement. Never mid-lesson: an offer queues and is
  revealed on the next map screen, like loot; soft deadline with a default.
- A class = **domain affinity** (quantitative / historical / creative …) ×
  **engagement style** (scouts widely / goes deep / connects / questions),
  e.g. "Quantitative Tinkerer", "Historical Skeptic". Later gates offer
  specializations.
- Changes: title and look (avatar, map styling, frames); persona treatment
  (nicknames, which expeditions/quests it sends); a suggestion tilt plus
  class-only side quests; one perk that nudges a good habit (Scout sees
  further past the fog, Scholar earns bonus mastery from reviews). No
  learning-style matching — vary emphasis and context, not format.
- Titles and class history are permanent on the profile; effects respec at
  the next tier, or early with a rare item.

### Delivery order

- **PR-A — speed.** Preload all one-pagers and their quizzes on map
  creation (Sonnet, no judge), one "map is ready" email (push
  notifications deferred: they need a service worker, VAPID keys and an
  installed app on iOS), node page shows the one-pager instantly.
- **PR-B — visuals.** Diagram / side-by-side / map blocks in rungs
  (model-drawn, labeled) and verified real images.
- **PR-C — game foundation.** Players and per-player progress, the event
  log, quizzes, node tiers, branch/field/discipline levels, the map as a
  skill tree with fog, the collection grid. Persona choice and voice.
- **PR-D — engine.** Nightly achievement pass, class offers, loot, the
  sprite.
- Then PR2 (weekly frontier note) and PR3 (save for the child, capture),
  both re-based on the event log.

### Quizzes, loot, sharing (settled 2026-10-19)

- **Quiz:** drafted with the one-pager during preload (one extra call per
  node), three questions, all correct for the stamp, retry freely, no cost
  on failure. Levels never drop.
- **Loot lands on achievements, not sessions.** There is no "session";
  every achievement carries a loot box, queued and revealed on the next map
  screen (never mid-lesson). Contents: cosmetics (frames, map styles, sprite
  gear) plus a few functional items — respec tokens, fog-reveals, and
  early access to a **rare node** (a node the draft marks rare; its blurb
  and one-pager open before its neighbors do).
- **Sharing:** between the household's players only (each sees the other's
  character and achievements). No public profile; everything stays behind
  Cloudflare Access.

### Sprite: decision and workflow

**Decided (owner, 2026-10-19):** layered parts composed in code. The
proof is `docs/atlas-sprite-lab.html` (also published as a private
artifact): 12 hand-placed 16×20 grids in six slots compose into 1,728
characters with a two-frame idle. The owner's verdict: a good start,
light on detail. Style still open between 16-bit RPG and chunkier; the
sprite itself is PR-D work, but the spec below lets art start any time.

Workflow for producing and refining the parts:

1. **Fix the spec before any art.** Canvas `32×40` (16×20 is too light for
   a readable face and hands), one indexed palette of ≤32 colors, one
   front-facing anchor pose with the arms slightly off the body so held
   items never overlap the torso. Write down the layer order (aura-back,
   cape, body, outfit, hair, item, aura-front) and the **anchor pixels**
   every part must respect: head-top row, shoulder row, left and right
   hand pixel, foot row. Animations: idle 2 frames, celebrate 4, per layer.
2. **Draw the base body first.** It defines the silhouette and the
   anchors; export it as a template PNG with the anchor pixels marked in a
   reserved color. Every other part is drawn on a copy of that template.
3. **Produce parts.** Three sources, all ending in the same format:
   Aseprite by hand (the standard pixel tool; fastest for fixes);
   Midjourney for candidates from the parts-sheet prompt, then cleaned up
   in Aseprite — snap to the grid, re-index to the palette, align to the
   anchors (Midjourney never holds a grid, so the cleanup is the real
   work); Claude for grid-as-code parts like the lab, which is good for
   quick variants and bad for faces.
4. **Store parts as data, not code.** `apps/web/public/sprite/<style>/
   <slot>/<id>-<anim>-<frame>.png` with transparent background plus a
   `manifest.json` (slot, z-order, anchor offsets, palette-swap groups for
   skin and hair, which achievement or class grants it). The runtime
   composes on a canvas exactly as the lab does, with palette swaps via
   indexed colors.
5. **Validate every part mechanically.** A script checks size, that every
   color is in the palette, that the anchor pixels are untouched, and
   that no part paints outside its slot's allowed region. This is what
   lets a Midjourney-derived part and a hand-drawn part coexist.
6. **Refine on contact sheets.** Render 50 random combinations plus a
   fixed "golden" set, check for clipping between layers, color clashes
   and readability at 1× and 3×, fix per part, re-render. The golden set
   becomes a regression snapshot.
7. **Animate last.** Same frame count per slot per animation; a part that
   lacks an animation falls back to its idle frame, so animations can land
   one slot at a time.

### Open questions

- **Sprite style** (16-bit RPG vs. chunky) and which parts sheet to
  commission first. Everything else is decided.

## Remaining work

### PR-A — preloaded one-pagers and quizzes (shipped, #99)

Goal: after "Start a map", the owner gets one email when every one-pager
(and its quiz) is ready, and from then on every node opens instantly.
Eli10 and deep dive stay on demand.

- **Models.** `atlasModels()` gains `onepager: ATLAS_MODEL_ONEPAGER ??
  "claude-sonnet-5"`. A one-pager is always written on that model and is
  never judged, whatever triggered it (preload or the node page); deep
  dives keep `writer` + judge, eli10 keeps `writer`, no judge. `ensureRung`
  picks the model and the judge flag from `level`, so the route and the
  preload share one path.
- **Quiz in the same call.** For `onepager`, `RungDraftSchema` adds
  `quiz: 3 × { question, choices[4], answer: 0–3, why }` (choices
  distinct, `why` ≤ 240 chars, one sentence). `validateQuiz` lints it and
  rides the existing one-repair-pass; a broken quiz after repair fails the
  rung like a broken body does. Stored as `atlas_rungs.quiz_json`
  (nullable text, **migration 0014**). PR-C builds the answering UI and
  the mastery stamp; PR-A only drafts and stores.
- **`lib/atlas/preload.ts`** — `preloadMap(db, mapId, { shard, shards,
  llm, fetchImpl, send, log })`:
  1. nodes of the map ordered by id, keep those with `id % shards ===
     shard`, skipping branch nodes if branches have no rungs (they do: a
     branch is a node like any other — keep them in);
  2. for each: if the one-pager is `drafting` and not stale, skip; else
     `ensureRung(onepager)` (ready rows are a no-op);
  3. for each ready one-pager with `quiz_json` null (the live Philosophy
     map): one quiz-only call, `buildQuizPrompt(context, onepagerMd)` →
     `QuizSchema`, store. This is the backfill for maps drafted before
     PR-A;
  4. when this shard is done: if no rung of the map is still `drafting`
     and every node has a ready-or-failed one-pager, atomically claim the
     notification: `update atlas_maps set notified_at = now where id = ?
     and notified_at is null` — the shard whose update returns a row sends
     the email, so two shards finishing together cannot send twice.
  `callClaude` is `spawnSync`, so one process is serial; the web process
  spawns `ATLAS_PRELOAD_WORKERS` (default 3) detached shards. At ~30–45 s
  per one-pager on Sonnet without the judge, a 45-node map lands in
  roughly 10–15 min with three workers, 30–45 min with one.
- **Map status.** The map flips to `ready` after the outline exactly as
  today (browsable fog within ~2 min); preload progress is derived from
  rung rows, no new status enum. New column `atlas_maps.notified_at`
  (migration 0014). `draftMap` spawns the shards as its last step; the
  `POST /api/atlas/maps/[id]/preload` route re-spawns them by hand (the
  "Prepare the rest" button, and the backfill for existing maps). Rung
  reaping is unchanged: each rung row is marked `drafting` only when its
  turn comes, so `RUNG_STALE_MS` still describes one rung.
- **`lib/atlas/email.ts`** — `renderMapReadyEmail({ map, branchCount,
  nodeCount, readyCount, failedCount, starts, baseUrl })` → `{ subject:
  "Atlas · <map> is ready", html }`: blurb, counts, three suggested first
  nodes (first unvisited child of the first three branches, each with
  its hook) linking to `/atlas/<map>/<node>`, and one link to the map.
  Minimal inline styles, max-width 640px, `mdToHtml` for the blurb.
  `sendEmail` from `lib/email.ts`; `EMAIL_DRY_RUN=true` logs instead.
  The web process spawns the shards with its own env, so
  `com.sprout.web.plist` must carry `RESEND_API_KEY`, `DIGEST_FROM`,
  `DIGEST_TO` and `SPROUT_BASE_URL` (copy from the digest plist) or the
  ready mail is a dry-run line in `/tmp/sprout-web.log`.
- **`scripts/atlas.ts preload --map <id> [--shard k --shards n]`**;
  README jobs-table row. `rung` is unchanged.
- **UI.** `/atlas/[mapId]`: a "Preparing · 12 / 43 one-pagers" line under
  the title while any one-pager is missing or drafting, polling every 5 s
  as it does for a drafting map; a "Prepare the rest" button when some
  are failed or missing and nothing is drafting. `/atlas/[mapId]/[nodeId]`:
  when the one-pager is neither ready nor drafting, POST it automatically
  on mount (today it waits for a click); the status line reads "Writing
  this page… (about a minute)" instead of the generic drafting text.
  `/atlas` cards show "ready · 43 pages" vs "preparing · 12 / 43".
- **Tests.** `rungs.test.ts`: a one-pager uses the onepager model and
  makes no judge call; the quiz is validated and stored; a bad quiz
  triggers the repair pass. `preload.test.ts` over the in-memory DB with a
  canned llm and a capturing `send`: shards partition the nodes exactly
  once; a second run drafts nothing; quiz backfill fills only null rows;
  two shards finishing "together" produce one email; a map with a failed
  one-pager still notifies and the email says so. `email.test.ts`: subject,
  three start links, map link.
- **Verify.** Locally: `EMAIL_DRY_RUN=true pnpm --filter web run job:atlas
  preload --map 1` logs each rung and ends with `[email dry-run] subject:
  Atlas · Philosophy is ready`; a second run logs only skips. On the mini:
  fill the web plist env, `launchctl kickstart -k`, press "Prepare the
  rest" on the Philosophy map, watch `select level,status,count(*) from
  atlas_rungs group by 1,2`, check the inbox.

### PR-B — visuals in rungs (built with this spec, ~1,200 LOC; migration 0016)

Goal: one-pagers and deep dives can carry model-drawn diagrams,
side-by-sides and maps (labeled as model-drawn) and verified real images
from Wikimedia Commons — never generated art, nothing shown unverified,
rejects stored with a reason. Three design calls shape everything else:
(1) the model never draws pixels or markup — a "model-drawn" visual is a
small typed JSON spec code renders to SVG (model markup through
`dangerouslySetInnerHTML` is an XSS hole); (2) visuals never fail a rung —
a quiz broken after repair fails the rung (it is PR-C's mastery gate), a
visual broken after repair is dropped and the page ships bare; (3) image
relevance is grounded in the node's verified Wikipedia reading when one
exists — the model proposes a *query*, never an exact Commons file title
(it would hallucinate them).

- **Visual kinds** (`lib/atlas/visuals.ts`, zod `VisualSchema`
  discriminated on `kind`; every visual has `slug` (`[a-z0-9-]{1,40}`),
  `title` ≤ 80, `caption` ≤ 200, and a backfill-only `after_heading`):
  `sidebyside` (2–3 columns × 2–6 rows, headers, optional `row_labels`,
  cells ≤ 120 chars — rival positions); `diagram` (≤ 9 nodes, ≤ 12
  directed edges with optional labels; code lays out layered left→right by
  longest path, a cycle degrades to insertion order — structure, who
  taught whom); `geomap` (≤ 8 places `{label, lat, lon}` plotted on the
  committed public-domain Natural Earth 110m land outline,
  `worldOutline.ts`, equirectangular `x = lon + 180, y = 90 − lat`; the
  viewBox is the places' bounding box plus padding at a held aspect).
- **Block format.** A visual or image is placed by a marker alone on its
  own line — `[[visual:slug]]` / `[[image:slug]]` — the one exception to
  the markdown subset. The stored body is never rewritten at render time:
  a marker with no matching stored visual / verified image renders
  nothing, which is how a rejected image degrades. `mdToHtml` is untouched;
  `stripVisualMarkers` serves anything that feeds it directly (emails).
  `wordCount` ignores marker lines.
- **Validation.** `validateVisuals(level, body, visuals, images)` rides the
  existing one-repair-pass: markers well-formed and alone on their line,
  per-level caps (onepager ≤ 1 visual + ≤ 1 image, deepdive ≤ 3 + ≤ 2,
  eli10 none), slugs distinct, marker ↔ spec agreement exactly once each
  way, sidebyside row agreement, diagram edge references, geomap
  coordinate ranges (zod). Fatal problems (body, quiz) still fail the rung
  after repair; visual problems surviving repair drop the visuals
  (markers stripped, `visuals_json` `"[]"`) and the rung lands `ready`.
- **Prompts.** `buildRungPrompt` gains `VISUAL_RULES` and `IMAGE_RULES`
  blocks for onepager and deepdive (the three shapes, the markers, and the
  brake: *an empty list is a fine answer and usually the right one*);
  eli10 is unchanged. `RungDraftSchema` adds `visuals` and `images` — the
  same single call, no extra latency in preload.
- **Image verification** (`lib/atlas/verifyImages.ts` — deterministic,
  keyless, injectable fetch, mirroring `verify.ts`). Proposal
  `{slug, query, caption, why}`. Per proposal: (1) the verified `wikipedia`
  reading's media list (`/api/rest_v1/page/media-list/`), bitmaps only,
  interface junk filtered, ranked by `titleSimilarity(query, filename)`
  (and caption when present); (2) else Commons full-text search
  (`list=search`, ns 6), filename-only ranking (the snippet echoes the
  query by construction); (3) `imageinfo` for the winner: original URL,
  640px thumb, dimensions, Artist + LicenseShortName (HTML-stripped).
  Reject reasons stored: no candidates, best match below threshold (named,
  with score), not found, too small (< 400px a side), fetch failed,
  duplicate. `IMAGE_THRESHOLD = 0.3` — lower than the readings' 0.5–0.6
  because Commons filenames carry museum/collection noise tokens; tune
  from the rejected rows.
- **Migration 0016** (renumbered from 0015 when PR-C reached `main`
  first). `atlas_rungs.visuals_json` (nullable text; `"[]"` means "asked,
  none wanted" — the backfill only re-asks while null, eli10 stays null).
  New table `atlas_images`: slug, query, caption, why,
  status verified/rejected, file_title, verified_via
  (article_media/commons_search), url, thumb_url, desc_url, author,
  license, width, height, reject_reason, proposed_by
  (onepager/deepdive/backfill), position. Dedupe in code (by slug per
  node, by file title per node), no unique index — rejects reuse slugs.
- **Backfill** for the live Philosophy map, inside `preloadMap` exactly
  like the quiz backfill: one visuals-only call per ready one-pager with
  `visuals_json` null (`buildVisualsPrompt`), each proposal anchored by
  `after_heading` (the exact `###` text); code inserts the marker after
  the matched heading (unmatched → end of body) — the prose is never
  rewritten. Failure leaves null for the next run. Runs under `preload`
  and the "Prepare the rest" button; no new subcommand.
- **UI.** `GET /api/atlas/nodes/[id]` adds verified `images`; rung rows
  carry `visualsJson`. `components/atlas/RungBody` splits the body on
  markers and interleaves `Markdown` with `AtlasVisual` (SVG renderers per
  kind in a figure with title, caption and a **model-drawn** chip) and
  `AtlasImage` (hotlinked Commons thumb, caption, "Artist · License ·
  Wikimedia Commons" linking the description page). "Regenerate" already
  refreshes visuals via `force`. A `vitest.config.mts` (alias + JSX) lets
  the components be tested with `renderToStaticMarkup`.
- **Tests.** `visuals.test.ts` (schemas, validateVisuals, segmentBody,
  stripVisualMarkers, insertMarkers); `verifyImages.test.ts` (canned
  fetch: media-list first, search fallback, threshold/size/missing/dupe/
  network rejects); `rungs.test.ts` (visuals stored with markers, image
  verified via article media, rejected image stored and never shown,
  repair pass, drop-not-fail, eli10 marker-free, prompt coverage);
  `preload.test.ts` (backfill fills only null rows, anchors markers,
  stores `"[]"`, idempotent second run); `RungBody.test.tsx` (render,
  dangling markers dropped, malformed JSON survived).
- **Verify.** Locally: `pnpm --filter web run job:atlas rung --node <id>
  --level onepager --force` on a geography-anchored node, open the node,
  see the visual with its chip and the image with attribution. On the
  mini after merge: deploy as usual, "Prepare the rest" on Philosophy,
  watch `select count(*) from atlas_rungs where visuals_json is not null`
  grow, and read the rejected-images query under Operations.

### PR-C — game foundation (built on `claude/atlas-game`; migration 0015)

Goal: shared maps, separate characters. Every action lands in a typed,
append-only event log that every reward derives from; a node is mastered by
reading plus its quiz; branches/fields/disciplines level and never drop; the
map renders as a skill tree with fog (no hard locks) and a collection grid;
a persona chosen at character creation speaks in hand-written lines.

- **Players (migration 0015).** `atlas_players`: `email` (unique), `name`,
  `persona` (`"cartographer" | "protege"`). Resolved per request from
  `getAuthenticatedEmail` (`lib/auth.ts`) — Access already names the person,
  so there is no login UI and no switcher; `service-token` / null get a
  read-only view (no events, no progress). `/atlas` without a character
  shows creation (name + the two personas as cards); `POST
  /api/atlas/players`. The **first** character created inherits pre-player
  progress as events in the same transaction (`visitedAt` → `open_node`,
  `readAt` → `read_rung`, backdated, `data: {imported: true}`); the second
  starts fresh. Import runs only when the table was empty — idempotent.
- **Events (migration 0015).** `atlas_events`: `playerId`, `verb` **TEXT,
  no enum** — new verbs are data, not code — nullable `mapId`/`nodeId` (set
  null on delete), `data` JSON, `createdAt`; indexes `(playerId, createdAt)`
  and `(verb)`. `lib/atlas/events.ts`: `logEvent()` + a `KNOWN_VERBS`
  reference const. PR-C verbs: `create_character`, `choose_persona`,
  `open_node`, `read_rung` (`data.level`), `pass_quiz`, `fail_quiz`
  (`data.score`, `data.answers` — raw material for PR-D), `skip_branch`,
  `unskip_branch`. Append-only; no reader switches exhaustively on a verb.
  The legacy node/rung columns keep being written — the picker and PR2 read
  them as the shared "atlas memory" — but per-player UI derives from events
  only. Skips stay **shared** (they prune the map, they are not progress);
  who skipped is logged.
- **Disciplines (migration 0015).** `atlas_nodes.discipline` (reasoning,
  evidence, language, systems, creativity; nullable). Draft-time: the
  outline and children calls each tag their nodes (`disciplineRules()` in
  the prompts). Backfill: `scripts/atlas.ts disciplines --map <id>` — one
  classification call per branch, select-don't-generate; an assignment whose
  title matches no node is reported, never applied. Untagged nodes count
  toward branch/field levels but no discipline.
- **Game math — `lib/atlas/game.ts`, pure.** Tier per node per player:
  unseen → seen (`open_node`) → stamps per `read_rung` level → mastered
  (`pass_quiz`). Stamp XP, once per node: eli10 10, onepager 20, deepdive
  30, quiz 40 (100/node). Branch level 1–99: `1 + floor(98·sqrt(xp/maxXp))`
  over the branch node + children — fast early, 99 only at full mastery;
  monotone over an append-only log, so levels never drop. Field: sum of
  branch levels / 99×branches (+ `capeEarned`; rendering is PR-D).
  Disciplines (account-wide, across maps): same stamp XP per node's tag on
  an absolute curve, `xpForLevel(n) = 50·n·(n−1)`, capped 99; total level =
  sum of the five. All constants in one block in game.ts.
- **Quiz.** The node GET strips `quiz_json` (it carries the answers) and
  ships `{questions, choices}` only; `POST /api/atlas/nodes/[id]/quiz`
  grades server-side, logs pass/fail, returns per-question correctness and
  the `why` explanations **only on a pass**. Retry freely, no cost; a pass
  is permanent. UI under the one-pager body: three questions, Check button,
  stamp + persona line on pass. Folds in the PR-A gap: the map page's
  preload button also appears as "Prepare quizzes (n missing)" when every
  one-pager is ready but some `quiz_json` is null.
- **Map page = skill tree with fog + collection grid.** Map GET gains
  `player`, `progress` (tiers, revealed set, branch levels, field,
  disciplines, total level), `greeting` (persona line, stable per day) and
  `quizlessCount`. Fog is a render rule derived from events, never stored:
  branch titles always visible; a child is revealed once the player opened
  it, its branch, or any sibling; the rest are `?` entries, still clickable
  (opening reveals). Outline / Collection toggle; tier stamps (three dots +
  ★ ring when mastered); branch level chips; field total in the header.
  No character → today's shared view, no fog. DOM + Tailwind only; rung
  bodies and their renderer untouched (PR-B's surface).
- **Node page.** ★ on the one-pager tab when mastered; the quiz block;
  visit/read beacons and the skip route also log events when the request
  belongs to a character.
- **Persona — `lib/atlas/persona.ts`.** No model calls in PR-C: hand-written
  template lines per persona per moment (creation, map greeting with live
  counts, quiz pass, quiz fail), seeded pick so renders are stable and tests
  deterministic. Family-friendly; humor at the material, never the learner.
  Switchable from `/atlas` (logged as `choose_persona`).
- **Routes.** `GET /api/atlas/me` (player + household summaries), `POST
  /api/atlas/players` (409 when the email has one), `PATCH
  /api/atlas/players/me`, `POST /api/atlas/nodes/[id]/quiz`; map and node
  GETs extended as above. Event-writing endpoints 401 without a character.
- **Tests.** Route logic lives in lib and is tested there: `game.test.ts`
  (tier folding, XP once per stamp, both curves monotone with exact
  endpoints, field totals, cross-map discipline pools, fog rules),
  `events.test.ts` (append + JSON payloads, unknown verbs, legacy import
  exact/backdated/once, one character per email, per-player separation,
  progress payloads), `quiz.test.ts` (parse/strip/grade, explanations only
  on pass, first-pass-wins state), `persona.test.ts` (every voice at every
  moment, deterministic), `disciplines.test.ts` (tagging by exact title,
  unknown titles ignored, second run makes no calls).
- **Verify.** Locally (`DEV_BYPASS_AUTH=true`): create a character on
  `/atlas`, open a fog `?` entry, read its one-pager, pass the quiz →
  stamps + branch chip move; for a second player set `DEV_BYPASS_AUTH=false`
  and curl with a `cf-access-authenticated-user-email` header. Run
  `disciplines --map 1` and spot-check tags. On the mini after merge:
  migrate, kickstart, first visit creates the owner's character and imports
  their progress; the second household email creates its own, fresh.

### PR-D — engine (spec agreed 2026-11-01)

Goal: the system starts noticing. Achievements are granted two ways — a small
deterministic base rule set that fires the moment an event earns it, and a
nightly model pass over the event log (headless `claude -p` via
`lib/stories/claudeCli.ts`, never qwen3) that grants at most two one-off
hidden achievements per player per run. Every achievement carries a loot box.
Boxes and class offers **queue** and are revealed on the next map screen,
never mid-lesson. Classes arrive at visible total-level gates and change
title, look, persona treatment and one habit perk — never a lock. The
character gets a face: layered sprite parts composed in code from
`apps/web/public/sprite/<style>/<slot>/` plus a `manifest.json`; real parts
are produced in the separate `atlas-sprites` repo, so PR-D builds against the
manifest format with committed placeholder parts and a golden-set
contact-sheet test.

- **Migration 0017** (atlas-core; nothing existing changes shape).
  `atlas_achievements`: `playerId`, `slug`, `title`, `flavor` (the persona-
  voiced line), `source` (`base`/`model`), `hidden` (0/1), `data` JSON
  (basis event ids; optional `wildcard` class id), `grantedAt`, `revealedAt`
  (null = queued for the next map screen); **unique (playerId, slug)** so
  grants are idempotent by construction. `atlas_items` (the loot, and the
  inventory): `playerId`, `achievementId` (set null on delete), `kind`
  **TEXT, no enum** — item kinds are data like verbs (`frame`, `map_style`,
  `sprite_part`, `respec_token`, `fog_reveal`, `rare_node_key`), `ref` (the
  frame/style/part id), `status` (`owned`/`consumed`), `consumedAt`.
  `atlas_class_offers`: `playerId`, `gateLevel`, `options` JSON (three:
  two pattern-derived, one wildcard or null), `status`
  (`queued`/`revealed`/`accepted`/`expired`), `choice`, `deadline`,
  `createdAt`, `decidedAt`; **unique (playerId, gateLevel)** — one offer
  per gate. A respec expires the accepted row and inserts a fresh `queued`
  row at the **current** total level (≥ the old gate, and gates only cross
  once, so the unique index holds; a second respec at the same level is
  refused until the level moves).
  `atlas_engine_runs` (the row is the job status): `kind` (`nightly`),
  `status` drafting/ready/failed, `error`, `windowStart`, `windowEnd`,
  `grantsCount`, `createdAt`. `atlas_players.loadout` (nullable JSON text:
  `{frame?, mapStyle?, sprite: {slot → partId}}`). `atlas_nodes.rare`
  (0/1 default 0; drafted maps mark rares later — a learning-engine
  follow-up — so the engine's first run backfills one seeded child per
  branch on maps that have none).
- **`lib/atlas/game/` (progression-engine)** — a new directory; PR-C's flat
  files stay put and keep their owners. New verbs appended to `KNOWN_VERBS`
  (reference only, verbs stay data): `grant_achievement`, `reveal_loot`,
  `offer_class`, `accept_class`, `use_item`, `reveal_node`, `equip`.
  - `achievements.ts` — `BASE_RULES`: ~12 hand-written deterministic rules
    over `(events, nodes)`: first open / first stamp / first mastery /
    5 and 15 masteries / first deep dive / a branch ≥ 50 / first cape (99) /
    a mastered node in all five disciplines / dawn reader (3 reads before
    06:00 local, hidden) / night owl (3 reads after 23:00, hidden) /
    comeback (pass a quiz after ≥ 3 fails on that node, hidden). A few
    hidden ones carry `wildcard` class ids. `checkBaseAchievements(db,
    playerId)` grants idempotently (insert-or-ignore on the unique index),
    rolls loot, logs `grant_achievement`; called after every event write and
    swept by the nightly run.
  - `loot.ts` — pools in one constants block: cosmetics (4 frames, 3 map
    styles, the manifest's grantable sprite parts) and functional items.
    `rollLoot(seed, owned)` is a pure seeded roll (hash of
    `playerId:slug`): one cosmetic the player does not own (pool exhausted →
    respec token) plus a 25% functional item (respec / fog-reveal /
    rare-node key, weighted 2/2/1); hidden achievements always add a
    functional item. Deterministic: same grant, same loot, testable.
  - `classes.ts` — `CLASS_GATES = [10, 20, 35, 55, 80, 120, 160, 200]`
    (total level = sum of the five discipline levels, so 5 is the floor).
    A class = **affinity × style**: affinity from the top discipline by XP
    (reasoning → Analytic, evidence → Empirical, language → Lyrical,
    systems → Systemic, creativity → Inventive), style from behavior ratios
    over the whole log (Scout = breadth of branches opened, Scholar = deep-
    dive share of reads, Skeptic = quiz attempts per node read, Synthesist =
    share of active days touching ≥ 2 branches). Two options from the top
    two affinity/style pairings, the third from an unconsumed `wildcard`
    achievement or null. **Signal floor**: fewer than 25 events or fewer
    than 2 branches touched → no offer yet, re-checked on later events
    ("an offer waits"). Soft deadline 14 days after reveal; past it, the
    next map load accepts the first option, logged `{defaulted: true}`.
    Perk is data on the class def; PR-D wires **Scout's fog bonus only**
    (fog reveals one extra unrevealed child per touched branch); the other
    perks ship as inert data with their copy.
  - `engine.ts` — the nightly pass. Window = since the last `ready` run
    (default 7 days). Per player: render compact event lines (id, verb,
    node title, branch, local time) + existing achievement slugs into one
    prompt → one `claudeCli` call on `atlasModels().writer`, zod
    `{grants: ≤2 × {slug, title, flavor, why, basisEventIds}}` with the
    one-repair pass; code verifies every basis id is a real event of that
    player inside the window and the slug is free — a grant failing either
    check is dropped, never repaired into. Prompt carries the persona rules
    (family-friendly, humor at the material never the learner). Grants
    store + roll loot exactly as base ones. The run row flips
    drafting → ready/failed.
  - `items.ts` — `useItem(db, playerId, itemId)`: respec token → the
    accepted offer expires and a fresh `queued` offer is built at the
    current total level; fog-reveal → `reveal_node` events on up to 3
    fogged nodes adjacent to recent activity; rare-node key →
    `reveal_node` on the nearest unrevealed `rare` node. Reveals are
    events, so fog stays a render rule derived from the log.
  - `hooks.ts` — `onEventsLogged(db, playerId)` = checkBaseAchievements +
    maybeCreateOffer; called from the visit, skip and quiz routes after
    they log.
  - `game.ts` (flat) gains two things only: `reveal_node` counts toward
    fog reveal, and `revealedNodeIds` takes an options arg for the Scout
    perk. `progress.ts` composes the new payloads.
- **Routes** (progression-engine). Map GET adds `pending` —
  `{achievements: [{id, slug, title, flavor, hidden, items: [{id, kind,
  ref}]}], offer: {id, gateLevel, options: [{classId, title, affinity,
  style, blurb, perk}], deadline, status} | null}` — plus `nextGate`
  `{level, at} | null` and the player's `class` + `loadout`. `POST
  /api/atlas/reveals` marks queued achievements + offer revealed (logs
  `reveal_loot` / `offer_class`). `POST /api/atlas/offers/[id]` `{choice}`
  accepts (logs `accept_class`; title history is permanent via events).
  `POST /api/atlas/items/[id]/use`. `PATCH /api/atlas/players/me` gains
  `loadout`, validated against the manifest and owned items. `GET
  /api/atlas/me` adds achievements, items, class and class history.
  Event-writing endpoints still 401 without a character.
- **Sprite** (skill-tree-ui). `public/sprite/classic/<slot>/
  <id>-<anim>-<frame>.png` + `public/sprite/classic/manifest.json`: canvas
  32×40, one indexed palette ≤ 32 colors, slots in z order aura-back <
  cape < body < outfit < hair < item < aura-front, each with its allowed
  region; anchors (head-top row, shoulder row, left/right hand pixel, foot
  row); per part: slot, animations (`idle` 2 frames, `celebrate` 4),
  palette-swap groups (skin, hair), `grantedBy` (null = always available,
  else an achievement or class id). ~8 committed placeholder parts
  generated by `scripts/sprite-placeholders.ts` (new devDependency
  `pngjs`; runtime never decodes PNGs in Node — the browser composes on a
  canvas). `components/atlas/sprite/`: the zod manifest schema, a pure
  RGBA compositor (z order, palette swaps, a part lacking an animation
  falls back to its idle frame) and a `SpriteCanvas` client component with
  the two-frame idle. Tests are the mechanical validation from the
  workflow: manifest schema; every committed part checked for size,
  palette membership, untouched anchor pixels and painting inside its
  slot's region; and a **golden-set contact sheet** — a fixed set of 6
  combinations composed and hashed against a committed snapshot
  (`UPDATE_SPRITE_GOLDEN=1` regenerates).
- **UI** (skill-tree-ui; the node page is untouched — nothing reveals
  mid-lesson). Map page: a chest banner when `pending` is non-empty →
  reveal modal (achievement title + flavor + loot, then the class offer
  card: three options, perk copy, soft-deadline note, the first option
  marked as the default), POSTing `/api/atlas/reveals` on open; persona
  frames the reveal in-voice (new `loot_reveal` / `class_offer` moments in
  `persona.ts` — granted to skill-tree-ui this run). Header gains the
  sprite (idle), class title, and "Total level N · next offer at G".
  Equipped frame and map style apply as data-driven accent treatments.
  `/atlas`: character card (sprite, class title, total level), the
  achievements gallery (hidden ones invisible until earned, then shown
  with their flavor), the inventory row with Use buttons, and a loadout
  picker over owned cosmetics.
- **`scripts/atlas.ts engine [--player <id>] [--window-days <n>]`** +
  `infra/launchd/com.sprout.atlas-engine.plist` (daily 04:30 — after the
  2:30 nightly pipeline's SQLite bursts, before the 5:00 stories run —
  logs to `/tmp/sprout-atlas-engine.log`, same PATH note as the stories
  plist);
  README jobs-table row. The first run backfills `atlas_nodes.rare` as
  above. No web-spawn route: the test fortnight runs it by hand.
- **Tests.** `achievements.test.ts` (every base rule fires exactly once,
  hidden flags, loot rolled deterministically, dedupe against owned
  cosmetics); `engine.test.ts` (canned llm: grants validated and stored,
  fake basis ids dropped, cap of 2, run row drafting → ready, window
  advances, idempotent re-run); `classes.test.ts` (affinity/style exact on
  fixture logs, one offer per gate, waits below the signal floor, accept /
  respec / deadline default); `items.test.ts` (each kind's semantics, the
  events logged, fog honors `reveal_node`); `game.test.ts` additions
  (reveal verb, Scout bonus); the sprite tests above.
- **Verify.** Locally (`DEV_BYPASS_AUTH=true`): master two nodes → chest
  on the next map screen with loot; `pnpm --filter web run job:atlas
  engine` on a seeded log grants ≤ 2 with persona flavor; seed events to
  cross gate 10 → offer queued, revealed on the map, accept → title, perk
  and sprite frame change. On the mini after merge: migrate, kickstart,
  `launchctl load -w` the engine plist, read
  `select slug,source,title from atlas_achievements` the next morning.

### PR2 — weekly frontier note (~800 LOC)

One unvisited node a week, next to where the reader left off, pre-drafted
overnight and delivered as its own midweek email with the whole one-pager
inside. The table already exists (`atlas_frontier_picks`).

- **`lib/atlas/frontier.ts`** — `weekStartOf(now)` (ISO Monday),
  `activeMapId(db)` (setting `atlasActiveMapId` ?? oldest `ready` map),
  `currentPick(db, weekStart)` (latest row for the week),
  `runWeeklyFrontier(db, { llm, fetchImpl, send, now, force, log })`:
  1. no ready map → log, exit 0;
  2. a pick exists for this week and not `force` → "already delivered";
  3. `pickFrontierNode(nodes, { pickedIds: all prior pick nodeIds })`
     (`picker.ts` already orders child → sibling → next-branch → fallback);
     null → "map complete";
  4. `ensureRung(onepager)` then `ensureRung(deepdive)` so "Go deeper"
     lands on a ready page (never auto-generate from a GET);
  5. insert the pick row; deliver per `atlasDelivery`.
- **`lib/atlas/email.ts`** — `renderFrontierEmail({ childName, map, branch,
  node, rung, readings, links, progress })` → `{ subject: "Atlas · <node>",
  html }`. Eyebrow "This week in Atlas · <map> › <branch>", h1, bold hook,
  `mdToHtml(stripVisualMarkers(bodyMd))` (PR-B markers never reach an
  email; `stripVisualMarkers` from `lib/atlas/visuals`), "Read next" from
  verified readings only, four plain `<a>` buttons, footer
  "<visited>/<total> visited". Minimal inline styles, max-width 640px.
- **Email links** (GET pages behind Cloudflare Access, base `SPROUT_BASE_URL`):
  Open → `/atlas/<map>/<node>?from=note` (the visit beacon already stamps
  `openedAt` on the pick); Go deeper → `?rung=deepdive&from=note`; Save for
  the child → `?action=save&from=note` (PR3 panel; omit the link until then);
  Skip this branch → `?action=skip&from=note` (the confirm bar already
  pre-opens on this param).
- **Settings** (`lib/settings.ts` whitelist): `atlasActiveMapId:
  z.number().int().nullable()` default null; `atlasDelivery:
  z.enum(["email","digest","app"])` default `"email"`. `digest` = prepend a
  "This week in Atlas" section in `lib/digest.ts` `runWeeklyDigest` (~15
  lines, optional); `app` = cards only.
- **`scripts/atlas.ts note [--force]`** subcommand; `infra/launchd/
  com.sprout.atlas.plist` cloned from `com.sprout.stories.plist` (PATH must
  include `~/.local/bin`) plus the digest plist's `RESEND_API_KEY`,
  `DIGEST_FROM`, `DIGEST_TO`, and `SPROUT_BASE_URL`; `StartCalendarInterval`
  Weekday 3, 06:30; logs `/tmp/sprout-atlas.log`. README jobs-table row.
  Also add the one-line `import "./env"` to `scripts/weekly-digest.ts`,
  which the other scripts have and it lacks.
- **Routes:** `GET /api/atlas/frontier` (current pick + node + readiness),
  `POST /api/atlas/frontier/run { force? }` (spawns `note`; the manual "send
  this week's note" button for the test fortnight), `PATCH /api/atlas/maps/[id]
  { active: true }`.
- **UI:** frontier card at the top of `/atlas` and a ~25-line server-side
  card on `(app)/home/page.tsx`.
- **Tests:** `frontier.test.ts` over the in-memory migrated DB with a canned
  llm and a capturing `send`: pick row written, both rungs ready, four links
  in the HTML, idempotent second run, `app` delivery sends nothing,
  `--force` never repeats a node.
- **Verify:** `EMAIL_DRY_RUN=true pnpm --filter web run job:atlas note` logs
  the pick reason and `[email dry-run] subject: Atlas · …`; a second run says
  already delivered; on the mini fill the plist, `launchctl load -w`,
  `launchctl start com.sprout.atlas`, check the inbox.

### PR3 — Save for the child, kid version, capture (~800 LOC)

Tables already exist (`atlas_bookmarks`, `atlas_seeds`).

- **`lib/atlas/kid.ts`** — `generateKidVersion(db, bookmarkId, deps)`:
  read `children.name` and `ageInMonths(dob)` (never hardcode a name — code
  elsewhere still says "Jun" in places); `ageBand(months)` from
  `lib/skills/storyText.ts` supplies the `language` guidance; include
  `NONFICTION_FLOOR` from `lib/stories/lanes.ts`. Budgets for `kid_md` by
  band: <18 mo 60 words, <30 90, <48 130, else 180; `today` ≤ 40 words.
  Prompt: re-explain THIS NODE (source of truth: the one-pager) for <name>,
  <formatAge>, as words a parent would say aloud; include the parent's note;
  then ONE question or tiny activity for today using ordinary things at
  home. Validate budgets + Latin script; store `kidMd`, `kidToday`,
  `kidAgeMonths`, flip `kidStatus`. `storyTopicForBookmark(node, bookmark)`
  returns the topic a later "Make it a story" button would POST to
  `/api/stories/express`; mark it `// HOOK(atlas-story)` and render the
  button disabled.
- **`lib/atlas/seeds.ts`** — `detectSeedKind(text)` (url / title / idea),
  `placePendingSeeds(db, mapId, deps)`: one call per pending seed given the
  map's node titles → `{ action: "attach" | "new_map" | "dismiss",
  parentId?, title?, blurb?, kind?, reason }`; attach = insert a child node
  with `seedId`, mark the seed `attached`; a URL seed also proposes a `web`
  reading verified by `verifyReadings`. Hook into `scripts/atlas.ts note`
  (before the pick; a freshly attached seed wins the week with reason
  `seed`) and into `draft-map`.
- **Routes:** `GET/POST /api/atlas/bookmarks` (`{ nodeId, note ≤600?,
  targetAgeYears 1–25? | null }` → 201 + spawn `kid`), `PATCH/DELETE
  /api/atlas/bookmarks/[id]` (`{ note?, targetAgeYears?, regenerateKid? }`),
  `GET/POST /api/atlas/seeds` (`{ text 2–500 }`), `DELETE /api/atlas/seeds/[id]`,
  and `scripts/atlas.ts kid --bookmark <id>`.
- **UI:** Save panel on the node page (pre-opened by `?action=save`),
  `/atlas/bookmarks` (note, target age, kid version with drafting state,
  disabled "Make it a story"), "Add to Atlas" box + pending count on `/atlas`,
  bookmark icon on the map outline. Optional drive-by: replace the hardcoded
  "Jun" copy in `(app)/premises/page.tsx` with `child.name` (leave the
  `why_for_jun` column alone).
- **Tests:** `kid.test.ts` budgets by band + Latin-script check;
  `seeds.test.ts` kind detection, placement validation, URL seed → verified
  reading; `storyTopicForBookmark`.

### Known gaps and follow-ups (not scheduled)

- Readings rejected for *network* reasons are only retried by "Regenerate";
  a cheap re-verify pass for `fetch failed` rows would be kinder.
- The Mac mini's PATH/keychain for `claude` under the web process is the
  same dependency stories have; a failed spawn shows as a `failed` row with
  the error text, not a silent stall.
- Judge latency: a rung is 60–90 s with the editor-judge on. `ATLAS_JUDGE=false`
  drops it to roughly half.
- `lib/stories/claudeCli.ts` is now shared by stories and Atlas; a later
  cleanup could move it to `lib/claudeCli.ts` and re-export.
