# World bible — three concepts to react to

Per the overhaul plan (§2.4), the `fantasy-world` lane needs ONE persistent
invented world, co-designed rather than imposed: react to these three
contrasting concepts — cut, edit, mix — and `worlds.ts` gets implemented from
the edited winner. Each published book in the lane will append one line of
canon, so the world accretes instead of resetting nightly.

> **Decided 2026-08-04 — winner: Concept 3, The Nine Cloud Villages.** Shipped
> as `apps/web/src/lib/stories/worlds.ts`; concepts 1 and 2 are kept below as a
> record of what was not chosen. See "What shipped" at the bottom for the edits
> made on the way in.

---

## Concept 1 — The Harbor at the Edge of the Map

**Tone.** Salt-air coziness with a horizon: a small harbor town where every
boat comes home by dusk, but the sea is full of gentle almosts — islands that
only appear on foggy Tuesdays, a lighthouse that hums. Adventures go OUT and
come BACK; the town is the warm constant.

**Places.**
- *The Crooked Pier* — planks of ten colors, each replaced after a famous storm.
- *The Lantern Tree* — a huge old fig strung with the lanterns of retired boats.
- *Spoonbill Café* — where the ferry captain trades toast for stories.
- *Foggy Tuesday Island* — appears offshore only in fog; smells of cinnamon.
- *The Chart Room* — maps of places nobody's finished discovering.

**Recurring characters.**
- *Captain Minnow* — a small, unhurried ferry captain (species deliberately
  undecided — could be a child, could be a water vole) who has been everywhere
  once and is in no rush to go twice.
- *Pilot the harbor dog* — rides the bow of any departing boat, "so the boat
  knows the way home."
- *The Lighthouse* — yes, the building; it hums different tunes for different
  weather and is a little vain about its lens.

**Sample premises.**
1. Foggy Tuesday Island appears on a Thursday, and nobody — including the
   island — knows what to do about it. (funny-adjacent)
2. Pilot the harbor dog stays home with a cold, so the smallest boat is
   nervous about finding its way; the whole harbor helps. (little-quest)
3. The Lighthouse hums a tune no one has heard before; Captain Minnow ferries
   out at dusk to learn what weather is coming. (bedtime-adjacent)

---

## Concept 2 — Mound-Under-the-Meadow

**Tone.** Miniature epic: a civilization of small creatures under and around
one ordinary meadow — burrows, root-cellars, a chestnut-shell postal service.
The child-scale joke is that a puddle is a sea and a garden boot is a famous
landmark. Closest cousin: Brambly Hedge, but with its own rules.

**Places.**
- *The Great Root Hall* — under the old oak; town meetings and acorn pancakes.
- *Boot Landmark* — a lost green garden boot; part lighthouse, part museum.
- *The Puddle Sea* — crossed by leaf-boat ferry when it rains.
- *The Seed Library* — every seed labeled, some "on loan to the wind."
- *The Up* — the meadow surface; visiting it is a small expedition.

**Recurring characters.**
- *Postmistress Burr* — a hedgehog who delivers mail in chestnut shells and
  knows everyone's birthdays.
- *Tam* — a young mole, chief digger's apprentice, afraid of exactly one
  thing: the sky (working on it).
- *The Weather Snail* — climbs Boot Landmark each morning; whichever way the
  horns point, that's the forecast. Usually right.

**Sample premises.**
1. Rain floods the Puddle Sea and the leaf-boats must ferry everyone's
   groceries; Tam discovers he loves sailing more than digging. (little-quest)
2. A seed goes missing from the Seed Library and turns out to be sprouting in
   the roof of the Great Root Hall — now what? (everyday-wonder/funny)
3. Tam's first trip to The Up, at night, holding Postmistress Burr's paw:
   the sky turns out to be full of small lights, not bigness. (bedtime)

---

## Concept 3 — The Nine Cloud Villages

**Tone.** Sky-borne and faintly Taiwanese-inflected without being a culture
lesson: nine little villages ride nine slow clouds in a loose ring around one
mountain (which looks suspiciously like Yushan). Villages drift close and
neighbors visit by kite-bridge; tea is always almost ready. Weather is
geography here — a village might spend a week being fog.

**Places.**
- *First Cloud* — the oldest village; its houses are woven of morning mist.
- *The Kite-Bridge Yards* — where the bridge-kites are flown and mended.
- *The Mountain's Shoulder* — the one solid place; clouds stop to rest on it.
- *The Tea Terrace* — pots the size of bathtubs; steam joins the cloud below.
- *Ninth Cloud* — the youngest, still learning to hold its shape.

**Recurring characters.**
- *Grandmother Rain* (A-má Hō͘) — keeper of First Cloud's weather; carries an
  umbrella that opens into any weather a story needs.
- *Bo* — a cloud-shepherd kid whose flock is one (1) very small cumulus named
  Puff, prone to wandering.
- *The Wind Postman* — delivers between villages; occasionally delivers the
  villages themselves to new views.

**Sample premises.**
1. Puff the baby cloud drifts off toward the Mountain's Shoulder; Bo crosses
   three kite-bridges to bring him home before dusk. (little-quest)
2. Ninth Cloud can't hold its shape in a warm wind and briefly becomes fog in
   everyone's kitchens; the villages cook dinner together in the white.
   (funny/everyday-wonder)
3. Grandmother Rain opens her umbrella to "the weather from when I was
   small," and Bo gets one evening inside her memory of a typhoon spent
   safe under a table, eating tang-yuan. (bedtime, culture-texture)

---

## What shipped (2026-08-04)

Concept 3 as written, plus these edits made while implementing
`apps/web/src/lib/stories/worlds.ts`:

- **Puff is a listed character**, not a detail inside Bo's entry — he drives
  premises on his own, so the writer needs his behaviour spelled out (wanders,
  sulks, hides in kitchens, comes back; cannot speak, extremely expressive).
- **Six explicit world rules**, which the concept only implied. Two of them do
  real safety work: *nothing falls* (nobody is ever afraid of the edge) and
  *weather is inconvenient, never dangerous*. One does craft work: a
  kite-bridge takes two people to fly, so **nobody crosses alone** — the world
  itself supplies a companion.
- **Taiwanese inflection kept, as texture only** — `a-má` and `tang-yuan` ride
  the existing stretch-word slot (1-2 per book, romanization only, never CJK
  script, per the 2026-08-03 decision). It carries no lesson and does not count
  against the lesson dial or the culture share.
- **Canon lives in `data/world-canon.md`**, not in code: one line per published
  fantasy-world book, appended when the story goes ready, hand-editable
  (delete a line that stopped being true). The last 24 lines of a world's
  section ride into the premise and book prompts, so prompt weight stays
  bounded however long the log grows.
- **Stage A proposes at most one fantasy-world premise a night**, and
  `normalizePremise` forces every fantasy-world premise into the world bible
  (and strips `worldRef` from every other lane), so the lane can never run
  world-less again.

One world to start; a second only if appetite emerges.
