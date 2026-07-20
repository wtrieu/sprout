# Landing page (`/`) — architecture & current state

Living notes for the cinematic scroll-driven landing experience. The page is
now a **2.5D painted storybook**: one visual language (Violet Evergarden /
KyoAni painted art) staged as layered planes the camera flies through. The
earlier hybrid — painterly backdrops behind flat-shaded low-poly 3D — and its
"two visual languages" problem are gone; the geometry was retired wholesale
in the painted rebuild.

## Routes

Route groups keep the landing chrome-free without touching app URLs:

- `app/(landing)/page.tsx` → `LandingExperience` (full-bleed, Fraunces serif)
- `app/(app)/layout.tsx` → the old nav/footer/`max-w-3xl` chrome
- `app/(app)/home/page.tsx` → the dashboard, at `/home`; the landing's final
  CTA steps inside to it.

## Stack

`three` · `@react-three/fiber@9` · `@react-three/drei@10` ·
`@react-three/postprocessing@3` · `lenis` · `gsap` (+ScrollTrigger). All of
it imported **only** under `components/landing/**` behind `dynamic(ssr:false)`
— app routes' bundles are unaffected.

## How it works

One persistent WebGL canvas fixed behind ~800vh of scrolling DOM. Eight
"beats" (hero → roots → rain → dawn → noon → golden → night → CTA).

- **Scroll:** Lenis driven by GSAP's ticker — smooth-scroll, ScrollTrigger
  reveals and the frame loop share one RAF. Progress lives in a mutable
  module singleton (`scroll/scrollState.ts`), never React state.
- **`chapters/chapterConfig.ts` is the camera + color script** — per beat:
  camera position/lookAt, fog, sky, sun, clouds, lights, accent. Everything
  lerps between adjacent beats.
- **`chapters/layerManifest.ts` is the scene script** — the paper theater.
  Per beat: painted layers (`sky` billboard + world-anchored `card` planes,
  full-bleed mids and alpha-cutout nears) with per-layer placement, motion,
  tier gating and optional video; plus declarative particle recipes.
- **Camera** rides Catmull-Rom curves through the 8 beat stations with damped
  mouse parallax and a breathing drift. Cards are staged on each beat's view
  axis and face the beat camera *once at placement* — the camera's travel
  produces true depth parallax across the layers.
- **Ambient life** (`materials/paintedLayerMaterial.ts`): one shader for all
  painted planes — oscillating UV drift (clouds/mist), continuous UV scroll
  (tileable art only), uv.y²-weighted vertex sway (foliage), and a soft
  edge-mix toward scene fog. Particle weather (`particles/ParticleField`)
  renders each manifest recipe in one draw call per field.
- **The wish-mote** (`canvas/WishMote.tsx`) is the connective thread: a
  single glowing ❋ riding an offset camera-parallel path from seed to
  canopy, tinted by each beat's accent. At the finale it descends and
  settles into the ❋ on the CTA button (`canvas/moteTarget.ts` bridges the
  DOM and canvas roots). The tree itself lives *in the paintings*, one life
  stage per beat.
- **Painted skies** (`canvas/scenes/SkyLayer.tsx`): camera-following
  billboards at 80 units, crossfading between beats. Each painting's horizon
  band is sampled and `SceneAtmosphere` pulls scene fog toward it; the
  procedural sky/hills remain the no-asset fallback and fade out as
  paintings load.
- **Video loops** (`canvas/scenes/VideoLayer.tsx`): hero, golden and night
  skies can carry ambient loops (the finale shares night's). Armed on beat
  approach, released two beats away; the painted still is the loop's poster
  frame, so handover is seamless and every failure mode lands back on the
  still. Never fetched on the low tier.
- **Texture residency** (`canvas/scenes/useSceneTextures.ts`): card textures
  load in a `[current−1, current+2]` beat window; low/mid tiers dispose
  outside it (low decodes half-res), high keeps visited textures resident.

## Assets

All optional, all drop-in: `public/landing/scenes/<dir>/<layer>.webp`
(+ `.webm`/`.mp4` for video skies). Missing file → layer silently skipped.
The legacy `public/landing/backdrops/` files still serve as sky fallbacks
until the scenes/ art lands, then the folder can be deleted. Generation
pipeline, prompts, budgets and QA: **`docs/landing-art-pipeline.md`**.

## Fallbacks & debug

- `prefers-reduced-motion` / no WebGL2 / `?static=1` → `StaticFallback`
  (full copy parity, painted skies as CSS backgrounds over gradient bands,
  no 3D chunk downloaded).
- Device tiers (`hooks/quality.tsx`) scale particle counts, DPR, post, near
  layers and video; `PerformanceMonitor` auto-demotes.
- **`/?beat=N`** pins any beat (0–7, halves allowed) with no scrolling — the
  main design tool. Switches the canvas to a manual render loop.
- **`/?tier=low|mid|high`** forces a quality tier.
- `window.sproutLenis` exposed in dev.

## Local dev

```bash
cd apps/web
pnpm exec next dev --turbopack --port 3102
```

`apps/web/.env.local` needs `DEV_BYPASS_AUTH=true` (middleware gates every
route, `/` included). Running `pnpm build` while a dev server is up corrupts
`.next` — delete it and restart if pages start 500ing.

## Open items

1. **Art drops** — the whole point: skies (noon anchor first, roots reroll),
   mids, nears, three video loops. See the pipeline doc's suggested order.
2. **Real-device pass** — motion has been verified beat-by-beat via stills;
   a physical scroll-through (and Safari on the Mac mini) is still needed,
   especially the crossfade half-beats and the finale landing.
3. **Card placement tuning** — distances/offsets in the manifest are staged
   defaults; expect a tuning pass per beat once real art is in.
