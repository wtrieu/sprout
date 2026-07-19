"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { TREE } from "../tree/TreeSystem";
import { scrollState } from "../scroll/scrollState";
import { SEGMENTS } from "../chapters/chapterConfig";

/**
 * Paper lanterns hung from the high branches — someone's reading under the
 * tree tonight. They warm up as night falls and bob on the breeze.
 */
export function Lanterns() {
  const anchors = TREE.lanternAnchors;
  const refs = useRef<(THREE.Group | null)[]>([]);
  const lightRef = useRef<THREE.PointLight>(null);

  const stringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#2a2118" }),
    [],
  );
  const shadeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffb84d",
        emissive: "#ff9d2e",
        emissiveIntensity: 0,
        roughness: 0.6,
      }),
    [],
  );
  const ribMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#7a4a12" }),
    [],
  );

  useEffect(
    () => () => {
      stringMaterial.dispose();
      shadeMaterial.dispose();
      ribMaterial.dispose();
    },
    [stringMaterial, shadeMaterial, ribMaterial],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const x = scrollState.progress * SEGMENTS;
    // ignite through dusk (beat 5.4 → 6.1)
    const lit = THREE.MathUtils.smoothstep(x, 5.4, 6.1);
    shadeMaterial.emissiveIntensity = lit * 1.6 + Math.sin(t * 2.3) * 0.12 * lit;
    if (lightRef.current) lightRef.current.intensity = lit * 14;
    refs.current.forEach((g, i) => {
      if (!g) return;
      // they're hung at dusk — swell into place as they light
      g.visible = lit > 0.01;
      g.scale.setScalar(lit);
      g.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.08;
      g.rotation.x = Math.sin(t * 0.7 + i * 2.3) * 0.06;
    });
  });

  return (
    <>
      {anchors.map((a, i) => (
        <group key={i} position={a}>
          <group
            ref={(el) => {
              refs.current[i] = el;
            }}
          >
            <mesh material={stringMaterial} position={[0, -0.3, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.6, 5]} />
            </mesh>
            <mesh material={shadeMaterial} position={[0, -0.85, 0]} scale={[1, 1.25, 1]}>
              <sphereGeometry args={[0.26, 14, 12]} />
            </mesh>
            {/* top + bottom caps read as the lantern's paper ribs */}
            <mesh material={ribMaterial} position={[0, -0.52, 0]}>
              <cylinderGeometry args={[0.09, 0.13, 0.08, 10]} />
            </mesh>
            <mesh material={ribMaterial} position={[0, -1.18, 0]}>
              <cylinderGeometry args={[0.1, 0.07, 0.07, 10]} />
            </mesh>
          </group>
        </group>
      ))}
      {anchors.length > 0 && (
        <pointLight
          ref={lightRef}
          position={[anchors[0].x, anchors[0].y - 1, anchors[0].z + 0.5]}
          color="#ffb347"
          intensity={0}
          distance={16}
          decay={1.8}
        />
      )}
    </>
  );
}
