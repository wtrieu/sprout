"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { TREE } from "../tree/TreeSystem";

const ROPE_LENGTH = 2.4;

/** An empty rope swing under the blossom canopy, swaying in the gold light. */
export function Swing() {
  const anchor = TREE.swingAnchor;
  const ref = useRef<THREE.Group>(null);

  const ropeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#8a6b42", roughness: 0.95 }),
    [],
  );
  const seatMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#a0662e", roughness: 0.8 }),
    [],
  );

  useEffect(
    () => () => {
      ropeMaterial.dispose();
      seatMaterial.dispose();
    },
    [ropeMaterial, seatMaterial],
  );

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // gentle pendulum, as if someone just hopped off
    g.rotation.z = Math.sin(t * 0.85) * 0.1;
    g.rotation.x = Math.sin(t * 0.6 + 1.2) * 0.045;
  });

  if (!anchor) return null;
  return (
    <group position={anchor}>
      {/* pivot at the branch; ropes + seat hang inside the rotating group */}
      <group ref={ref}>
        {[-0.42, 0.42].map((dx) => (
          <mesh key={dx} material={ropeMaterial} position={[dx, -ROPE_LENGTH / 2, 0]}>
            <cylinderGeometry args={[0.022, 0.022, ROPE_LENGTH, 6]} />
          </mesh>
        ))}
        <mesh material={seatMaterial} position={[0, -ROPE_LENGTH, 0]}>
          <boxGeometry args={[1.15, 0.06, 0.34]} />
        </mesh>
      </group>
    </group>
  );
}
