"use client";

import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";

/**
 * Ch 1 — rooted at home. The root fan itself belongs to the TreeSystem
 * (one continuous organism); this chapter adds the warm ember atmosphere
 * around it while the camera weaves through.
 */
export function Chapter1Roots() {
  return (
    <ChapterGroup beat={1} span={1.8}>
      <pointLight position={[0, -7.5, 2]} color="#fb923c" intensity={9} distance={14} decay={2} />
      <ParticleField
        count={340}
        center={[0, -8.5, 0]}
        box={[13, 13, 10]}
        color="#fb923c"
        color2="#7c3a12"
        size={2.4}
        opacity={0.5}
        additive
        twinkle={0.6}
        driftAmp={[0.3, 0.35, 0.25]}
        driftFreq={0.3}
        fadeFar={22}
      />
    </ChapterGroup>
  );
}
