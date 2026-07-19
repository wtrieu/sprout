# Midjourney (Niji 7) Prompt Pack — Landing Page Backdrops

Painted anime backdrops for the `/` landing experience. The 3D layer (growing
tree, wish-seed, campsite, fireworks, particles) renders **on top** of these,
so every image keeps its center-third quiet and its horizon low. The page
falls back to procedural skies for any backdrop that hasn't been generated
yet — you can do these one at a time, in any order (except the anchor).

## Setup

1. **Select Niji 7.** On [midjourney.com](https://www.midjourney.com): click
   your avatar → Settings → Model **Niji**, Version **7**. (Discord route: DM
   the **niji · journey** bot, `/settings`, pick Niji 7.)
2. **Budget.** Basic (~$10/mo) gives ≈3.3 fast GPU hours ≈ ~200 generations.
   This pack needs roughly 15–25 including rerolls — well within budget.
3. **Per image:** `/imagine` the prompt → pick the best of 4 → **Upscale
   (Subtle)** → download → convert to WebP quality ~80
   ([squoosh.app](https://squoosh.app), or `cwebp -q 80 in.png -o out.webp`)
   → save into `apps/web/public/landing/backdrops/` with the **exact
   filename** given. Target ≤ 400 KB per file.
4. Refresh the landing page — the painted sky appears automatically; the
   procedural hills/clouds for that chapter fade themselves out.

## The style anchor (do this one first)

Generate **noon.webp** first. It defines the whole look. Then copy the URL of
your chosen upscale (right-click → Copy image address) and append it to every
other prompt as a style reference:

```
... --sref <your-noon-image-url> --sw 250
```

That keeps all seven backdrops looking like one artist painted them.

**Shared style DNA** (already baked into each prompt below):

> beautiful anime background art, Kyoto Animation style, Violet Evergarden
> background painting, soft diffused lighting, painterly detail, gentle color
> grading

---

## The seven backdrops

### 1. `noon.webp` — Beat 4 · fairy-tale meadow noon ⭐ ANCHOR

```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, vivid blue summer sky with towering white cumulus clouds, sunlit fairy-tale meadow horizon, distant storybook forest treeline in spring greens with one sakura pink tree, lush rolling grass, soft diffused lighting, painterly detail, gentle color grading, low horizon, empty open sky in the center, no characters --ar 21:9 --no text, watermark, logo, people, buildings, animals
```

### 2. `hero.webp` — Beat 0 · twilight underground dreamscape

```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, dreamlike underground twilight in deep indigo and violet, soft glowing pastel bokeh lights drifting in darkness, faint luminous threads like gossamer, nebula-like darkness soft as soil, quiet and wondrous, soft diffused lighting, painterly detail, gentle color grading, dark empty center, no light source in middle --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, sun, moon, sky, horizon
```

### 3. `roots.webp` — Beat 1 · plum earth aglow

```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, deep plum and umber earth cross-section fading into darkness, warm amber light seeping softly between faint root silhouettes at the far edges, drifting ember bokeh, cozy subterranean glow, soft diffused lighting, painterly detail, gentle color grading, dark quiet center --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, sky, horizon, sun
```

### 4. `rain.webp` — Beat 2 · first rain

```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, overcast storm sky in slate blue and silver over distant rolling hills, heavy soft rainclouds with faint silver linings, gentle rain haze, wet meadow horizon reflecting pale light, melancholy but warm, soft diffused lighting, painterly detail, gentle color grading, low horizon, quiet center sky --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, lightning, umbrella
```

### 5. `dawn.webp` — Beat 3 · breaking through at dawn

```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, violet to amber sunrise sky, low golden sun on the right side with soft god rays through morning haze, layered purple hills, dew-bright horizon line, hopeful morning light, soft diffused lighting, painterly detail, gentle color grading, low horizon, sun placed right of center --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings
```

### 6. `golden.webp` — Beat 5 · golden hour in bloom

```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, violet and burnt orange golden hour sky, pink-lit clouds drifting, warm amber haze over darkening rolling hills, sun low on the left, nostalgic evening warmth, soft diffused lighting, painterly detail, gentle color grading, low horizon, quiet center sky --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings
```

### 7. `night.webp` — Beats 6 & 7 · moonlit night (shared by both final beats)

```
beautiful anime background art, Kyoto Animation style, Violet Evergarden background painting, moonlit indigo night sky full of small stars, luminous full moon upper left, thin silver clouds, deep blue darkness, dark rolling hill silhouettes along the bottom edge, serene bedtime stillness, soft diffused lighting, painterly detail, gentle color grading, very low horizon, open starry sky in center --ar 21:9 --sref <noon-url> --sw 250 --no text, watermark, logo, people, buildings, fireworks, trees
```

---

## Tips for rerolls

- **Center too busy?** Add `minimalist composition, negative space` before
  the `--ar`, or Vary (Subtle) the best candidate.
- **Colors drifting off-palette?** The 3D fog will blend moderate drift, but
  if it's far off, name the hex family in the prompt ("slate blue #31486b
  sky") — Niji responds reasonably to color words, loosely to hexes.
- **Too much detail at the horizon?** Add `soft focus distant hills`. Detail
  competes with the copy and 3D subjects.
- **The `--no` list matters** — Niji loves adding tiny figures and cottages;
  keep `people, buildings` in the negative unless you want them.

## Optional future pass (not wired up yet — needs background removal)

If you later want to reskin particles/foliage with painted textures, generate
these on flat white and cut them out (remove.bg or Preview → Remove
Background), then we wire them in a follow-up:

```
single green leaf, anime watercolor style, flat white background, centered, simple --ar 1:1 --niji
single cherry blossom petal, anime watercolor style, flat white background, centered, simple --ar 1:1 --niji
small glowing butterfly, anime style, flat white background, side view, wings open --ar 1:1 --niji
seamless painted tree bark texture, anime background art style, warm brown --tile --ar 1:1 --niji
```
