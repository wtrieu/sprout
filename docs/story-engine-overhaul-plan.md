# Story engine overhaul — "learn with me" plan

Written 2026-08-03 on branch `claude/story-generation-review-d0a28a`, to be executed in a
fresh session. Read this file top to bottom before touching code. The repo rules in
`CLAUDE.md` apply: run `pnpm typecheck`, `pnpm lint`, and
`pnpm --filter web exec vitest run --passWithNoTests` before any PR; never push to `main`;
all changes go through PRs a human reviews.

## 0. Context — what exists today and why it isn't working

The nightly job `scripts/nightly-story-candidates.ts` (launchd `com.sprout.stories`, 5am)
runs headless `claude -p` on the Max subscription (`ANTHROPIC_API_KEY` stripped from the
child env — keep this pattern) to draft story candidates. Code picks ingredients
(form, art pack, setting, milestone theme) with LRU variety memory, composes one prompt,
and imports the JSON through `apps/web/src/lib/stories/importCandidate.ts`
(Zod + mechanical craft checks in `apps/web/src/lib/skills/storyText.ts`). The parent
reviews drafts on their phone, pastes composed Midjourney prompts
(`apps/web/src/lib/skills/storyArt.ts`), uploads page images, finalizes.
The review flow, art pipeline, reader, and finalize path all work well and stay.

What doesn't work — confirmed by reading the code and the live DB (`data/sprout.db`,
only 4 of 47 ever-created stories survive; rejection = hard DELETE):

1. **Genre is hardcoded.** The prompt opens "You write bedtime picture books" and forces
   "ending asleep and safe, no peril, nothing scary." Every story is a wind-down.
2. **Protagonist is hardcoded**: "a simple, warm animal character." Same story, different fur.
3. **A lesson is mandatory**: every story models a milestone theme. The owner wants
   lessons *sparingly*.
4. **Over-constraint causes clunk**: form spec + exemplar + rhyme bank + word caps +
   mandatory join-in beat + rule-of-three + forced deceleration, satisfied in one shot
   with one repair pass. Validators measure template compliance, not sense.
5. **Mad-libs incoherence**: theme, setting, and form are picked independently in code and
   glued together ("Point, point — the croissant, please!" on a mountain).
6. **Personalization leaks literally**: the journal-preference garnish inserted a croissant
   into 3 of the 4 surviving stories.
7. **Nothing learns**: rejecting a draft hard-deletes it (DELETE in
   `apps/web/src/app/api/stories/[id]/route.ts`). ~43 rejections produced zero stored signal.
8. **The writer model was never pinned.** Pre-2026-07-20 stories were written by local
   qwen3; since then `claude -p` runs with no `--model` flag and the CLI global model
   config is unset, i.e. a default (Sonnet-tier) alias. The best available model has
   never written these books.

## 1. Product direction

- **From bedtime template to commissioned library.** Each night the system commissions a
  few books for Jun's library across genres. Cozy bedtime wind-down becomes *one lane
  among many*, and its rules (end asleep, no exclamation marks, deceleration) apply only
  inside that lane. Gentle-for-the-age stays global; sleepy does not.
- **"Learn with me" sessions.** Some books carry a lesson — developmental, cultural, or
  factual — but sparingly (target: ~1 in 3 books has an explicit lesson; the rest are
  explicitly commissioned as "no lesson, just a good story"). Entertainment first.
- **Parent emphases as a light guiding touch.** Parents set north stars — durable things
  they want woven into Jun's library. Chinese/Taiwanese culture is the first, but the
  mechanism is general (space, music, whatever the family adds), standing in until Jun is
  old enough to voice their own interests. Each north star is a *weight with a target
  share of the library*, never a filter — culture starts at **1/5** (owner decision
  2026-08-03). An emphasis can be **texture** (a night-market setting, a-má's kitchen) or
  an **explicit lesson** (a Mid-Autumn Festival story); only the latter counts against
  the lesson dial.
- **Age scaling.** Honor `storyAgeTarget` (currently manual 24 months — see `settings`
  table) for reading level AND length: word budget per page and page count both scale.
- **The parent review loop is the teacher.** Every approve/reject/favorite feeds a taste
  memory that shapes future premises.

## 2. Design

### 2.1 Interests & north stars (preference intake)

New table `interests`:

```
interests
  id            integer pk
  kind          text     'north-star' | 'interest'
  label         text     short display name ("Taiwanese culture", "diggers")
  brief         text     the sentence(s) fed to the premise stage
  weight        integer  1..5 (north stars ignore weight — always on)
  share         real     north stars only: target fraction of the library (culture: 0.2)
  source        text     'manual' | 'chat' | 'review' | 'digest' ('child' reserved for later)
  tags          text     json string[] for attribution matching
  created_at / last_reinforced_at / archived
```

- **North stars** are durable family intents ("Jun should grow up knowing Chinese and
  Taiwanese culture — festivals, food, family words, folk tales"; "kindness and
  curiosity"). Always included in the premise-stage prompt as standing context, phrased
  as *"fold in naturally where a premise suits it — never force it."* Each carries a
  target `share` of the library (culture starts at 0.2), enforced by selection over a
  rolling window of the last ~15 picked premises; summed shares are capped at 0.5 so at
  least half the library always stays fully unconstrained. When Jun is old enough to
  voice interests (story wishes, cover-choice rituals from the product backlog), those
  enter this same table with `source: 'child'`.
- **Interests** are lighter and decay: current fascinations ("pointing at the moon",
  "dogs", "trucks"). Sampled into the premise prompt proportionally to weight
  (include ~2-3 per night). Weekly decay (weight −1 every 3 weeks without reinforcement,
  archive at 0); reinforced (+1, refresh timestamp) when a story tagged with the interest
  is favorited, approved, or re-read (read-complete beacons already exist).

Intake channels, in build order:

1. **A simple `/interests` page** ("family compass"): two sections — north stars (add,
   edit, archive) and interests (chips with weight steppers). Ship first; it's the
   backbone. A later polish pass can render it as an "interest garden" (plants sized by
   weight) — cute Sprout fit, purely cosmetic, do not block on it.
2. **Conversational capture**: extend the existing nightly journal chat-fact extraction
   (`apps/web/src/lib/skills/journal.ts` lane) to also propose interest candidates from
   chats and journal entries. Proposals land as **suggestions pending one-tap
   confirmation** on the interests page — never auto-added (the croissant taught us that
   raw extraction → literal insertion is the failure mode).
3. **Review-as-intake**: every premise and story carries `tags`. Approvals, favorites,
   rejections, and re-reads adjust matching interest weights by small increments
   automatically. Zero extra parent effort — revealed preference.
4. **Digest micro-poll (optional, later)**: the weekly digest email gets 2-3 one-tap
   questions ("More folk tales? Fewer animal leads?") hitting a signed one-tap endpoint.

### 2.2 Premise-first, two-stage generation

Rewrite the core of `scripts/nightly-story-candidates.ts`:

**Stage A — premises (one call/night).** Input: north stars + sampled interests + the
editorial taste file (§2.6) + recent-book summaries (titles, lanes, tags, motifs — to
push away from) + lane menu + seed suggestions (§2.4, sampled per north-star shares) +
age target. Output: ~8 premises as JSON:

```
{ title, lane, pitch (2-3 sentences), tags[], lesson: 'none'|'developmental'|'cultural'|'factual',
  lessonNote?, seedRef?, worldRef?, form?: optional formKey, lengthPages, whyForJun }
```

Store all premises in a new `premises` table (status: `proposed`) — the pool itself
becomes taste-memory raw data.

**Selection + the premise inbox (owner decision: this is the default workflow).**
Code ranks the pool for diversity across lane/tags vs. tonight's batch and the last ~10
stories, and enforces the lesson dial (≤ ~1/3 with lesson) and per-north-star shares
(rolling window, §2.1). The ranked premises then land in a **premise inbox** on the
phone — a simple list of cards (title, pitch, lane + tag chips) with greenlight / pass
buttons; pass optionally takes a one-tap reason chip. **Greenlighting kicks an immediate
detached book-write** (same pattern as the existing express on-demand stories), so the
full draft is reviewable minutes later. Two backstops keep the library growing without
babysitting: premises older than 48h (setting `premiseAutoPickHours`) trigger an
auto-pick of up to `storyCandidatesPerDay` diverse winners, and stage A skips generating
a new batch while too many premises sit pending (mirroring today's draft cap).

**Stage B — one call per picked premise.** The book call receives the premise, the lane
contract (§2.3), age band + page budget, the seed entry if any (§2.4), world-bible entry
if any, and the character rules. Inside one call: outline → draft → self-edit for sense
and read-aloud rhythm → final JSON (same candidate shape as today; keep
`importCandidate` as the import path).

**Stage C — editor-judge (one cheap call per book).** A different, smaller model judges
against a rubric: coherence (does anything not make sense?), freshness vs. recent books,
read-aloud quality, age fit, lesson subtlety (if lesson ≠ none: is it shown, not
preached?). JSON verdict + specific fixes → at most one revision call → import or reject
with the verdict stored.

Character rule change: drop "simple warm animal" as a global. The premise proposes the
protagonist (child, animal, moon rabbit, little god, sailor…). Keep the
40-word `characterDesc` contract — the art pipeline depends on it.

### 2.3 Genre lanes

New registry `apps/web/src/lib/stories/lanes.ts`, same pattern as `storyForms`:

- `bedtime-winddown` — current rules live here (end asleep, deceleration, join-in beat).
- `myth-retelling` — a world myth, gentled; pair with a seed entry.
- `folk-tale` — world folk tales; trickster tales allowed (mischief, not menace).
- `pourquoi` — "why" stories (why the moon changes, why the bear has a white V).
- `little-quest` — out-and-back adventure with a real (small) want and a satisfying return.
- `history-vignette` — a true moment made small and warm (first flight, lighthouse
  keepers, cave painters, trade ships).
- `fantasy-world` — set in a persistent invented world (§2.4 world bible).
- `funny` — absurd, giggle-first; permission to be silly, no lesson allowed.
- `everyday-wonder` — close-to-home noticing stories (nearest to the old default).

Each lane: name, contract (what must be true), pacing note, and what's *allowed* that the
old prompt banned (mild suspense with warm resolution for quest/myth lanes — "gentle
stakes, safe landings"). Global floor for all lanes at this age: nothing genuinely
frightening, warm resolution, read-aloud prose.

### 2.4 Material: seed corpus + world bible

**Seeds** are curated story material checked into the repo (parent-reviewable,
PR-editable) at `apps/web/src/lib/stories/seeds/` — TS modules, typed:

```
{ key, tradition, title, bones (the actual tale, 5-10 sentences),
  keep[] (what makes it work), soften[] (adaptation notes),
  ageNotes, tags[], vocab?: { word, romanization, gloss, script? }[] }
```

Starter set — Chinese/Taiwanese (`seeds/zh-tw.ts`), written with specificity, not
"ancient China" mush; distinguish Taiwanese Hokkien vs Mandarin where it matters:

- **The Great Zodiac Race** — proven cumulative/journey bones; perfect toddler structure.
- **Chang'e and the Jade Rabbit** (Mid-Autumn) — gentled: the moon lady and her rabbit;
  mooncakes shared under the full moon.
- **The Nian and the color red** (Lunar New Year) — gentled: Nian is a shy, grumpy
  creature who can't stand red or noise; red envelopes, firecrackers, family dinner.
- **The Magpie Bridge** (Qixi) — two friends who meet across the sky once a year.
- **Sun Moon Lake and the white deer** (Thao legend, Taiwan).
- **Why the Formosan black bear wears a white V** — pourquoi lane, Taiwan endemic animal.
- **Night market evening** — texture seed, not myth: gua bao, bubble tea (a Taiwanese
  invention — playful history), lanterns, calling vendors.
- **Tang-yuan at winter solstice** — round dumplings, family together.
- **Monkey King mini-episodes** — gentled to play: cloud somersaults, shape-changing games.
- **Family words** — vocab seed: a-má / a-kong (Taiwanese Hokkien for grandma/grandpa),
  māma, bàba, yuèliang (moon), xièxie.

**Vocab as stretch words.** The age-band spec already has a "stretch words" concept —
cultural vocabulary rides it: at most 1-2 words per book, meaning obvious from context,
**romanization only** — no Chinese characters rendered anywhere for now (owner decision
2026-08-03). The seed `vocab` shape keeps an optional `script` field for the future, but
nothing displays it.

Also add starter sets `seeds/world-myths.ts` (Aesop, Norse, Greek — gentled) and
`seeds/history.ts` (5-6 vignettes) so the culture emphasis has contrast — a weight needs
something to be weighed against.

**World bible** at `apps/web/src/lib/stories/worlds.ts`: a persistent invented world
(places, recurring characters, rules, tone). `fantasy-world` books set stories there and
append one line of "canon" per published book (store on the world: `canonLog`), so the
world accretes instead of resetting nightly. **Co-design flow (owner decision)**: phase 2
opens with 2-3 contrasting world concepts — a page each (tone, 4-5 places, 2-3 recurring
characters, three sample premise pitches) — delivered as a doc in the PR for the owner to
react to, cut, and edit; only then implement `worlds.ts` from the edited winner. Start
with ONE world and let it deepen; add a second later only if appetite emerges.

### 2.5 Craft & validation changes

- **Forms become tools**: `storyForms` stays, but a form is used only when the premise
  picked one. Form validators run only for that form. Drop the mandatory join-in beat and
  rule-of-three from the global prompt (bedtime lane may keep the join-in beat).
- **Length scales**: replace fixed `PAGE_COUNT = 8` with age-banded budgets, e.g.
  <18mo: 6-8 pages; 18-30mo: 8-10; 30-48mo: 10-12 (45 w/p); 48mo+: up to 16 (70 w/p).
  Add the two new upper bands to `ageBand`. Premise proposes length within band.
- **Imagery-overlap check** (code): motif n-grams vs. the last 10 stories (fireflies,
  croissants, "blinked awake"); overlap becomes a judge note, not a hard reject.
- **Personalization**: delete the "tuck it in once" loved-thing garnish entirely —
  interests now enter at the premise stage as inspiration, not object insertion.
- Keep: word budgets (+8 tolerance), Zod schema, scene rules (no character appearance, no
  style words — the art composition depends on them), character-avoid list.

### 2.6 Taste memory (the reinforcement loop)

- **Stop destroying signal.** Draft rejection becomes a soft transition:
  `stories.status = 'rejected'` + new `stories.reject_reason` (chip) +
  `reject_note` (optional text). Keep text pages; delete only uploaded images. The
  DELETE endpoint stays for true deletion of finalized books, but the review UI's
  draft-reject button switches to the new action with one-tap reason chips:
  `samey | clunky | doesn't make sense | too preachy | wrong topic | not for us`.
- Premises track outcomes through the inbox: `proposed | greenlit | passed (+ reason) |
  auto-picked | written | rejected (+ judge verdict)`. Passes and greenlights are taste
  signal exactly like draft rejections.
- **Weekly distillation**: a job (fold into `scripts/nightly-pipeline.ts` weekly branch or
  a small new script on the existing launchd cadence) reads the last ~30 days of
  approvals/favorites/rejections + reasons and writes `data/editorial-taste.md` — a short
  editor's memo ("hits and why, misses and why, banned clichés, current appetite").
  Prepended to the premise-stage prompt. Distillation is a frontier-model call.
- **Noise guardrails** (the archive must never become sludge in the prompts):
  1. *The writer never sees rejected drafts.* Raw rejected text is read by exactly one
     consumer — the weekly distiller. The only taste artifact that enters any generation
     prompt is the memo, hard-capped at ~40 lines, so prompt weight stays constant no
     matter how big the archive grows.
  2. *Regime-tagged rolling window.* `stories` and `premises` carry `engine_version`;
     distillation reads only the current engine's last ~30 days. The 40+ template-era
     rejections are excluded outright — their lesson (the template itself was the
     problem) is already encoded in this redesign and must not haunt the new memo.
  3. *Mostly-positive memo.* Approvals, favorites, and re-reads drive "more like this";
     the "avoid" list is capped at ~5 items, with at most one or two quoted phrases as
     banned-cliché examples. Rejections will always outnumber approvals — a memo that
     mirrored that ratio would be a wall of don'ts, which recreates the old
     over-constrained prompt from the opposite direction.
  4. *Text is evidence, not a museum.* Rejected drafts keep full page text for 90 days
     (several distillation cycles), then a cleanup step compresses each to a one-line
     epitaph (title, lane, tags, reason, one sentence) and drops the pages. Rejected
     stories are invisible everywhere in the app (status-filtered).
  Premise passes are inherently low-noise (a pitch + a reason chip); as premise quality
  improves, taste signal shifts upstream to the inbox and full-draft rejections should
  become rare — the noisy end of the archive shrinks on its own.

### 2.7 Model assignment (pin everything explicitly)

| Stage | Model | Why |
|---|---|---|
| Premise generation (1 call/night) | `claude-fable-5` | Taste and originality are the highest-leverage tokens in the system |
| Book writing (per premise) | `claude-fable-5` | The craft itself; this has never had the top model |
| Editor-judge + revision check | `claude-sonnet-5` | Independent perspective, cheap, rubric-driven |
| Weekly taste distillation | `claude-fable-5` | Judgment-heavy, tiny volume |
| Interest extraction from chat/journal | local qwen3 (existing lane) | Structured extraction is its strength; keeps local-first economics; upgrade to `claude-haiku-4-5` only if quality disappoints |
| Image QC | qwen2.5vl (unchanged) | works |

Implementation: `callClaude(prompt, { model })` passes `--model` per call; env overrides
`STORY_MODEL_WRITER` / `STORY_MODEL_JUDGE` (replacing the single `STORY_CLAUDE_MODEL`).
Fallback chain fable → opus-5 on model-unavailable errors, logged loudly. Keep the
Max-subscription pattern: `ANTHROPIC_API_KEY` deleted from the child env, `cwd` = tmpdir.
Nightly volume ≈ 1 premise + 4 book + 4 judge calls — fine for Max.

## 3. Phases

### Phase 1 — the engine (one PR)

1. Migration: `premises` table; `stories` columns `lane`, `tags`, `lesson`,
   `reject_reason`, `reject_note`, `engine_version` (also on `premises`); keep `form`
   (nullable semantics).
   ⚠️ Drizzle/SQLite gotcha: table-recreate migrations cascade-delete child rows;
   `migrate.ts` already disables FKs at the connection level — verify generated SQL by
   hand anyway, and back up `data/sprout.db` before applying to prod.
2. `lanes.ts` registry; prompt rewrite into stage A/B/C in
   `scripts/nightly-story-candidates.ts`; premise selection logic + lesson dial;
   per-stage models; delete the loved-thing garnish; forms-optional validation;
   age-band/page scaling; imagery-overlap note.
3. Premise inbox: API routes (list / greenlight / pass-with-reason) + a minimal phone
   page (cards with greenlight/pass); greenlight kicks a detached book-write (reuse the
   express-story spawn pattern); 48h auto-pick fallback + pending-batch cap in the
   nightly script.
4. Reject-with-reason on drafts: API route + review UI chips; premises outcome tracking.
5. Tests (vitest exists, near-zero files — add): premise selection diversity, lesson
   dial, share enforcement, band scaling, imagery overlap, importCandidate with optional
   form, auto-pick fallback.

Acceptance: a local dry-run (`pnpm --filter web run job:stories` against a dev DB copy)
produces ~8 premises spanning ≥4 lanes with ≤1/3 carrying an explicit lesson;
greenlighting a premise yields a reviewable draft in that lane with no hardcoded bedtime
ending outside the bedtime lane; simulating the 48h window auto-picks diverse winners;
models visibly pinned in logs. Quality gates green.

### Phase 2 — material + intake (one or two PRs)

1. `seeds/` (zh-tw + world-myths + history) with the typed shape; premise stage samples
   seeds per north-star share (`interests.share` — culture default 0.2).
2. `worlds.ts` world bible + canon accretion on finalize.
3. Vocab stretch words end-to-end (seed → romanized word in page text, glossed by
   context; no character display).
4. `interests` table + `/interests` page (north stars with shares + weighted chips +
   suggestions inbox); journal extraction proposes suggestions; premise stage consumes
   north stars + sampled interests.
5. Optional: 2 new art packs suited to myth/ink material (e.g. ink-wash storybook,
   paper-cut folk style) in `storyArt.ts`.

Acceptance: with a "Taiwanese culture" north star at share 0.2, a simulated week of
premise batches + picks yields ~1/5 culture-touched selections (texture or lesson) and
zero batches where every premise is culture-themed; a second north star (e.g. "music",
share 0.2) gets its own ~1/5 without crowding out unconstrained premises; interests page
round-trips; suggestions require confirmation.

### Phase 3 — the learning loop (one PR)

1. Weekly taste distillation → `data/editorial-taste.md` → premise prompt.
2. Review-as-intake weight nudges (approve/favorite/re-read/reject ↔ tagged interests).
3. Library report in the weekly digest: this month's mix by lane/tag, plus optional
   micro-poll.

Acceptance: distillation memo readable and specific after a simulated month; weight
nudges visible in `interests` after actions; digest renders the mix.

## 4. Operational notes

- Prod runs from the main checkout via launchd; `next start` does not hot-reload —
  rebuild + `launchctl kickstart -k` `com.sprout.web` after merging web changes;
  `com.sprout.stories` picks up script changes automatically next run.
- Back up `data/sprout.db` before the phase-1 migration (`data/backups/` convention).
- Keep launchd job name/cadence; log location `/tmp/sprout-stories.log`.
- Never push `main`; PR per phase; run all three quality gates from repo root.

## 5. Decisions already made (owner, 2026-08-03/04) — nothing left open

- Emphasis share starts at **1/5** per north star; mechanism generalized beyond culture
  (parents can add other north stars; `source: 'child'` reserved for when Jun can
  contribute their own interests).
- **Premise inbox is the default workflow** (greenlight/pass on the phone, 48h auto-pick
  fallback) — built in phase 1.
- **No Chinese characters** rendered anywhere for now; romanization only.
- **Rejected drafts are kept as taste evidence, not forever-noise** — governed by the
  §2.6 guardrails: distiller-only access, `engine_version` rolling window,
  mostly-positive capped memo, 90-day text retention then epitaph.
- **World bible is co-designed** (§2.4): 2-3 concepts proposed in the phase-2 PR, owner
  edits, one world to start.
- `storyCandidatesPerDay` stays **4**; **48h** auto-pick window confirmed.
