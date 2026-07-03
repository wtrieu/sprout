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

Env: SPROUT_DB (sqlite path), IMAGES_DIR, SPROUT_IMAGE_QUANTIZE (default 4),
SPROUT_IMAGE_STEPS (default 4), SPROUT_IMAGE_SIZE (default 1024).
"""

import gc
import json
import os
import sqlite3
import sys
import time
import traceback
from pathlib import Path

DB_PATH = os.environ.get("SPROUT_DB", str(Path(__file__).resolve().parents[2] / "data/sprout.db"))
IMAGES_DIR = Path(os.environ.get("IMAGES_DIR", str(Path(__file__).resolve().parents[2] / "data/images")))
QUANTIZE = int(os.environ.get("SPROUT_IMAGE_QUANTIZE", "4"))
STEPS = int(os.environ.get("SPROUT_IMAGE_STEPS", "4"))
SIZE = int(os.environ.get("SPROUT_IMAGE_SIZE", "1024"))
MAX_ATTEMPTS = 3

STYLE_BLOCK = (
    "Children's picture book illustration, soft watercolor and gouache style, "
    "warm gentle lighting, bright cheerful colors, simple uncluttered composition, "
    "rounded friendly shapes, cozy and calm bedtime mood. No text, no words, no letters."
)


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


def render_t2i(prompt: str, seed: int, out_path: Path) -> None:
    model = get_model("t2i")
    t0 = time.time()
    image = model.generate_image(
        seed=seed, prompt=prompt, num_inference_steps=STEPS, height=SIZE, width=SIZE
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path=str(out_path))
    print(f"rendered {out_path.name} in {time.time() - t0:.0f}s", flush=True)


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
    character = conn.execute(
        "SELECT id, name, appearance_desc, seed FROM characters WHERE id=?", (char_id,)
    ).fetchone()
    if character is None:
        raise RuntimeError(f"character {char_id} not found")

    prompt = (
        f"{STYLE_BLOCK} Character sheet portrait, full body, standing, facing viewer, "
        f"plain soft cream background. The character: {character['appearance_desc']}."
    )
    rel_path = f"characters/{char_id}.png"
    render_t2i(prompt, int(character["seed"]), IMAGES_DIR / rel_path)
    conn.execute("UPDATE characters SET ref_image_path=? WHERE id=?", (rel_path, char_id))
    conn.commit()


def run_story_image(conn, payload: dict) -> None:
    story_id = int(payload["storyId"])
    page_index = int(payload["pageIndex"])
    page = conn.execute(
        "SELECT id, illustration_prompt FROM story_pages WHERE story_id=? AND page_index=?",
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

    seed = int(character["seed"]) * 1000 + page_index
    rel_path = f"stories/{story_id}/page-{page_index}.png"
    out = IMAGES_DIR / rel_path

    ref = IMAGES_DIR / character["ref_image_path"] if character["ref_image_path"] else None
    if ref is not None and ref.exists():
        prompt = (
            f"Redraw the character from the reference image in a new scene, keeping their "
            f"appearance, outfit and art style exactly the same. {STYLE_BLOCK} "
            f"Scene: {page['illustration_prompt']}"
        )
        render_with_reference(prompt, seed, ref, out)
    else:
        # No reference yet — fall back to appearance-prompt discipline.
        prompt = (
            f"{STYLE_BLOCK} The main character: {character['appearance_desc']}. "
            f"Scene: {page['illustration_prompt']}"
        )
        render_t2i(prompt, seed, out)

    conn.execute(
        "UPDATE story_pages SET image_path=?, image_status='done' WHERE id=?",
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
