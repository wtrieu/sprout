"""
One-shot smoke test / character reference generator.

    uv run gen_reference.py "a cheerful toddler boy with black hair..." out.png

Doubles as the install check: if this renders, the nightly worker will too.
"""

import sys
import time


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    appearance, out_path = sys.argv[1], sys.argv[2]

    import os

    from mflux.config.config import Config
    from mflux.flux.flux import Flux1

    model = os.environ.get("SPROUT_IMAGE_MODEL", "schnell")
    quantize = int(os.environ.get("SPROUT_IMAGE_QUANTIZE", "4"))
    print(f"loading {model} (quantize={quantize}) — first run downloads weights…")
    t0 = time.time()
    flux = Flux1.from_name(model_name=model, quantize=quantize)
    print(f"loaded in {time.time() - t0:.0f}s")

    prompt = (
        "Children's picture book illustration, soft watercolor and gouache style, "
        "warm gentle lighting, bright cheerful colors. Character sheet portrait, "
        f"full body, plain soft background. The character: {appearance}. No text."
    )
    t0 = time.time()
    image = flux.generate_image(
        seed=42, prompt=prompt, config=Config(num_inference_steps=4, height=1024, width=1024)
    )
    image.save(path=out_path)
    print(f"rendered {out_path} in {time.time() - t0:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
