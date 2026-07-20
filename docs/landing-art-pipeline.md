# Landing art pipeline — Midjourney → Magnific → Higgsfield

The `/` landing is a 2.5D painted storybook: every beat is a diorama of
layered paintings (a far **sky**, a **mid** card, a **near** cutout) that the
camera flies through, plus ambient video loops on three beats. This doc is
the complete generation pipeline. Everything here is drop-in: files land in
`apps/web/public/landing/scenes/<dir>/` with the exact names below and appear
on refresh — **no code changes, ever**. Missing files are skipped silently
(procedural sky remains), so work in any order after the anchor.

The layer script itself (placement, motion, tiers) lives in
`apps/web/src/components/landing/chapters/layerManifest.ts`.

## The stack

| Tool | Role | Sub |
|---|---|---|
| **Midjourney Niji 7** | base art, all layers | Basic (~200 gens/mo; this pack ≈ 60–90 with rerolls — plan for two months or one Standard month) |
| **Magnific** | upscale + detail for full-screen 21:9 | the single biggest quality jump for skies/mids |
| **Higgsfield** | image-to-video ambient loops (hero, golden, night) | 3 loops + rerolls |

## Global rules

1. **Aspect & size.** Skies and mids: generate `--ar 21:9`, Magnific-upscale
   to ~3K wide, then downscale/export to **2560×1097 WebP q78–82, ≤ 350 KB**.
   Cutouts: export **2048 px wide straight-alpha WebP, ≤ 350 KB**.
   Never ship wider than 2560 — it's GPU memory with no visual gain.
2. **Mobile safe area.** Phones cover-crop 21:9 to portrait hard: keep each
   painting's *essential* composition inside the **central ~9:16 band**;
   edges are bonus scenery.
3. **Text-safe side.** Each beat's copy side must stay quiet — low detail,
   mid-to-dark values, no bright shapes. Noted per layer below. As a
   finishing step (Magnific output → any editor), bake a soft darkening
   gradient (~15–25% black, feathered wide) into that side of skies/mids.
4. **Tree continuity.** The story's tree appears at a life stage per beat
   (noted below). Same tree, one artist — carry the anchor `--sref` everywhere.
5. **No grain in assets.** The page composites its own film grain
   (`.landing-noise`); ask Magnific for clean output, grain off.
6. **WebP conversion.**
   `cwebp -q 80 -m 6 in.png -o out.webp` (opaque) ·
   `cwebp -q 80 -exact -alpha_q 100 in.png -o out.webp` (cutouts).

## Style anchor (unchanged ritual, upgraded target)

Generate/upgrade **`noon/sky.webp`** first — it defines the whole look. Copy
the image URL of your chosen upscale and append to **every** other prompt:

```
--sref <your-noon-image-url> --sw 250
```

**Shared style DNA** (open every prompt with this):

> beautiful anime background art, Kyoto Animation style, Violet Evergarden
> background painting, soft diffused lighting, painterly detail, gentle
> color grading

**Shared negative** (close every prompt with this, plus per-layer additions):

> --no text, watermark, logo, people, buildings, animals

## Cutout workflow (near layers)

Near layers are alpha cutouts. Generate the subject **isolated on a plain
flat background**, then remove it:

1. Prompt with `..., isolated on flat pale grey background, full subject in
   frame, nothing cropped` (grey survives edge-matting better than white).
2. Background removal: Photoshop *Select Subject* → *Select and Mask* →
   feather 1px / shift edge −20%, or remove.bg for simple silhouettes.
3. **No white fringing**: export straight (non-premultiplied) alpha; check
   the edge over a dark fill before exporting. The shader also alpha-tests,
   but a bad matte over a bright sky is unfixable in code.
4. When a cutout wants to *be* part of its scene's painting (e.g. the meadow
   edge), alternative path: Magnific-upscale the full scene, manually
   segment the foreground band, and matte that instead — better light
   continuity, more hand-work. Prefer isolated generation unless the seam
   shows.

## Magnific settings

| Layer class | Scale | Creativity | Resemblance | Notes |
|---|---|---|---|---|
| sky / mid | 2× (to ~3K) | 2–4 | 7–8 | "illustration/anime" mode; grain OFF |
| cutout | 2× | 1–2 | 8–9 | run **before** background removal |
| video poster | n/a | — | — | the still IS the poster; don't diverge after loop generation |

Low creativity is deliberate: we want detail recovery, not reinterpretation —
`--sref` cohesion must survive the upscale.

---

# The layers

Folder = `apps/web/public/landing/scenes/`. **Bold** files are video beats.

## `hero/` — Beat 0 · twilight underground (copy: center) — **video beat**

**`sky.webp`** — keep/reroll of the current hero backdrop:
```
[style DNA], dreamlike underground twilight in deep indigo and violet, soft glowing pastel bokeh lights drifting in darkness, one faint warm golden glow low in the frame like a buried seed of light, nebula-like darkness soft as soil, quiet and wondrous, dark quiet center --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals, sun, moon, sky, horizon
```
Tree stage: the glowing seed. Center stays darkest (headline sits there).

`mist.webp` — full-bleed mid, drifts slowly:
```
[style DNA], translucent veils of luminous violet mist drifting through darkness, soft wisps and gossamer haze, very low contrast, ethereal, mostly transparent darkness between wisps, dark quiet center --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals, ground, horizon
```
Reads over the sky at 85% opacity — keep values low so copy stays legible.

`threads.webp` — near cutout, sways:
```
single delicate luminous gossamer root-threads hanging like glowing kelp strands, anime background art style, faint violet and gold light, sparse and wispy, isolated on flat pale grey background --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals
```
Sparse is the goal — a frame, not a curtain. Keep the center third empty.

**`sky.webm` + `sky.mp4`** — Higgsfield loop over the final `sky.webp` (§ Video loops).

## `roots/` — Beat 1 · rooted at home (copy: left)

**`sky.webp` — REROLL REQUIRED.** The current file reads as a sunset over
water, not underground:
```
[style DNA], underground earth cross-section in deep plum and warm umber, soft strata of soil and stone fading into darkness, warm amber lamplight glow seeping from a burrow deep on the right side, faint root silhouettes threading downward, cozy subterranean stillness, left third quiet and dark --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals, sky, horizon, sun, water, sunset
```
Tree stage: first roots reaching down. Right side carries the interest.

`glow.webp` — full-bleed mid:
```
[style DNA], wall of fine glowing amber roots branching through dark plum soil, warm light tracing the root filaments like veins of gold, soft ember bokeh drifting, right side luminous, left third dark and quiet --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals, sky, horizon
```

`arch.webp` — near cutout (offset right in-scene):
```
dark root and stone archway framing the right edge of frame, anime background art style, plum-brown silhouette with faint amber rim light, organic curling roots, isolated on flat pale grey background, left two-thirds empty --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals
```

## `rain/` — Beat 2 · first rain (copy: right)

`sky.webp` — keep/reroll of the current rain backdrop; add negative-space
constraint `right third quiet, soft empty storm light` to the original
prompt (see git history of `docs/midjourney-prompts.md` for the base).
Tree stage: none visible — the world waits.

`hills.webp` — full-bleed mid:
```
[style DNA], rain-hazed rolling hills in slate blue and silver-green, veils of falling rain softening the ridgelines, low cloud drifting between hills, wet meadow light, melancholy but warm, right third quiet and soft --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals, lightning, umbrella
```

`grass.webp` — near cutout (offset left/low, sways):
```
wet meadow grass and wildflower stems edge, rain-heavy blades bowing, anime background art style, slate green with silver highlights, bottom-left corner foreground band, isolated on flat pale grey background, upper right empty --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals
```

## `dawn/` — Beat 3 · breaking through (copy: left)

`sky.webp` — keep the current dawn backdrop (it works), or reroll with
`left third quiet` appended.
Tree stage: the sprout — but it lives on the near layer, not the sky.

`rays.webp` — **additive** full-bleed mid (drawn in Screen-like blending —
black is invisible):
```
soft golden god rays fanning from upper right on pure black background, anime lighting effect, volumetric morning light shafts through haze, gentle warm amber, painterly soft edges, left third pure black --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals, sun disc, lens flare
```
Pure black ground is essential — it's composited additively.

`sprout.webp` — near cutout (offset right/low, sways) — **the signature
close-up**:
```
single young sprout with two dewy leaves breaking through dark soil ridge, anime background art style, Violet Evergarden painterly detail, backlit by golden dawn light, dew drops glinting, small soil crumbs, isolated on flat pale grey background --ar 16:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals
```

## `noon/` — Beat 4 · fairy-tale meadow ⭐ ANCHOR (copy: right)

**`sky.webp`** — regenerate the anchor at full quality (this is also the
`--sref` source for everything else):
```
[style DNA], vivid blue summer sky with towering white cumulus clouds, sunlit fairy-tale meadow horizon, distant storybook forest treeline in spring greens with one sakura pink tree, one slender young tree standing alone in the meadow middle distance, lush rolling grass, low horizon, right third open empty sky --ar 21:9 --no text, watermark, logo, people, buildings, animals
```
Tree stage: the young sapling, proud and small, left-of-center.

`treeline.webp` — full-bleed mid:
```
[style DNA], storybook forest treeline across the middle distance, layered spring greens with one sakura pink tree, soft sunlit canopy shapes, gentle atmospheric haze at the base, right third low and open --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals, sky
```

`meadow.webp` — near cutout (offset left/low, sways):
```
lush meadow grass foreground band with wildflowers and dandelions, anime background art style, sun-warmed spring greens with gold light through the blades, bottom-left sweeping edge, isolated on flat pale grey background, upper right empty --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals
```

## `golden/` — Beat 5 · in bloom at golden hour (copy: left) — **video beat**

**`sky.webp`** — keep/reroll current golden backdrop with `left third quiet`
appended. Tree stage: in full blossom — put the blooming tree right-of-center
on the horizon if rerolling.

`hills.webp` — full-bleed mid:
```
[style DNA], darkening rolling hills under violet and burnt-orange golden hour light, warm amber haze pooling in the valleys, pink blossom glow catching the ridgelines, nostalgic evening warmth, left third quiet and dim --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals
```

`branch.webp` — near cutout (offset upper-right, sways):
```
blossoming tree branch reaching in from the upper right corner, anime background art style, pink and white petals with warm golden rim light, a few petals drifting off, isolated on flat pale grey background, lower left empty --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals
```

**`sky.webm` + `sky.mp4`** — Higgsfield loop (§ Video loops).

## `night/` — Beat 6 · under the canopy (copy: center) — **video beat**

**`sky.webp`** — keep/reroll current night backdrop; the center must stay
open starry sky (headline + chips sit there).
Tree stage: implied grandeur — the canopy belongs to the near layers.

`forest.webp` — full-bleed mid (also reused by the finale, nearer):
```
[style DNA], dark forest canopy silhouettes framing a moonlit indigo sky, deep blue-black leaf masses along the bottom and sides, a few gaps where stars shine through, serene bedtime stillness, open center --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals, moon
```

`lanterns.webp` — near cutout (offset high, sways):
```
string of small glowing paper lanterns hanging across the upper frame, anime background art style, warm amber and soft gold glow, gentle catenary curve of string, dark night behind, isolated on flat pale grey background, lower half empty --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals
```

**`sky.webm` + `sky.mp4`** — Higgsfield loop, shared by the finale (§ below).

## `cta/` — Beat 7 · the finale (copy: center)

Borrows `night/sky.*` and `night/forest.webp` automatically. One own file:

`canopy.webp` — near cutout (offset high):
```
grand tree canopy interior framing the top and sides of frame, anime background art style, dark blue-green leaf masses with one open glowing nook of warm golden light at upper center, a place where a small light could rest, isolated on flat pale grey background, center and lower frame empty --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, animals
```
The glowing nook is where the wish-mote comes to rest above the CTA button —
keep it at upper center, small and warm.

---

# Video loops (Higgsfield)

Three loops, each generated **from the final still** (image-to-video), so the
still is literally the loop's poster frame — the page swaps still → video
seamlessly once frames are rendering, and any failure just leaves the still.

**Hard rules for every loop:**
- **Allowed motion:** drifting bokeh/mist, cloud drift, star twinkle,
  lantern bob, petal drift, gentle light pulsing.
- **Forbidden:** camera moves (pan/zoom/parallax), structural change
  (nothing appears, disappears, or moves position), color shifts. The first
  frame must remain a faithful match to the still at all times.
- Loop mode ON (first frame = last frame), 6–10 s, subtle > showy.

| File | Source still | Motion brief |
|---|---|---|
| `hero/sky.webm/.mp4` | `hero/sky.webp` | bokeh lights drift and breathe, gossamer threads shimmer faintly, the buried golden glow pulses very slowly |
| `golden/sky.webm/.mp4` | `golden/sky.webp` | pink clouds drift slowly right, amber haze shimmers, a few petals cross the frame |
| `night/sky.webm/.mp4` | `night/sky.webp` | stars twinkle at varied rates, thin silver clouds drift past the moon, moonlight breathes gently |

**Seam check:** play the file twice in a row (`ffplay -loop 2 loop.mp4`). If
the loop point pops, self-crossfade the tail (adjust `DUR` = clip length):

```bash
ffmpeg -i loop.mp4 -filter_complex \
  "[0:v]split[a][b];[a]trim=start=0.7,setpts=PTS-STARTPTS[main];\
   [b]trim=duration=0.7,setpts=PTS-STARTPTS[head];\
   [main][head]xfade=transition=fade:duration=0.7:offset=$(echo "DUR-1.4" | bc)[v]" \
  -map "[v]" -an seamless.mp4
```

**Encode** (1920×822, both containers, no audio):

```bash
# WebM VP9 — target ≤ 4 MB
ffmpeg -i seamless.mp4 -an -vf "scale=1920:822:force_original_aspect_ratio=increase,crop=1920:822" \
  -c:v libvpx-vp9 -b:v 3M -maxrate 4M -row-mt 1 -pix_fmt yuv420p sky.webm
# MP4 H.264 fallback — target ≤ 5 MB
ffmpeg -i seamless.mp4 -an -vf "scale=1920:822:force_original_aspect_ratio=increase,crop=1920:822" \
  -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart sky.mp4
```

---

# Drop-in QA checklist

Per file: correct folder/name → size within budget (skies/mids ≤ 350 KB,
videos ≤ 4/5 MB) → refresh `http://localhost:3102/?beat=N` → the layer
appears; scrub the neighboring half-beats (`?beat=N.5`) for seams; check
copy legibility on the beat's text side; check a portrait viewport.

| Beat N | Folder | Expect to see |
|---|---|---|
| 0 | hero | sky (+ loop after ~a beat of settling), mist drift, threads sway |
| 1 | roots | underground sky, glowing root wall, arch frame right |
| 2 | rain | storm sky, hazed hills, wet grass lower-left |
| 3 | dawn | sunrise, breathing rays, sprout close-up right |
| 4 | noon | anchor sky, treeline, meadow sweep lower-left |
| 5 | golden | sky (+ loop), hills, blossom branch upper-right |
| 6 | night | sky (+ loop), forest silhouettes, lantern string |
| 7 | cta | night art nearer + canopy nook; the ❋ settles into the button |

Suggested order: **noon anchor → roots reroll → remaining skies → mids →
nears → video loops.** The page upgrades beat by beat as files land; nothing
ever breaks while a file is missing.
