"use client";

import * as THREE from "three";
import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";
import { SEGMENTS } from "./chapterConfig";
import { Mycelium } from "../vignettes/Mycelium";
import { WishSeed } from "../vignettes/WishSeed";

/**
 * Hero — a wish drifting through the twilight underground. Luminous glass
 * seed, pastel bokeh, spore-lights rising: the story's first breath.
 */
export function Chapter0Seed() {
  return (
    <ChapterGroup beat={0} span={2.1}>
      <Mycelium />
      <WishSeed position={[0, -14.05, 0]} />
      {/* pastel bokeh — big soft out-of-focus lights, the KyoAni opening frame */}
      <ParticleField
        count={70}
        center={[0, -13.6, 1]}
        box={[20, 10, 9]}
        color="#f0abfc"
        color2="#fde68a"
        size={30}
        opacity={0.16}
        additive
        twinkle={0.35}
        driftAmp={[0.5, 0.4, 0.3]}
        driftFreq={0.12}
        fadeFar={26}
        opacityFn={(p) => 1 - THREE.MathUtils.smoothstep(p * SEGMENTS, 1.1, 1.9)}
      />
      {/* spore-lights drifting up like slow embers of a wish */}
      <ParticleField
        count={420}
        center={[0, -13.8, 0]}
        box={[16, 9, 10]}
        color="#a5f3fc"
        color2="#f0abfc"
        size={3}
        opacity={0.7}
        additive
        twinkle={0.55}
        fallSpeed={-0.32}
        wrapY={[-18.5, -9.5]}
        driftAmp={[0.35, 0.2, 0.3]}
        driftFreq={0.3}
        fadeFar={22}
        opacityFn={(p) => 1 - THREE.MathUtils.smoothstep(p * SEGMENTS, 1.1, 1.9)}
      />
      {/* a few grander motes of gold dust */}
      <ParticleField
        count={130}
        center={[0, -14, 2]}
        box={[14, 8, 8]}
        color="#fde68a"
        color2="#fff7e0"
        size={5}
        opacity={0.5}
        additive
        twinkle={0.75}
        driftAmp={[0.3, 0.25, 0.25]}
        driftFreq={0.2}
        fadeFar={22}
        opacityFn={(p) => 1 - THREE.MathUtils.smoothstep(p * SEGMENTS, 1.2, 2.0)}
      />
    </ChapterGroup>
  );
}
