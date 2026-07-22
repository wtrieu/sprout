# imagegen — drain-and-exit FLUX worker

Python (uv/MLX) image worker that renders Sprout's story illustrations with
mflux (`FLUX.2-klein-4B`, 4-bit). It is **not** a long-running service: the
orchestrator (`scripts/run-jobs.ts`) spawns it *after* Ollama is unloaded, it
loads FLUX once, renders every pending `imagegen` job, and then exits so its
~10-12GB is released — qwen3:14b (~9GB) and FLUX cannot coexist in 24GB.

## Files

- `worker.py` — the drain-and-exit worker. Renders one canonical reference per
  (character, style) pair via `Flux2Klein`, then draws story pages with
  `Flux2KleinEdit` conditioned on that reference so the character stays
  consistent. Reference jobs run first so pages always have a ref.
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
