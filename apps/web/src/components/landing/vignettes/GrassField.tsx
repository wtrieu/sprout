"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { createFoliageMaterial } from "../tree/foliageMaterial";
import { treeGrowth } from "../tree/TreeSystem";
import { scrollState } from "../scroll/scrollState";
import { mulberry32, rangeFrom } from "../lib/rng";
import { useQuality } from "../hooks/quality";

/** A single blade: narrow plane, bent forward toward the tip. */
function makeBladeGeometry(): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(0.07, 0.6, 1, 3);
  geo.translate(0, 0.3, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, y * y * 0.55);
    // taper toward the tip
    pos.setX(i, pos.getX(i) * (1 - y * 1.2));
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Lush meadow around the tree — thousands of wind-swaying blades in one
 * draw call, growing in with the sapling. The foliage shader gives them
 * the same backlit anime translucency as the leaves.
 */
export function GrassField() {
  const { particleScale } = useQuality();
  const count = Math.round(2600 * particleScale);

  const geometry = useMemo(() => makeBladeGeometry(), []);
  const material = useMemo(
    () =>
      createFoliageMaterial({
        colorA: "#7ec850",
        colorB: "#3f8f38",
        heart: "#a8e063",
        heartRadius: 0.65,
      }),
    [],
  );
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const rand = mulberry32(555);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const info = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // denser near the tree, thinning toward the meadow's edge;
      // keep a trampled clearing around the campsite
      let tries = 0;
      do {
        const a = rangeFrom(rand, 0, Math.PI * 2);
        const r = 1.2 + Math.pow(rand(), 0.6) * 13;
        p.set(Math.cos(a) * r + 0.5, 0, Math.sin(a) * r + 1);
        tries++;
      } while (Math.hypot(p.x - 4.6, p.z - 4.0) < 2.4 && tries < 8);
      e.set(rangeFrom(rand, -0.12, 0.12), rangeFrom(rand, 0, Math.PI * 2), rangeFrom(rand, -0.12, 0.12));
      q.setFromEuler(e);
      const h = rangeFrom(rand, 0.6, 1.15);
      s.set(rangeFrom(rand, 0.75, 1.15), h, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      info[i * 3] = 0.5 + rand() * 0.12; // birth: grows in with the young tree
      info[i * 3 + 1] = rand(); // phase
      info[i * 3 + 2] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 3));
  }, [count, geometry]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state) => {
    const x = scrollState.progress * 7;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uGrow.value = treeGrowth(x);
    material.uniforms.uNight.value = THREE.MathUtils.smoothstep(x, 5.2, 6.2);
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} frustumCulled={false} />;
}
