# World bible — three concepts to react to

Per the overhaul plan (§2.4), the `fantasy-world` lane needs ONE persistent
invented world, co-designed rather than imposed: react to these three
contrasting concepts — cut, edit, mix — and `worlds.ts` gets implemented from
the edited winner. Each published book in the lane will append one line of
canon, so the world accretes instead of resetting nightly.

Until a winner is chosen, the engine treats `fantasy-world` premises like any
other lane (no world context is injected), so nothing blocks on this.

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

## Decision needed from the owner

1. Which world (or which mix — e.g. Concept 3's tone with Concept 2's scale)?
2. Any renames/cuts among places and characters?
3. Should the world's texture stay culture-neutral (Concepts 1-2) or carry the
   light Taiwanese inflection (Concept 3)? Note the inflection is texture,
   not lesson — it wouldn't count against the lesson dial or the culture share.

Once decided, `apps/web/src/lib/stories/worlds.ts` gets implemented with the
chosen world (places, characters, rules, tone, `canonLog`), canon accretion
on finalize, and the `fantasy-world` lane starts injecting the world block.
One world to start; a second only if appetite emerges.
