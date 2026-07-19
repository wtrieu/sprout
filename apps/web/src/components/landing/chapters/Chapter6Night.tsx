"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";
import { SEGMENTS } from "./chapterConfig";

/** Points tracing the ❋ glyph — the brand as a constellation. */
function makeGlyphPositions(center: THREE.Vector3, size: number): Float32Array {
  const pts: number[] = [];
  const spokes = 6;
  const perSpoke = 13;
  for (let s = 0; s < spokes; s++) {
    const angle = (s / spokes) * Math.PI * 2 + Math.PI / 2;
    for (let i = 1; i <= perSpoke; i++) {
      const t = i / perSpoke;
      // teardrop spoke: slight width at the middle
      const w = Math.sin(t * Math.PI) * size * 0.06;
      const jitterA = (Math.random() - 0.5) * w * 2;
      const r = t * size;
      pts.push(
        center.x + Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * jitterA,
        center.y + Math.sin(angle) * r + Math.sin(angle + Math.PI / 2) * jitterA,
        center.z + (Math.random() - 0.5) * 0.15,
      );
    }
  }
  for (let i = 0; i < 8; i++) {
    pts.push(
      center.x + (Math.random() - 0.5) * size * 0.16,
      center.y + (Math.random() - 0.5) * size * 0.16,
      center.z + (Math.random() - 0.5) * 0.1,
    );
  }
  return new Float32Array(pts);
}

/** Ch 6 + finale — under the canopy at night: fireflies, stars, the glowing ❋. */
export function Chapter6Night() {
  const glyphPositions = useMemo(
    () => makeGlyphPositions(new THREE.Vector3(0, 19.6, -3), 2.1),
    [],
  );

  const { branches, branchMaterial } = useMemo(() => {
    const branchMaterial = new THREE.MeshStandardMaterial({ color: "#0f0d16", roughness: 1 });
    const branches: THREE.TubeGeometry[] = [];
    // slim boughs arcing in from the frame's corners, leaving the sky open
    for (let i = 0; i < 5; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const y = 20.5 + i * 1.1 + Math.random();
      const points = [
        new THREE.Vector3(side * (10 + Math.random() * 2), y - 2.5, -7 + Math.random() * 2),
        new THREE.Vector3(side * 6, y - 0.8, -5 + Math.random()),
        new THREE.Vector3(side * 3, y - 0.2 + Math.random() * 0.4, -4),
        new THREE.Vector3(side * 0.5, y - 1 - Math.random(), -5.5),
      ];
      branches.push(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          28,
          0.04 + Math.random() * 0.05,
          5,
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
    <ChapterGroup beat={6} span={2.2}>
      {/* branch silhouettes framing the sky */}
      {branches.map((geo, i) => (
        <mesh key={i} geometry={geo} material={branchMaterial} />
      ))}
      {/* fireflies — slow amber wanderers with soft pulse */}
      <ParticleField
        count={230}
        center={[0, 16, -1]}
        box={[18, 9, 13]}
        color="#fbbf24"
        color2="#f59e0b"
        size={5}
        opacity={0.95}
        additive
        twinkle={1}
        driftAmp={[0.9, 0.55, 0.7]}
        driftFreq={0.22}
        fadeFar={40}
        growBeat={6}
      />
      {/* the ❋ constellation, blooming for the finale */}
      <ParticleField
        count={0}
        positions={glyphPositions}
        color="#fcd34d"
        color2="#f59e0b"
        size={9}
        opacity={1}
        additive
        twinkle={0.35}
        driftAmp={[0.02, 0.02, 0.01]}
        driftFreq={0.4}
        fadeFar={60}
        opacityFn={(p) => {
          const x = p * SEGMENTS;
          return THREE.MathUtils.smoothstep(x, 5.9, 6.75);
        }}
      />
      {/* moonlit haze low over the canopy */}
      <ParticleField
        count={260}
        center={[0, 13, -2]}
        box={[22, 4, 14]}
        color="#93a6d4"
        color2="#3d4a77"
        size={9}
        opacity={0.14}
        driftAmp={[0.5, 0.15, 0.4]}
        driftFreq={0.15}
        fadeFar={40}
        growBeat={6}
      />
    </ChapterGroup>
  );
}
