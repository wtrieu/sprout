# Landing page (`/`) — architecture & current state

Living notes for the cinematic scroll-driven landing experience. Written at
the end of the first build push; **the art integration is unfinished and is
the active area of work** (see "Open problems" at the bottom).

Branch: `claude/sprout-3d-parallax-home-365113` · PR
[#16](https://github.com/wtrieu/sprout/pull/16) — conflict-free and verified,
awaiting the merge click.

## Routes

Route groups keep the landing chrome-free without touching app URLs:

- `app/(landing)/page.tsx` → `LandingExperience` (full-bleed, Fraunces serif)
- `app/(app)/layout.tsx` → the old nav/footer/`max-w-3xl` chrome
- `app/(app)/home/page.tsx` → the former `/` dashboard. **The dashboard now
  lives at `/home`**; nav link, logo, and the profile-save redirect point there.

## Stack added

`three` · `@react-three/fiber@9` (v9 required for React 19) · `@react-three/drei@10`
· `@react-three/postprocessing@3` · `lenis` · `gsap` (+ScrollTrigger) ·
`@splinetool/react-spline` (slots wired, all URLs still `null`).

All of it is imported **only** under `components/landing/**` behind
`dynamic(ssr:false)`, so app routes' bundles are unaffected (`/home` ≈ 106 kB).

## How it works

One persistent WebGL canvas fixed behind ~800vh of scrolling DOM. Eight
"beats" (hero → roots → rain → dawn → sapling → bloom → night → CTA).

- **Scroll:** Lenis is driven by GSAP's ticker so smooth-scroll, ScrollTrigger
  reveals and the frame loop share one RAF. Progress lives in a mutable module
  singleton (`scroll/scrollState.ts`) — **never React state**; the frame loop
  reads it directly.
- **`chapters/chapterConfig.ts` is the color script** — per beat: camera
  position/lookAt, fog, sky top/bottom, sun direction/size/halo, cloud amount,
  ground, accent, and the Spline slot. Everything lerps between adjacent beats.
- **Camera** rides Catmull-Rom curves through the 8 beat positions with damped
  mouse parallax and a breathing drift.
- **`tree/TreeSystem.tsx` — one continuous organism.** A seeded skeleton
  (`treeSkeleton.ts`, deterministic via `lib/rng.ts`) generates roots, a
  low-forking bole, trunk, limbs and twigs as radius-continuous tapered tubes
  (`lib/taperedTube.ts`), merged into a single draw call. One scalar
  (`treeGrowth(x)`) grows the whole thing as you scroll, with an ember
  "growth frontier" crawling through new wood. Leaves/blossoms are instanced
  geometry keyed to per-instance birth times. The tree is the connective
  thread across every beat.
- **Vignettes** (`vignettes/`) run in parallel per chapter: `Mycelium`,
  `WishSeed`, `PaperBoat`, `Butterflies`, `GrassField`, `ForestBackdrop`,
  `Campsite`, `Swing`, `Lanterns`, `ShootingStars`, `Fireworks`.
- **Painted backdrops** (`canvas/BackdropPlane.tsx`): seven Niji 7 images in
  `public/landing/backdrops/`. Camera-following billboards at 80 units,
  depth-written so opaque 3D always occludes them, crossfading between beats.
  Fully optional — a missing file silently keeps the procedural sky. On load
  each painting's horizon band is sampled and `SceneAtmosphere` pulls scene fog
  toward that color, and fades its own procedural hills/clouds out for painted
  beats. Prompt pack: `docs/midjourney-prompts.md`.

## Fallbacks & debug

- `prefers-reduced-motion` / no WebGL2 / `?static=1` → `StaticFallback` (full
  copy parity, CSS gradient bands, **no 3D chunk downloaded**).
- Device tiers (`hooks/quality.tsx`) scale particle counts, DPR and post.
- **`/?beat=N`** pins any beat (0–7) with no scrolling — the main design tool.
  It also switches the canvas to a manual render loop.
- `window.sproutLenis` exposed in dev.

## Local dev gotcha

The branch lives in a **git worktree**, not the main checkout. Run the dev
server from the worktree or you'll be looking at `main`:

```bash
cd .claude/worktrees/sprout-3d-parallax-home-365113/apps/web
pnpm exec next dev --turbopack --port 3102
```

`apps/web/.env.local` there needs `DEV_BYPASS_AUTH=true` (middleware gates
every route, `/` included) and the worktree has its own `data/sprout.db`.
Running `pnpm build` while a dev server is up corrupts `.next` — delete it and
restart if pages start 500ing.

## Open problems — the active workshop

The painted backdrops and the procedural 3D are **not yet reading as one
image.** Specifics observed:

1. **Two visual languages.** The Niji paintings are soft, detailed and
   painterly; the 3D is flat-shaded low-poly with hard edges. Daylight beats
   (3, 4, 5) expose this most; night and hero hide it best. This is the
   central problem — likely needs the 3D pushed toward the painting (toon/
   gradient ramp shading, painted textures, softer silhouettes) rather than
   the other way.
2. **Backdrops are a single flat billboard** — no parallax between painted
   depth layers, so it reads as a photo backdrop behind toys rather than a
   world. Splitting each painting into 2–3 depth planes (or generating
   separate sky/hills/near layers) would help.
3. **Foreground props are crude** relative to everything else: the grass reads
   as bright spiky shards rather than lush meadow; the campsite figures,
   tents and `ForestBackdrop` cones are placeholder-grade.
4. **Lighting mismatch** — each painting has a baked sun direction that
   doesn't necessarily agree with the beat's 3D key light.
5. **`roots.webp` doesn't read as underground** (it looks like a sunset over
   water) — worth a reroll with a stronger subterranean prompt.
6. **Copy legibility** over the brighter paintings leans on the blur scrim;
   worth revisiting per beat.

Motion was verified only via per-beat stills (the automation browser runs
hidden, which suspends rAF) — **a real scroll-through on device is still
needed**, and Safari GPU behavior on the Mac mini is untested.
