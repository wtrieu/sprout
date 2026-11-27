# imagegen — drain-and-exit FLUX worker

Python (uv/MLX) image worker built on mflux (`FLUX.2-klein-4B`, 4-bit). It is
**not** a long-running service: the orchestrator (`scripts/run-jobs.ts`) spawns
it *after* Ollama is unloaded, it loads FLUX once, renders every pending
`imagegen` job, and then exits so its ~10-12GB is released — qwen3:14b (~9GB)
and FLUX cannot coexist in 24GB.

## What it renders

The worker renders **character reference sheets** — `char_reference` is the only
`imagegen` job type, enqueued when a character is created
(`apps/web/src/app/api/characters/route.ts`, `apps/web/src/lib/styles.ts`). Each
(character, style) pair gets one canonical reference in `character_style_refs`,
graded after each batch by the QC VLM (`run-jobs.ts`), which re-rolls failed
seeds with a bumped `render_attempts` (bounded at 2 attempts).

Story **page** illustrations do **not** run through this worker: the story
engine composes them as Midjourney prompt briefs (`apps/web/src/lib/skills/storyArt.ts`)
that the parent renders externally. The worker's page-render helpers
(`Flux2KleinEdit`) remain in `worker.py` but no page job type feeds them.

## Files

- `worker.py` — the drain-and-exit worker.
- `gen_reference.py` — one-shot smoke test / reference generator. Doubles as the
  install check (first run downloads the FLUX weights, ~10 min).
- `pyproject.toml` / `uv.lock` — deps (mflux, pillow), Python ≥ 3.11.

## Setup

```bash
brew install uv
uv sync
uv run gen_reference.py "a cheerful toddler with dark hair" /tmp/test.png
```

## Environment

Passed in by `run-jobs.ts`:

- `SPROUT_DB` — sqlite path (jobs + `character_style_refs`).
- `IMAGES_DIR` — where renders are written.
- `SPROUT_IMAGE_QUANTIZE` (default 4), `SPROUT_IMAGE_STEPS` (default 6, pages),
  `SPROUT_IMAGE_REF_STEPS` (default 10, references), `SPROUT_IMAGE_SIZE`
  (default 1024).

Art direction comes from `apps/web/src/lib/stylePacks.json`, the single source
of truth shared with the web app. After each batch, `run-jobs.ts` grades renders
with a QC VLM and re-rolls failed seeds (bounded at 2 attempts).
