"use client";

import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

/**
 * KyoAni-soft post: a wide, gentle bloom that haloes the true light sources
 * (wish-mote, fireflies, lantern glows) without crushing the frame, plus a
 * light vignette. The threshold sits high enough that bright painted skies
 * never bloom — only additive glows cross it. No DoF — it fights text
 * legibility.
 */
export function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.62} luminanceThreshold={0.82} luminanceSmoothing={0.28} />
      <Vignette eskil={false} offset={0.16} darkness={0.5} />
    </EffectComposer>
  );
}
