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

## Roadmap

1. **PR1 (this):** maps, node ladders, verified readings, visited state, skip.
2. **PR2:** weekly frontier note — `lib/atlas/{frontier,email}.ts`, `job:atlas note`,
   `infra/launchd/com.sprout.atlas.plist` (Wed 06:30), cards on `/atlas` and `/home`,
   settings `atlasActiveMapId` / `atlasDelivery`.
3. **PR3:** Save for the child with the kid version, bookmarks page, Add to Atlas seeds.
