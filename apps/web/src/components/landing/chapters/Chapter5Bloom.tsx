"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";

/** Ch 5 — in bloom: golden hour inside the canopy, petals letting go. */
export function Chapter5Bloom() {
  // blossoms sit on a loose shell around the canopy center
  const blossomPositions = useMemo(() => {
    const n = 380;
    const arr = new Float32Array(n * 3);
    const center = new THREE.Vector3(0, 10.4, -0.5);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        (Math.random() - 0.5) * 0.75,
        Math.random() - 0.5,
      ).normalize();
      const r = 2.2 + Math.random() * 2.2;
      arr[i * 3] = center.x + dir.x * r;
      arr[i * 3 + 1] = center.y + dir.y * r;
      arr[i * 3 + 2] = center.z + dir.z * r;
    }
    return arr;
  }, []);

  const { branches, branchMaterial } = useMemo(() => {
    const branchMaterial = new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.95 });
    const branches: THREE.TubeGeometry[] = [];
    // slender arcs that frame the edges of the shot, drooping like laden boughs
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const yBase = 12.2 + (i % 2) * 1.6;
      const points = [
        new THREE.Vector3(side * 9, yBase + 1.5, -3 + Math.random()),
        new THREE.Vector3(side * 5, yBase + 0.2, -1.5 + Math.random()),
        new THREE.Vector3(side * 2.2, yBase - 0.8 - Math.random() * 0.5, -0.8),
        new THREE.Vector3(side * 0.5, yBase - 1.8 - Math.random() * 0.6, -1.5),
      ];
      branches.push(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          32,
          0.05 + Math.random() * 0.04,
          6,
          false,
        ),
      );
    }
    return { branches, branchMaterial };
  }, []);

  useEffect(
    () => () => {
      branches.forEach((b) => b.dispose());
      branchMaterial.dispose();
    },
    [branches, branchMaterial],
  );

  return (
    <ChapterGroup beat={5} span={1.8}>
      {/* dark branches weaving through the golden canopy */}
      {branches.map((geo, i) => (
        <mesh key={i} geometry={geo} material={branchMaterial} />
      ))}
      {/* blossoms opening on the shell */}
      <ParticleField
        count={380}
        positions={blossomPositions}
        color="#fb7185"
        color2="#fda4af"
        size={9}
        opacity={0.95}
        shape="petal"
        twinkle={0.15}
        driftAmp={[0.08, 0.05, 0.08]}
        driftFreq={0.7}
        growBeat={5}
        fadeFar={30}
      />
      {/* petals letting go, drifting down through the light */}
      <ParticleField
        count={650}
        center={[0, 7.5, 1]}
        box={[12, 8, 9]}
        color="#fda4af"
        color2="#f59e0b"
        size={4}
        opacity={0.7}
        shape="petal"
        fallSpeed={0.55}
        wrapY={[3.5, 11.5]}
        driftAmp={[0.6, 0.1, 0.5]}
        driftFreq={0.5}
        growBeat={5}
        fadeFar={28}
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
        fadeFar={28}
        growBeat={5}
      />
    </ChapterGroup>
  );
}
