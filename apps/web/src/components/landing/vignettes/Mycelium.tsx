"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { taperedTubeGeometry, mergeGeometries } from "../lib/taperedTube";
import { createVineMaterial } from "../materials/vineMaterial";
import { mulberry32, rangeFrom } from "../lib/rng";

/**
 * The memory network: fine glowing threads webbing out from the seed through
 * the dark soil, light pulsing along them — everything running quietly at home.
 */
export function Mycelium() {
  const { geometry, materials } = useMemo(() => {
    const rand = mulberry32(42);
    const center = new THREE.Vector3(0, -14.7, 0);
    const bundles: THREE.BufferGeometry[][] = [[], [], []];
    const threadCount = 21;
    for (let i = 0; i < threadCount; i++) {
      const azimuth = (i / threadCount) * Math.PI * 2 + rangeFrom(rand, -0.2, 0.2);
      const polar = rangeFrom(rand, -0.9, 0.7);
      const reach = rangeFrom(rand, 3, 8);
      const dir = new THREE.Vector3(
        Math.cos(azimuth) * Math.cos(polar),
        Math.sin(polar) * 0.55,
        Math.sin(azimuth) * Math.cos(polar),
      );
      const pts: THREE.Vector3[] = [];
      const steps = 5;
      const cur = center.clone().addScaledVector(dir, 0.8);
      for (let s = 0; s <= steps; s++) {
        pts.push(cur.clone());
        cur
          .addScaledVector(dir, reach / steps)
          .add(
            new THREE.Vector3(
              rangeFrom(rand, -0.5, 0.5),
              rangeFrom(rand, -0.35, 0.3),
              rangeFrom(rand, -0.5, 0.5),
            ),
          );
      }
      bundles[i % 3].push(taperedTubeGeometry(pts, 0.028, 0.004, 0, 1, 14, 5));
    }
    const materials = [0.25, 0.68, 1.05].map((phase) =>
      createVineMaterial({ color: "#241a10", glow: "#e8b45a", phase, pulse: true }),
    );
    const geometry = bundles.map((b) => {
      const merged = mergeGeometries(b);
      b.forEach((g) => g.dispose());
      return merged;
    });
    return { geometry, materials };
  }, []);

  useEffect(
    () => () => {
      geometry.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
    [geometry, materials],
  );

  useFrame((state) => {
    for (const m of materials) m.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <>
      {geometry.map((geo, i) => (
        <mesh key={i} geometry={geo} material={materials[i]} />
      ))}
    </>
  );
}
