"""
Drain-and-exit image worker.

Spawned by scripts/run-jobs.ts AFTER the Ollama model is unloaded — FLUX
(~10-12GB) and qwen3:14b (~9GB) cannot coexist in 24GB unified memory. Loads
the model once, renders every pending `imagegen` job, then exits so the
memory is released.

Character consistency (MVP): detailed appearance description prepended to
every prompt + deterministic per-character seed base. Upgrade path: FLUX
Kontext reference editing or a one-time character LoRA.

Env: SPROUT_DB (sqlite path), IMAGES_DIR, SPROUT_IMAGE_MODEL (default
"schnell"), SPROUT_IMAGE_QUANTIZE (default 4), SPROUT_IMAGE_STEPS (default 4),
SPROUT_IMAGE_SIZE (default 1024).
"""

import json
import os
import sqlite3
import sys
import time
import traceback
from pathlib import Path

DB_PATH = os.environ.get("SPROUT_DB", str(Path(__file__).resolve().parents[2] / "data/sprout.db"))
IMAGES_DIR = Path(os.environ.get("IMAGES_DIR", str(Path(__file__).resolve().parents[2] / "data/images")))
MODEL_NAME = os.environ.get("SPROUT_IMAGE_MODEL", "schnell")
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


def claim_next(conn: sqlite3.Connection):
    row = conn.execute(
        """
        UPDATE jobs
        SET status = 'running', started_at = unixepoch(), attempts = attempts + 1
        WHERE id = (
            SELECT id FROM jobs
            WHERE status = 'pending' AND lane = 'imagegen'
            ORDER BY priority ASC, id ASC LIMIT 1
        )
        RETURNING id, type, payload, attempts
        """
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


_flux = None


def get_flux():
    """Lazy-load the model once per process (~10GB, ~30s)."""
    global _flux
    if _flux is None:
        from mflux.flux.flux import Flux1  # heavy import — keep out of module scope

        print(f"loading FLUX model={MODEL_NAME} quantize={QUANTIZE}…", flush=True)
        t0 = time.time()
        _flux = Flux1.from_name(model_name=MODEL_NAME, quantize=QUANTIZE)
        print(f"model loaded in {time.time() - t0:.0f}s", flush=True)
    return _flux


def generate(prompt: str, seed: int, out_path: Path) -> None:
    from mflux.config.config import Config

    flux = get_flux()
    t0 = time.time()
    image = flux.generate_image(
        seed=seed,
        prompt=prompt,
        config=Config(num_inference_steps=STEPS, height=SIZE, width=SIZE),
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path=str(out_path))
    print(f"rendered {out_path.name} in {time.time() - t0:.0f}s", flush=True)


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
        """SELECT c.appearance_desc, c.seed FROM characters c
           JOIN stories s ON s.character_id = c.id WHERE s.id=?""",
        (story_id,),
    ).fetchone()
    if character is None:
        raise RuntimeError(f"story {story_id} has no character")

    prompt = (
        f"{STYLE_BLOCK} The main character: {character['appearance_desc']}. "
        f"Scene: {page['illustration_prompt']}"
    )
    seed = int(character["seed"]) * 1000 + page_index
    rel_path = f"stories/{story_id}/page-{page_index}.png"
    generate(prompt, seed, IMAGES_DIR / rel_path)

    conn.execute(
        "UPDATE story_pages SET image_path=?, image_status='done' WHERE id=?",
        (rel_path, page["id"]),
    )
    conn.commit()


def run_char_reference(conn, payload: dict) -> None:
    char_id = int(payload["characterId"])
    character = conn.execute(
        "SELECT id, name, appearance_desc, seed FROM characters WHERE id=?", (char_id,)
    ).fetchone()
    if character is None:
        raise RuntimeError(f"character {char_id} not found")

    prompt = (
        f"{STYLE_BLOCK} Character sheet portrait, full body, standing, facing viewer, "
        f"plain soft background. The character: {character['appearance_desc']}."
    )
    rel_path = f"characters/{char_id}.png"
    generate(prompt, int(character["seed"]), IMAGES_DIR / rel_path)

    conn.execute("UPDATE characters SET ref_image_path=? WHERE id=?", (rel_path, char_id))
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


def main() -> int:
    conn = connect()
    done = 0
    while True:
        job = claim_next(conn)
        if job is None:
            break
        payload = json.loads(job["payload"])
        try:
            if job["type"] == "story_image":
                run_story_image(conn, payload)
            elif job["type"] == "char_reference":
                run_char_reference(conn, payload)
            else:
                raise RuntimeError(f"unknown imagegen job type {job['type']}")
            complete(conn, job["id"])
            done += 1
        except Exception as err:  # keep draining — one bad job must not kill the batch
            traceback.print_exc()
            fail(conn, job["id"], job["attempts"], str(err))
            if job["type"] == "story_image" and job["attempts"] >= MAX_ATTEMPTS:
                mark_failed_page(conn, payload)
    print(f"image worker done ({done} rendered), exiting to release memory", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
