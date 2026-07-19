"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createVineMaterial } from "../materials/vineMaterial";
import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";

/** Ch 1 — roots reaching through umber soil, pulses of light flowing home. */
export function Chapter1Roots() {
  const { tubes, materials } = useMemo(() => {
    const tubes: THREE.TubeGeometry[] = [];
    const materials: THREE.ShaderMaterial[] = [];
    const rootCount = 11;
    for (let r = 0; r < rootCount; r++) {
      const angle = (r / rootCount) * Math.PI * 2 + Math.random() * 0.5;
      const spread = 1.2 + Math.random() * 3.2;
      // roots descend from just under the surface down past the seed depth
      const points: THREE.Vector3[] = [];
      const segments = 6;
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const y = -3.2 - t * 10.5;
        const wobble = Math.sin(t * Math.PI * (2 + Math.random())) * 0.7;
        points.push(
          new THREE.Vector3(
            Math.cos(angle) * spread * t * 2.2 + wobble * (Math.random() - 0.5),
            y,
            Math.sin(angle) * spread * t * 2.0 + wobble * (Math.random() - 0.5) - 1,
          ),
        );
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const radius = 0.09 + Math.random() * 0.1;
      tubes.push(new THREE.TubeGeometry(curve, 48, radius, 6, false));
      materials.push(
        createVineMaterial({
          color: "#2e2013",
          glow: "#fb923c",
          phase: Math.random() * 1.35,
          pulse: true,
        }),
      );
    }
    return { tubes, materials };
  }, []);

  useEffect(
    () => () => {
      tubes.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
    },
    [tubes, materials],
  );

  useFrame((state) => {
    for (const m of materials) m.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <ChapterGroup beat={1} span={1.8}>
      {tubes.map((geo, i) => (
        <mesh key={i} geometry={geo} material={materials[i]} />
      ))}
      {/* faint ember drift between the roots */}
      <ParticleField
        count={320}
        center={[0, -8.5, 0]}
        box={[12, 12, 9]}
        color="#fb923c"
        color2="#7c3a12"
        size={2.4}
        opacity={0.5}
        additive
        twinkle={0.6}
        driftAmp={[0.3, 0.35, 0.25]}
        driftFreq={0.3}
        fadeFar={20}
      />
    </ChapterGroup>
  );
}
