"use client";

import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

/**
 * Restrained post: bloom only catches emissives (seed core, god rays,
 * fireflies, the ❋), plus a gentle vignette. No DoF — it fights text legibility.
 */
export function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.78} luminanceSmoothing={0.2} />
      <Vignette eskil={false} offset={0.18} darkness={0.62} />
    </EffectComposer>
  );
}
