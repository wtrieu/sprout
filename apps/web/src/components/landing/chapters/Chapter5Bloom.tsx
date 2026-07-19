"use client";

import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";
import { Swing } from "../vignettes/Swing";

/**
 * Ch 5 — in bloom at golden hour. The blossoms live on the TreeSystem; this
 * chapter is the air between them: petals letting go, a few flashing like
 * journal pages, and an empty swing still swaying under the canopy.
 */
export function Chapter5Bloom() {
  return (
    <ChapterGroup beat={5} span={1.8}>
      {/* petals letting go, drifting down through the light */}
      <ParticleField
        count={650}
        center={[0, 7.5, 1]}
        box={[13, 8, 10]}
        color="#fda4af"
        color2="#fb7185"
        size={4.2}
        opacity={0.75}
        shape="petal"
        fallSpeed={0.55}
        wrapY={[3.5, 11.5]}
        driftAmp={[0.6, 0.1, 0.5]}
        driftFreq={0.5}
        growBeat={5}
        fadeFar={30}
      />
      {/* a few petals flash like tiny glowing pages — the journal remembering */}
      <ParticleField
        count={40}
        center={[0, 9, 1]}
        box={[10, 6, 7]}
        color="#fef3c7"
        color2="#fcd34d"
        size={5}
        opacity={0.9}
        additive
        twinkle={0.9}
        fallSpeed={0.3}
        wrapY={[5, 12]}
        driftAmp={[0.4, 0.1, 0.35]}
        fadeFar={30}
        growBeat={5}
      />
      <Swing />
    </ChapterGroup>
  );
}
