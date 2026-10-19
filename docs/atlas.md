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
  rungs.ts      ensureRung(): draft → validate (+1 repair) → judge (+1 revision) → verify readings → store
  verify.ts     deterministic, keyless reading verification (injectable fetch)
  picker.ts     frontier ordering: child → sibling → next-branch → fallback (pure)
  runner.ts     detached spawn of scripts/atlas.ts + stale-drafting reaper
scripts/atlas.ts            draft-map | rung  (PR2 adds: note; PR3 adds: kid)
apps/web/src/app/api/atlas  maps, maps/[id], nodes/[id], nodes/[id]/rungs/[level], /visit, /skip
apps/web/src/app/(app)/atlas  /atlas, /atlas/[mapId], /atlas/[mapId]/[nodeId]
```

Rules the code enforces:

- **Decompose; select, don't generate; assemble in code** (see
  `docs/local-llm-orchestration.md`). The map structure is two small calls per
  branch, not one big one. The deep dive's Further reading is assembled from
  verified rows, never written by the model.
- **Body markdown is the `lib/markdown.ts` subset** (`###`, `**bold**`,
  `- bullets`) and may not contain a link; `validateRungBody` lints it and the
  draft gets one repair pass, then fails loudly.
- **The row is the job status.** Maps and rungs are inserted as `drafting`
  before the detached run starts and flipped to `ready`/`failed` when it
  lands; the UI only polls those rows. A run that dies silently is reaped as
  `failed` after 20 min (maps) / 10 min (rungs).
- **The child's name is never hardcoded.** Read `children.name` / `dob`.

## Data model (migration 0013)

`atlas_maps`, `atlas_nodes` (self-referencing `parent_id`, two levels),
`atlas_rungs` (unique per node+level), `atlas_readings` (verified + rejected),
`atlas_frontier_picks` (PR2), `atlas_bookmarks` (PR3), `atlas_seeds` (PR3).

## Operations

- Env: `ATLAS_MODEL_WRITER` (default `claude-fable-5`), `ATLAS_MODEL_JUDGE`
  (default `claude-sonnet-5`), `ATLAS_JUDGE=false` to skip the editor-judge
  on one-pagers and deep dives (faster, less checked).
- By hand: `pnpm --filter web run job:atlas draft-map --map <id>` and
  `pnpm --filter web run job:atlas rung --node <id> --level <eli10|onepager|deepdive> [--force]`.
- Rejected readings are the tuning data for the verifier thresholds
  (`THRESHOLDS` in `verify.ts`): `select kind,title,reject_reason from atlas_readings where status='rejected'`.


## Status and how to resume

**Shipped:** PR1 (#96, merged 2026-10-19) — maps, node ladders, verified
readings, visited state, skip. Everything under "Remaining work" is still to
do. The owner has PR1 feedback pending; fold it into PR2 unless it is a bug,
in which case it goes first as its own small PR.

To pick this up in a fresh session:

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

### Owner feedback on PR1

_(to be filled in by the owner, or copied here from the PR thread by the
next session)_

## Remaining work

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
  `mdToHtml(bodyMd)` (re-exported from `lib/email.ts`), "Read next" from
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
