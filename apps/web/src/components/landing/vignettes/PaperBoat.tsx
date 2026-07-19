"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/** Low-poly origami paper boat: V-hull, two prows, a little triangular sail. */
function makeBoatGeometry(): THREE.BufferGeometry {
  const L = 0.62; // half length
  const W = 0.26; // half beam at the gunwale
  const D = 0.24; // hull depth
  const S = 0.55; // sail height
  // prow tips, gunwale corners, keel line, sail peak
  const v = {
    bowTip: [L * 1.35, 0.1, 0],
    sternTip: [-L * 1.35, 0.1, 0],
    gwFL: [L * 0.6, 0.12, W],
    gwFR: [L * 0.6, 0.12, -W],
    gwBL: [-L * 0.6, 0.12, W],
    gwBR: [-L * 0.6, 0.12, -W],
    keelF: [L * 0.7, -D, 0],
    keelB: [-L * 0.7, -D, 0],
    sailBase: [0, 0.1, 0],
    sailPeak: [0, S, 0],
    sailF: [L * 0.52, 0.12, 0],
    sailB: [-L * 0.52, 0.12, 0],
  };
  const tris: number[][][] = [
    // port side
    [v.bowTip, v.gwFL, v.keelF],
    [v.gwFL, v.gwBL, v.keelF],
    [v.keelF, v.gwBL, v.keelB],
    [v.gwBL, v.sternTip, v.keelB],
    // starboard side
    [v.bowTip, v.keelF, v.gwFR],
    [v.gwFR, v.keelF, v.gwBR],
    [v.keelF, v.keelB, v.gwBR],
    [v.gwBR, v.keelB, v.sternTip],
    // sail (double-sided material)
    [v.sailF, v.sailPeak, v.sailBase],
    [v.sailBase, v.sailPeak, v.sailB],
  ];
  const positions = new Float32Array(tris.flat(2));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * A paper boat sailing the rain puddle in slow circles — sturdy little thing,
 * out in the weather with you at 3 a.m.
 */
export function PaperBoat() {
  const geometry = useMemo(() => makeBoatGeometry(), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f2ead8",
        emissive: "#5a6b7d",
        emissiveIntensity: 0.35,
        roughness: 0.85,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const ref = useRef<THREE.Group>(null);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // a lazy loop around the puddle
    const a = t * 0.14;
    const r = 3.1 + Math.sin(t * 0.3) * 0.4;
    g.position.set(Math.cos(a) * r + 1.2, 0.06 + Math.sin(t * 1.3) * 0.04, Math.sin(a) * r + 2.2);
    // face the direction of travel, rock with the ripples
    g.rotation.set(
      Math.sin(t * 1.1) * 0.07,
      -a + Math.PI / 2,
      Math.sin(t * 0.9 + 1) * 0.09,
    );
  });

  return (
    <group ref={ref} scale={1.35}>
      <mesh geometry={geometry} material={material} />
    </group>
  );
}
