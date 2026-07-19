"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";
import { createRippleMaterial } from "../materials/rippleMaterial";
import { SEGMENTS } from "./chapterConfig";

/** Ch 2 — first rain. Sources falling like water, ripples where they land. */
export function Chapter2Rain() {
  const rippleMaterial = useMemo(() => createRippleMaterial("#7dd3fc"), []);
  useEffect(() => () => rippleMaterial.dispose(), [rippleMaterial]);

  useFrame((state) => {
    rippleMaterial.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <ChapterGroup beat={2} span={1.8}>
      {/* rain streaks */}
      <ParticleField
        count={2600}
        center={[0, 6.5, -1]}
        box={[34, 15, 22]}
        color="#9fd6f2"
        color2="#5b93b8"
        size={7}
        opacity={0.42}
        shape="streak"
        fallSpeed={7.5}
        wrapY={[-0.6, 14]}
        driftAmp={[0.06, 0, 0.04]}
        driftFreq={0.8}
        velocityDrag={0.012}
        fadeFar={34}
      />
      {/* a few glowing "citation" drops — the careful sources landing home */}
      <ParticleField
        count={46}
        center={[0, 6, 0]}
        box={[20, 13, 12]}
        color="#bae6fd"
        color2="#7dd3fc"
        size={5.5}
        opacity={0.85}
        additive
        fallSpeed={1.6}
        wrapY={[-0.4, 12.5]}
        twinkle={0.5}
        driftAmp={[0.12, 0, 0.1]}
        fadeFar={34}
      />
      {/* ripple rings where the rain lands */}
      <mesh
        material={rippleMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
      >
        <circleGeometry args={[16, 40]} />
      </mesh>
      {/* wet-ground sheen */}
      <ParticleField
        count={280}
        center={[0, 0.25, 1]}
        box={[26, 0.4, 16]}
        color="#7dd3fc"
        color2="#294b63"
        size={2.2}
        opacity={0.4}
        additive
        twinkle={0.75}
        driftAmp={[0.05, 0.02, 0.05]}
        fadeFar={30}
        opacityFn={(p) => {
          const x = p * SEGMENTS;
          return THREE.MathUtils.smoothstep(x, 1.3, 2.0) * (1 - THREE.MathUtils.smoothstep(x, 2.6, 3.2));
        }}
      />
    </ChapterGroup>
  );
}
