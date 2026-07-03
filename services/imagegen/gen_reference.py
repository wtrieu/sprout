"""
One-shot smoke test / character reference generator (mflux 0.18).

    uv run gen_reference.py "a cheerful toddler boy with dark hair..." out.png

Doubles as the install check: if this renders, the nightly worker will too.
First run downloads the FLUX.2-klein-4B weights.
"""

import os
import sys
import time


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    appearance, out_path = sys.argv[1], sys.argv[2]

    from mflux.models.common.config.model_config import ModelConfig
    from mflux.models.flux2.variants import Flux2Klein

    quantize = int(os.environ.get("SPROUT_IMAGE_QUANTIZE", "4"))
    print(f"loading FLUX.2-klein-4B (quantize={quantize}) — first run downloads weights…")
    t0 = time.time()
    flux = Flux2Klein(quantize=quantize, model_config=ModelConfig.flux2_klein_4b())
    print(f"loaded in {time.time() - t0:.0f}s")

    prompt = (
        "Children's picture book illustration, soft watercolor and gouache style, "
        "warm gentle lighting, bright cheerful colors. Character sheet portrait, "
        f"full body, plain soft cream background. The character: {appearance}. No text."
    )
    t0 = time.time()
    image = flux.generate_image(seed=42, prompt=prompt, num_inference_steps=4, height=1024, width=1024)
    image.save(path=out_path)
    print(f"rendered {out_path} in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
