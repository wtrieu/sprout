"""
Drain-and-exit image worker (mflux 0.18, FLUX.2-klein-4B).

Spawned by scripts/run-jobs.ts AFTER the Ollama model is unloaded — FLUX
(~10-12GB) and qwen3:14b (~9GB) cannot coexist in 24GB unified memory. Loads
a model once, renders every pending `imagegen` job, then exits so the memory
is released.

Character consistency: every character gets a canonical reference image
(char_reference job, text-to-image via Flux2Klein). Story pages are then
rendered with Flux2KleinEdit conditioned on that reference image — the model
redraws the same character in each new scene. Reference jobs are processed
first (priority + a two-pass drain) so pages always have a ref to work from.

Art direction comes from style packs (apps/web/src/lib/stylePacks.json — the
single source of truth shared with the web app). Each (character, style) pair
gets its own reference sheet in character_style_refs; stories carry a style
key. Page seeds fold in render_attempts so the QC loop in run-jobs.ts can
re-roll a bad render.

Env: SPROUT_DB (sqlite path), IMAGES_DIR, SPROUT_IMAGE_QUANTIZE (default 4),
SPROUT_IMAGE_STEPS (default 6, pages), SPROUT_IMAGE_REF_STEPS (default 10 —
references are rendered once and condition everything downstream),
SPROUT_IMAGE_SIZE (default 1024).
"""

import gc
import json
import os
import sqlite3
import sys
import time
import traceback
import zlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = os.environ.get("SPROUT_DB", str(REPO_ROOT / "data/sprout.db"))
IMAGES_DIR = Path(os.environ.get("IMAGES_DIR", str(REPO_ROOT / "data/images")))
QUANTIZE = int(os.environ.get("SPROUT_IMAGE_QUANTIZE", "4"))
STEPS = int(os.environ.get("SPROUT_IMAGE_STEPS", "6"))
REF_STEPS = int(os.environ.get("SPROUT_IMAGE_REF_STEPS", "10"))
SIZE = int(os.environ.get("SPROUT_IMAGE_SIZE", "1024"))
MAX_ATTEMPTS = 3

STYLE_PACKS_PATH = REPO_ROOT / "apps/web/src/lib/stylePacks.json"
STYLE_PACKS: dict = json.loads(STYLE_PACKS_PATH.read_text())["packs"]
DEFAULT_STYLE = "watercolor"


def style_block(style_key: str | None) -> str:
    pack = STYLE_PACKS.get(style_key or DEFAULT_STYLE) or STYLE_PACKS[DEFAULT_STYLE]
    return pack["block"]


def style_seed_offset(style_key: str) -> int:
    """Deterministic per-style seed spread so each style ref differs."""
    return zlib.crc32(style_key.encode()) % 997


RETRY_SEED_STRIDE = 7919  # prime; QC bumps render_attempts to re-roll a render


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def claim_next(conn: sqlite3.Connection, job_type: str | None = None):
    type_clause = "AND type = ?" if job_type else ""
    params = (job_type,) if job_type else ()
    row = conn.execute(
        f"""
        UPDATE jobs
        SET status = 'running', started_at = unixepoch(), attempts = attempts + 1
        WHERE id = (
            SELECT id FROM jobs
            WHERE status = 'pending' AND lane = 'imagegen' {type_clause}
            ORDER BY priority ASC, id ASC LIMIT 1
        )
        RETURNING id, type, payload, attempts
        """,
        params,
    ).fetchone()
    conn.commit()
    return row


def complete(conn, job_id: int):
    conn.execute(
        "UPDATE jobs SET status='done', finished_at=unixepoch(), error=NULL WHERE id=?",
        (job_id,),
    )
    conn.commit()


def fail(conn, job_id: int, attempts: int, error: str):
    status = "failed" if attempts >= MAX_ATTEMPTS else "pending"
    conn.execute(
        "UPDATE jobs SET status=?, finished_at=unixepoch(), error=? WHERE id=?",
        (status, error[:2000], job_id),
    )
    conn.commit()


# --- lazy single-model management -------------------------------------------

_model = None
_model_kind = None  # "t2i" | "edit"


def get_model(kind: str):
    """Load Flux2Klein (t2i) or Flux2KleinEdit, swapping if needed."""
    global _model, _model_kind
    if _model_kind == kind:
        return _model
    if _model is not None:
        print(f"swapping model {_model_kind} -> {kind}", flush=True)
        _model = None
        gc.collect()

    from mflux.models.common.config.model_config import ModelConfig
    from mflux.models.flux2.variants import Flux2Klein, Flux2KleinEdit

    t0 = time.time()
    if kind == "t2i":
        _model = Flux2Klein(quantize=QUANTIZE, model_config=ModelConfig.flux2_klein_4b())
    else:
        _model = Flux2KleinEdit(quantize=QUANTIZE, model_config=ModelConfig.flux2_klein_4b())
    _model_kind = kind
    print(f"loaded FLUX.2-klein-4B ({kind}, q{QUANTIZE}) in {time.time() - t0:.0f}s", flush=True)
    return _model


def render_t2i(prompt: str, seed: int, out_path: Path, steps: int = STEPS) -> None:
    model = get_model("t2i")
    t0 = time.time()
    image = model.generate_image(
        seed=seed, prompt=prompt, num_inference_steps=steps, height=SIZE, width=SIZE
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path=str(out_path))
    print(f"rendered {out_path.name} ({steps} steps) in {time.time() - t0:.0f}s", flush=True)


def render_with_reference(prompt: str, seed: int, ref_image: Path, out_path: Path) -> None:
    model = get_model("edit")
    t0 = time.time()
    image = model.generate_image(
        seed=seed,
        prompt=prompt,
        num_inference_steps=STEPS,
        height=SIZE,
        width=SIZE,
        image_paths=[str(ref_image)],
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path=str(out_path))
    print(f"rendered {out_path.name} (ref-conditioned) in {time.time() - t0:.0f}s", flush=True)


# --- job handlers ------------------------------------------------------------


def run_char_reference(conn, payload: dict) -> None:
    char_id = int(payload["characterId"])
    style_key = str(payload.get("styleKey") or DEFAULT_STYLE)
    if style_key not in STYLE_PACKS:
        style_key = DEFAULT_STYLE
    character = conn.execute(
        "SELECT id, name, appearance_desc, seed FROM characters WHERE id=?", (char_id,)
    ).fetchone()
    if character is None:
        raise RuntimeError(f"character {char_id} not found")

    ref_row = conn.execute(
        "SELECT id, render_attempts FROM character_style_refs WHERE character_id=? AND style_key=?",
        (char_id, style_key),
    ).fetchone()
    attempts = int(ref_row["render_attempts"]) if ref_row else 0

    prompt = (
        f"{style_block(style_key)} Character sheet portrait, full body, standing, facing viewer, "
        f"arms relaxed at their sides, both hands fully visible, plain soft cream background. "
        f"The character: {character['appearance_desc']}."
    )
    seed = int(character["seed"]) + style_seed_offset(style_key) + attempts * RETRY_SEED_STRIDE
    rel_path = f"characters/{char_id}-{style_key}.png"
    render_t2i(prompt, seed, IMAGES_DIR / rel_path, steps=REF_STEPS)

    if ref_row:
        conn.execute(
            "UPDATE character_style_refs SET image_path=?, qc_status=NULL, qc_note=NULL WHERE id=?",
            (rel_path, ref_row["id"]),
        )
    else:
        conn.execute(
            """INSERT INTO character_style_refs (character_id, style_key, image_path, created_at)
               VALUES (?, ?, ?, unixepoch())""",
            (char_id, style_key, rel_path),
        )
    # Keep the legacy default pointer for pre-style code paths.
    if style_key == DEFAULT_STYLE:
        conn.execute("UPDATE characters SET ref_image_path=? WHERE id=?", (rel_path, char_id))
    conn.commit()


def run_story_image(conn, payload: dict) -> None:
    story_id = int(payload["storyId"])
    page_index = int(payload["pageIndex"])
    page = conn.execute(
        """SELECT p.id, p.illustration_prompt, p.render_attempts, s.style
           FROM story_pages p JOIN stories s ON s.id = p.story_id
           WHERE p.story_id=? AND p.page_index=?""",
        (story_id, page_index),
    ).fetchone()
    if page is None:
        raise RuntimeError(f"story {story_id} page {page_index} not found")
    character = conn.execute(
        """SELECT c.id, c.appearance_desc, c.seed, c.ref_image_path FROM characters c
           JOIN stories s ON s.character_id = c.id WHERE s.id=?""",
        (story_id,),
    ).fetchone()
    if character is None:
        raise RuntimeError(f"story {story_id} has no character")

    style_key = page["style"] if page["style"] in STYLE_PACKS else DEFAULT_STYLE
    seed = (
        int(character["seed"]) * 1000
        + page_index
        + int(page["render_attempts"]) * RETRY_SEED_STRIDE
    )
    rel_path = f"stories/{story_id}/page-{page_index}.png"
    out = IMAGES_DIR / rel_path

    # Reference for THIS style; a mismatched-style ref would fight the prompt.
    style_ref = conn.execute(
        "SELECT image_path FROM character_style_refs WHERE character_id=? AND style_key=? AND image_path IS NOT NULL",
        (character["id"], style_key),
    ).fetchone()
    ref_rel = style_ref["image_path"] if style_ref else (
        character["ref_image_path"] if style_key == DEFAULT_STYLE else None
    )
    ref = IMAGES_DIR / ref_rel if ref_rel else None

    if ref is not None and ref.exists():
        prompt = (
            f"Redraw the character from the reference image in a new scene, keeping their "
            f"appearance, outfit and art style exactly the same. {style_block(style_key)} "
            f"Scene: {page['illustration_prompt']}"
        )
        render_with_reference(prompt, seed, ref, out)
    else:
        # No style ref (its render failed) — appearance-prompt discipline keeps
        # the style right even if the character drifts slightly across pages.
        prompt = (
            f"{style_block(style_key)} The main character: {character['appearance_desc']}. "
            f"Scene: {page['illustration_prompt']}"
        )
        render_t2i(prompt, seed, out)

    conn.execute(
        "UPDATE story_pages SET image_path=?, image_status='done', qc_status=NULL, qc_note=NULL WHERE id=?",
        (rel_path, page["id"]),
    )
    conn.commit()


def mark_failed_page(conn, payload: dict) -> None:
    try:
        conn.execute(
            "UPDATE story_pages SET image_status='failed' WHERE story_id=? AND page_index=?",
            (int(payload["storyId"]), int(payload["pageIndex"])),
        )
        conn.commit()
    except Exception:
        pass


def drain(conn, job_type: str | None) -> int:
    done = 0
    while True:
        job = claim_next(conn, job_type)
        if job is None:
            return done
        payload = json.loads(job["payload"])
        try:
            if job["type"] == "char_reference":
                run_char_reference(conn, payload)
            elif job["type"] == "story_image":
                run_story_image(conn, payload)
            else:
                raise RuntimeError(f"unknown imagegen job type {job['type']}")
            complete(conn, job["id"])
            done += 1
        except Exception as err:  # keep draining — one bad job must not kill the batch
            traceback.print_exc()
            fail(conn, job["id"], job["attempts"], str(err))
            if job["type"] == "story_image" and job["attempts"] >= MAX_ATTEMPTS:
                mark_failed_page(conn, payload)


def main() -> int:
    conn = connect()
    # References first (t2i model), then pages (edit model) — one swap max.
    refs = drain(conn, "char_reference")
    pages = drain(conn, None)
    print(f"image worker done ({refs} refs, {pages} pages), exiting to release memory", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
