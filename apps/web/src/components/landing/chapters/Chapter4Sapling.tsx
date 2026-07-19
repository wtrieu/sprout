"use client";

import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";
import { Butterflies } from "../vignettes/Butterflies";
import { GrassField } from "../vignettes/GrassField";
import { ForestBackdrop } from "../vignettes/ForestBackdrop";
import { Campsite } from "../vignettes/Campsite";

/**
 * Ch 4 — a fairy-tale meadow under a soft anime noon: lush grass around the
 * young tree, a storybook treeline behind, a family camping in the shade —
 * pollen, dandelion seeds and butterflies filling the light between.
 */
export function Chapter4Sapling() {
  return (
    <ChapterGroup beat={4} span={1.8}>
      <GrassField />
      <ForestBackdrop />
      <Campsite />
      {/* pollen drifting in the sun shafts */}
      <ParticleField
        count={900}
        center={[0, 4.5, 0]}
        box={[16, 9, 11]}
        color="#fde68a"
        color2="#c8ecd2"
        size={2}
        opacity={0.5}
        additive
        twinkle={0.5}
        driftAmp={[0.45, 0.3, 0.4]}
        driftFreq={0.35}
        growBeat={4}
        fadeFar={34}
      />
      {/* dandelion seeds riding the thermals — up and away */}
      <ParticleField
        count={140}
        center={[2, 4, 2]}
        box={[18, 8, 10]}
        color="#ffffff"
        color2="#f0ead8"
        size={3.4}
        opacity={0.8}
        fallSpeed={-0.5}
        wrapY={[0.5, 9]}
        driftAmp={[0.9, 0.2, 0.5]}
        driftFreq={0.5}
        growBeat={4}
        fadeFar={30}
      />
      <ChapterGroup beat={4} span={1.1}>
        <Butterflies
          butterflies={[
            { center: [-2.5, 4.6, 3], radius: 2.4, colorA: "#fef3c7", colorB: "#f59e0b" },
            { center: [2.5, 5.6, 1.5], radius: 2, colorA: "#dbeafe", colorB: "#60a5fa" },
            { center: [0.5, 3.4, 4], radius: 2.8, colorA: "#fce7f3", colorB: "#f472b6" },
            { center: [-1, 6.5, -1], radius: 1.8, colorA: "#ecfccb", colorB: "#84cc16" },
          ]}
          scale={0.5}
        />
      </ChapterGroup>
    </ChapterGroup>
  );
}
