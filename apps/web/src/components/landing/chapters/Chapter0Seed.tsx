"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createSeedMaterial } from "../materials/seedMaterial";
import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";
import { SEGMENTS } from "./chapterConfig";

/** Hero — a single glowing seed asleep in deep soil. */
export function Chapter0Seed() {
  const material = useMemo(() => createSeedMaterial(), []);
  const seedRef = useRef<THREE.Mesh>(null);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    if (seedRef.current) {
      seedRef.current.rotation.y = state.clock.elapsedTime * 0.08;
    }
  });

  return (
    <ChapterGroup beat={0} span={1.9}>
      <mesh
        ref={seedRef}
        material={material}
        position={[0, -14.7, 0]}
        rotation={[0.4, 0, 0.25]}
        scale={[0.8, 1.05, 0.8]}
      >
        <icosahedronGeometry args={[0.85, 24]} />
      </mesh>
      {/* warm light the seed casts on the soil around it */}
      <pointLight position={[0, -14.4, 0.6]} color="#f59e0b" intensity={5} distance={7} decay={2} />
      {/* slow soil motes catching the seed light */}
      <ParticleField
        count={750}
        center={[0, -13.8, 0]}
        box={[14, 8, 10]}
        color="#c8863b"
        color2="#6b4a26"
        size={2.6}
        opacity={0.55}
        driftAmp={[0.25, 0.18, 0.2]}
        driftFreq={0.35}
        twinkle={0.25}
        fadeFar={18}
        opacityFn={(p) => 1 - THREE.MathUtils.smoothstep(p * SEGMENTS, 1.0, 1.8)}
      />
    </ChapterGroup>
  );
}
