# Landing art pipeline (phone-friendly)

Generate the painted layers for the `/` landing storybook. **Each asset below
is one complete, tap-to-copy prompt** — nothing to stitch together. Generate
on your phone, save the source image/video, and do the desk-only finishing
(convert, upscale, encode) later from the **Appendix** at the bottom.

Drop files into `apps/web/public/landing/scenes/<dir>/` with the **exact
name** shown. Missing files are skipped silently, so work in any order after
the anchor — the page upgrades one layer at a time, nothing ever breaks.

---

## Read once, then go

- **Tool / model.** Midjourney → Settings → Model **Niji**, Version **7**.
  (Bake-off in progress: you may also be testing Nano Banana 2 / Kling on
  Higgsfield — see the video section. These prompts are written for Niji;
  for Nano Banana, paste the same wording as plain prose and drop the `--`
  flags.)
- **Plan.** Midjourney **Standard ($30)** — unlimited Relax stills + GPU for
  video. Basic can't realistically do the video loops.
- **The anchor + `NOON_URL`.** Do **Step 1 (noon/sky)** first — it defines the
  whole look. Then copy its image URL once. Every other prompt ends with
  `--sref NOON_URL --sw 250`; after pasting a prompt, **double-tap the
  `NOON_URL` token and paste your real URL over it**. It's the same URL all
  session, so it becomes muscle memory.
- **Resolution.** Generate/upscale at **2K** (4K if you want margin — we
  downscale to 2560 px wide either way).
- **🔪 cutouts** say "isolated on flat pale grey background" — that's on
  purpose. Just generate + save on the phone; background removal is a desk
  step (Appendix).
- **Save to the exact filename**, drop in the folder, refresh. Done.

**Markers:** ⭐ anchor · ♻️ reroll needed · 🔪 cutout (matte at a desk) ·
🎬 video beat (also needs a loop, see Video section)

---

## Progress checklist

```
[ ] STEP 1  noon/sky      ⭐ anchor — do first
[ ] roots/sky   ♻️
[ ] hero/sky   🎬     [ ] hero/mist       [ ] hero/threads   🔪
[ ] roots/glow        [ ] roots/arch     🔪
[ ] rain/sky          [ ] rain/hills      [ ] rain/grass     🔪
[ ] dawn/sky          [ ] dawn/rays       [ ] dawn/sprout    🔪
[ ] noon/treeline     [ ] noon/meadow    🔪
[ ] golden/sky 🎬     [ ] golden/hills    [ ] golden/branch  🔪
[ ] night/sky  🎬     [ ] night/forest    [ ] night/lanterns 🔪
[ ] cta/canopy 🔪
[ ] videos: hero 🎬   golden 🎬   night 🎬  (night is shared by the finale)
```

Suggested order: **noon anchor → roots reroll → remaining skies → mids →
cutouts → video loops.**

---

## STEP 1 — the anchor ⭐ (no sref)

### `noon/sky.webp` — Beat 4 · fairy-tale meadow

> Do this first. It's the `--sref` source for every other prompt. Copy its
> image URL when done. Tree stage: young sapling, proud and small,
> left-of-center. Keep the right third open (copy sits there).

```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, vivid blue summer sky with towering white cumulus clouds, sunlit fairy-tale meadow horizon, distant storybook forest treeline in spring greens with one sakura pink tree, one slender young tree standing alone in the meadow middle distance, lush rolling grass, low horizon, right third open empty sky --ar 21:9 --no text, watermark, logo, people, buildings, animals
```

---

## Beat 0 — hero · twilight underground 🎬

### `hero/sky.webp`
> Tree stage: the glowing seed. Keep the center darkest — the headline sits there.
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, dreamlike underground twilight in deep indigo and violet, soft glowing pastel bokeh lights drifting in darkness, one faint warm golden glow low in the frame like a buried seed of light, nebula-like darkness soft as soil, quiet and wondrous, dark quiet empty center --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, sun, moon, sky, horizon
```

### `hero/mist.webp` — mid, drifts
> Sits over the sky at ~85% opacity — keep values low so copy stays legible.
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, translucent veils of luminous violet mist drifting through darkness, soft wisps and gossamer haze, very low contrast, ethereal, mostly transparent darkness between wisps, dark quiet center --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, ground, horizon
```

### `hero/threads.webp` 🔪 near cutout, sways
> Sparse — a frame, not a curtain. Keep the center third empty.
```
single delicate luminous gossamer root-threads hanging like glowing kelp strands, anime background art style, faint violet and gold light, sparse and wispy, isolated on flat pale grey background --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

---

## Beat 1 — roots · rooted at home

### `roots/sky.webp` ♻️ reroll needed
> The current file reads as sunset-over-water. Tree stage: first roots reaching
> down. Right side carries the interest; keep the left third dark (copy there).
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, underground earth cross-section in deep plum and warm umber, soft strata of soil and stone fading into darkness, warm amber lamplight glow seeping from a burrow deep on the right side, faint root silhouettes threading downward, cozy subterranean stillness, left third quiet and dark --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, sky, horizon, sun, water, sunset
```

### `roots/glow.webp` — mid
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, wall of fine glowing amber roots branching through dark plum soil, warm light tracing the root filaments like veins of gold, soft ember bokeh drifting, right side luminous, left third dark and quiet --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, sky, horizon
```

### `roots/arch.webp` 🔪 near cutout (frames the right edge)
```
dark root and stone archway framing the right edge of frame, anime background art style, plum-brown silhouette with faint amber rim light, organic curling roots, isolated on flat pale grey background, left two-thirds empty --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

---

## Beat 2 — rain · first rain

### `rain/sky.webp`
> Tree stage: none — the world waits. Keep the right third quiet (copy there).
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, overcast storm sky in slate blue and silver over distant rolling hills, heavy soft rainclouds with faint silver linings, gentle rain haze, wet meadow horizon reflecting pale light, melancholy but warm, low horizon, right third quiet and soft --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, lightning, umbrella
```

### `rain/hills.webp` — mid
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, rain-hazed rolling hills in slate blue and silver-green, veils of falling rain softening the ridgelines, low cloud drifting between hills, wet meadow light, melancholy but warm, right third quiet and soft --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, lightning, umbrella
```

### `rain/grass.webp` 🔪 near cutout (lower-left, sways)
```
wet meadow grass and wildflower stems edge, rain-heavy blades bowing, anime background art style, slate green with silver highlights, bottom-left corner foreground band, isolated on flat pale grey background, upper right empty --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

---

## Beat 3 — dawn · breaking through

### `dawn/sky.webp`
> Tree stage: the sprout — but it lives on the cutout, not the sky. Keep the
> left third quiet (copy there).
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, violet to amber sunrise sky, low golden sun on the right side with soft god rays through morning haze, layered purple hills, dew-bright horizon line, hopeful morning light, low horizon, sun right of center, left third quiet --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

### `dawn/rays.webp` — additive mid (**pure black background is essential**)
> Composited additively — black is invisible, only the light shows.
```
soft golden god rays fanning from upper right on pure black background, anime lighting effect, volumetric morning light shafts through haze, gentle warm amber, painterly soft edges, left third pure black --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, sun disc, lens flare
```

### `dawn/sprout.webp` 🔪 near cutout — **the signature close-up**
```
single young sprout with two dewy leaves breaking through dark soil ridge, anime background art style, Violet Evergarden painterly detail, backlit by golden dawn light, dew drops glinting, small soil crumbs, isolated on flat pale grey background --ar 16:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

---

## Beat 4 — noon · fairy-tale meadow

### `noon/sky.webp` ⭐ — **already done in Step 1** (skip)

### `noon/treeline.webp` — mid
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, storybook forest treeline across the middle distance, layered spring greens with one sakura pink tree, soft sunlit canopy shapes, gentle atmospheric haze at the base, right third low and open --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, sky
```

### `noon/meadow.webp` 🔪 near cutout (lower-left, sways)
```
lush meadow grass foreground band with wildflowers and dandelions, anime background art style, sun-warmed spring greens with gold light through the blades, bottom-left sweeping edge, isolated on flat pale grey background, upper right empty --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

---

## Beat 5 — golden · in bloom at golden hour 🎬

### `golden/sky.webp`
> Tree stage: full blossom — the blooming tree right-of-center on the horizon.
> Keep the left third quiet (copy there).
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, violet and burnt-orange golden hour sky, pink-lit clouds drifting, warm amber haze over darkening rolling hills, one blossoming tree right of center on the horizon, sun low on the left, nostalgic evening warmth, low horizon, left third quiet --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

### `golden/hills.webp` — mid
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, darkening rolling hills under violet and burnt-orange golden hour light, warm amber haze pooling in the valleys, pink blossom glow catching the ridgelines, nostalgic evening warmth, left third quiet and dim --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

### `golden/branch.webp` 🔪 near cutout (upper-right, sways)
```
blossoming tree branch reaching in from the upper right corner, anime background art style, pink and white petals with warm golden rim light, a few petals drifting off, isolated on flat pale grey background, lower left empty --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

---

## Beat 6 — night · under the canopy 🎬

### `night/sky.webp`
> Keep the center open starry sky — headline + chips sit there. Tree stage:
> implied grandeur; the canopy belongs to the cutouts.
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, moonlit indigo night sky full of small stars, luminous full moon upper left, thin silver clouds, deep blue darkness, dark rolling hill silhouettes along the bottom edge, serene bedtime stillness, very low horizon, open starry sky in center --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, fireworks
```

### `night/forest.webp` — mid (also reused by the finale, nearer)
```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, soft diffused lighting, painterly detail, gentle color grading, dark forest canopy silhouettes framing a moonlit indigo sky, deep blue-black leaf masses along the bottom and sides, a few gaps where stars shine through, serene bedtime stillness, open center --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals, moon
```

### `night/lanterns.webp` 🔪 near cutout (upper frame, sways)
```
string of small glowing paper lanterns hanging across the upper frame, anime background art style, warm amber and soft gold glow, gentle catenary curve of string, dark night behind, isolated on flat pale grey background, lower half empty --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

---

## Beat 7 — cta · the finale

> Borrows `night/sky.*` and `night/forest.webp` automatically. One own file.

### `cta/canopy.webp` 🔪 near cutout
> The glowing nook is where the wish-mote rests above the CTA button — keep it
> upper-center, small and warm.
```
grand tree canopy interior framing the top and sides of frame, anime background art style, dark blue-green leaf masses with one open glowing nook of warm golden light at upper center, a place where a small light could rest, isolated on flat pale grey background, center and lower frame empty --ar 21:9 --sref NOON_URL --sw 250 --no text, watermark, logo, people, buildings, animals
```

---

# 🎬 Video loops — hero · golden · night

Each loop is made **from that beat's finished `sky.webp`** (image-to-video),
so the still is the loop's poster frame and the page swaps still→video
seamlessly. Night's loop is shared by the finale.

**Every loop, both systems:** loop ON (first frame = last frame), **Low
Motion**, ~5 s, subtle beats showy. Allowed: drifting bokeh/mist, cloud
drift, star twinkle, petal drift, gentle light pulsing. **Forbidden:** any
camera move, anything appearing/disappearing/travelling, color shifts.

**Setup — Midjourney (recommended):** open the still → **Animate** → Motion
**Low** → tick **Loop** (Ending Frame section) → paste the motion prompt →
**don't extend** past the first 5 s (extending regenerates the ending and
breaks the loop).

**Setup — Kling 3.0 on Higgsfield (bake-off):** Create → Video → **Kling** →
**General preset** → upload the still as **both Start Frame and End Frame** →
5 s → paste the motion prompt → paste the negative prompt in its field.

**Kling negative prompt** (paste into Kling's negative field):
```
camera movement, zoom, pan, dolly, parallax, new objects appearing, people, animals, scene change, color shift, flicker, fast motion
```

### hero loop — motion prompt
```
Static camera, no camera movement. Soft pastel bokeh lights drift very slowly upward and sideways, gently pulsing in brightness like distant fireflies. Faint luminous gossamer threads shimmer subtly. The warm golden glow low in the frame breathes slowly, brightening and dimming like a heartbeat. Dreamlike, quiet, meditative pace. Everything stays in place; nothing new appears.
```

### golden loop — motion prompt
```
Static camera, no camera movement. Pink-lit clouds drift slowly and continuously to the right. Warm amber haze shimmers gently over the hills. Two or three small blossom petals float lazily across the frame on the breeze. The golden light breathes very subtly. Nostalgic, calm, slow evening pace. Hills and horizon stay perfectly still; nothing new appears.
```

### night loop — motion prompt
```
Static camera, no camera movement. Small stars twinkle gently at different rates across the sky. Thin silver clouds drift very slowly past the moon. The moonlight halo breathes almost imperceptibly. Deep, serene bedtime stillness, extremely slow pace. The moon and hill silhouettes stay perfectly still; nothing new appears.
```

Save the raw MP4; convert to `sky.webm` + `sky.mp4` at a desk (Appendix).

---

# Drop-in QA (once files are on the dev machine)

Per file: exact folder/name → refresh `http://localhost:3102/?beat=N` → the
layer appears; scrub the half-beats (`?beat=N.5`) for seams; check copy
legibility on the beat's text side; check a portrait viewport.

| Beat | Expect to see |
|---|---|
| 0 hero | sky (+ loop after ~a beat), mist drift, threads sway |
| 1 roots | underground sky, glowing root wall, arch frame right |
| 2 rain | storm sky, hazed hills, wet grass lower-left |
| 3 dawn | sunrise, breathing rays, sprout close-up right |
| 4 noon | anchor sky, treeline, meadow sweep lower-left |
| 5 golden | sky (+ loop), hills, blossom branch upper-right |
| 6 night | sky (+ loop), forest silhouettes, lantern string |
| 7 cta | night art nearer + canopy nook; the ❋ settles into the button |

---

# Appendix — AT A DESK (not on the phone)

<details>
<summary><b>Size + WebP conversion</b></summary>

Skies/mids: **2560×1097 WebP q78–82, ≤ 350 KB**. Cutouts: **2048 px wide
straight-alpha WebP, ≤ 350 KB**. Never ship wider than 2560 (GPU memory, no
visual gain). Don't bake film grain — the page adds its own.

```bash
cwebp -q 80 -m 6 in.png -o out.webp                 # opaque (sky / mid)
cwebp -q 80 -exact -alpha_q 100 in.png -o out.webp  # cutout (straight alpha)
```
</details>

<details>
<summary><b>🔪 Cutout background removal</b></summary>

1. Generated on flat pale grey (grey mattes cleaner than white).
2. Photoshop *Select Subject* → *Select and Mask* → feather 1px / shift edge
   −20%, or remove.bg for simple silhouettes.
3. Export **straight (non-premultiplied) alpha**; check the edge over a dark
   fill first — white fringing over a bright sky is unfixable in code.
4. Alt path when a cutout should read as part of its scene (e.g. the meadow):
   upscale the full scene, segment the foreground band, matte that. More
   hand-work, better light continuity. Prefer isolated generation otherwise.
</details>

<details>
<summary><b>Upscaling (Midjourney native, or Magnific)</b></summary>

Midjourney's built-in upscale is enough for our use (we downscale to 2560 +
overlay grain). If you use Magnific/Freepik instead: **illustration/anime
mode, grain OFF, low creativity (2–4 sky/mid, 1–2 cutout), resemblance 7–9** —
we want detail recovery, not reinterpretation, so `--sref` cohesion survives.
Run cutout upscales **before** background removal.
</details>

<details>
<summary><b>Text-safe finishing gradient</b></summary>

Optional: on the copy side of each sky/mid, bake a soft darkening gradient
(~15–25% black, feathered wide) so copy stays legible. The page also applies
a directional scrim, so this is only for the brightest paintings.
</details>

<details>
<summary><b>🎬 Video seam-fix + encode</b></summary>

Seam check: `ffplay -loop 2 loop.mp4`. If the loop pops, self-crossfade the
tail (`DUR` = clip length in seconds):

```bash
ffmpeg -i loop.mp4 -filter_complex \
  "[0:v]split[a][b];[a]trim=start=0.7,setpts=PTS-STARTPTS[main];\
   [b]trim=duration=0.7,setpts=PTS-STARTPTS[head];\
   [main][head]xfade=transition=fade:duration=0.7:offset=$(echo "DUR-1.4" | bc)[v]" \
  -map "[v]" -an seamless.mp4
```

Encode both containers (1920×822, no audio):

```bash
# WebM VP9 — target ≤ 4 MB
ffmpeg -i seamless.mp4 -an -vf "scale=1920:822:force_original_aspect_ratio=increase,crop=1920:822" \
  -c:v libvpx-vp9 -b:v 3M -maxrate 4M -row-mt 1 -pix_fmt yuv420p sky.webm
# MP4 H.264 fallback — target ≤ 5 MB
ffmpeg -i seamless.mp4 -an -vf "scale=1920:822:force_original_aspect_ratio=increase,crop=1920:822" \
  -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart sky.mp4
```
</details>
