"use client";

import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

/**
 * KyoAni-soft post: a wide, gentle bloom that haloes every light source
 * (wish-seed, lanterns, fireworks, doorways) without crushing the frame,
 * plus a light vignette. No DoF — it fights text legibility.
 */
export function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.62} luminanceThreshold={0.7} luminanceSmoothing={0.32} />
      <Vignette eskil={false} offset={0.16} darkness={0.5} />
    </EffectComposer>
  );
}
