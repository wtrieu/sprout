"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { generateTreeSkeleton, type LeafAnchor } from "./treeSkeleton";
import { taperedTubeGeometry, mergeGeometries } from "../lib/taperedTube";
import { createBarkMaterial } from "./barkMaterial";
import { createFoliageMaterial } from "./foliageMaterial";
import { scrollState } from "../scroll/scrollState";
import { useQuality } from "../hooks/quality";

/** The one tree. Deterministic, shared with vignettes that hang things on it. */
export const TREE = generateTreeSkeleton(7);

/**
 * Scroll → tree growth. Roots first (underground chapters), then the trunk
 * surges after the dawn close-up, filling out through bloom and night.
 */
const GROWTH_POINTS: [number, number][] = [
  [0.35, 0],
  [1.1, 0.21],
  [2.9, 0.24],
  [4.3, 0.75],
  [5.35, 0.93],
  [6.1, 1],
];

export function treeGrowth(x: number): number {
  if (x <= GROWTH_POINTS[0][0]) return GROWTH_POINTS[0][1];
  for (let i = 1; i < GROWTH_POINTS.length; i++) {
    const [x1, g1] = GROWTH_POINTS[i];
    if (x <= x1) {
      const [x0, g0] = GROWTH_POINTS[i - 1];
      const t = THREE.MathUtils.smoothstep((x - x0) / (x1 - x0), 0, 1);
      return THREE.MathUtils.lerp(g0, g1, t);
    }
  }
  return 1;
}

function makeLeafGeometry(size: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.42 * size, 0.18 * size, 0.5 * size, 0.62 * size);
  s.quadraticCurveTo(0.26 * size, 0.6 * size, 0, 1.02 * size);
  s.quadraticCurveTo(-0.26 * size, 0.6 * size, -0.5 * size, 0.62 * size);
  s.quadraticCurveTo(-0.42 * size, 0.18 * size, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 10);
  geo.translate(0, -0.1 * size, 0);
  return geo;
}

function makeBlossomGeometry(size: number): THREE.ShapeGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 60;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = size * (0.55 + 0.45 * Math.pow(Math.abs(Math.cos(2.5 * a)), 0.7));
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts), 8);
  // center uvs around (0.5, 0.5) for the golden heart
  const uv = geo.attributes.uv;
  const posAttr = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, posAttr.getX(i) / (2 * size) + 0.5, posAttr.getY(i) / (2 * size) + 0.35);
  }
  return geo;
}

function fillInstances(
  mesh: THREE.InstancedMesh,
  anchors: LeafAnchor[],
  rotationScale: number,
) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  anchors.forEach((a, i) => {
    e.set(
      (Math.sin(i * 12.9898) * 0.5 + 0.5) * rotationScale,
      (Math.sin(i * 78.233) * 0.5 + 0.5) * Math.PI * 2,
      (Math.sin(i * 39.425) * 0.5 + 0.5) * rotationScale,
    );
    q.setFromEuler(e);
    s.setScalar(1);
    m.compose(a.position, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function infoAttribute(anchors: LeafAnchor[]): THREE.InstancedBufferAttribute {
  const arr = new Float32Array(anchors.length * 3);
  anchors.forEach((a, i) => {
    arr[i * 3] = a.birth;
    arr[i * 3 + 1] = (i % 97) / 97;
    arr[i * 3 + 2] = a.scale;
  });
  return new THREE.InstancedBufferAttribute(arr, 3);
}

/**
 * The continuous organism at the heart of the journey: one merged bark mesh
 * (roots + trunk + branches, radius-continuous) grown by a single scalar, an
 * ember frontier crawling along the new wood, and instanced leaf/blossom
 * geometry popping in behind it. Three draw calls total.
 */
export function TreeSystem() {
  const { tier } = useQuality();

  const barkGeometry = useMemo(() => {
    const radial = tier === "high" ? 10 : 7;
    const geos = TREE.segments.map((seg) =>
      taperedTubeGeometry(
        seg.points,
        seg.r0,
        seg.r1,
        seg.birth0,
        seg.birth1,
        seg.depth === 0 ? 32 : 18,
        radial,
      ),
    );
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    return merged;
  }, [tier]);

  const barkMaterial = useMemo(() => createBarkMaterial(), []);

  const leafGeometry = useMemo(() => makeLeafGeometry(0.55), []);
  const leafMaterial = useMemo(
    () =>
      createFoliageMaterial({
        colorA: "#5cbf6b",
        colorB: "#2e7d3f",
        heart: "#8fd97a",
        heartRadius: 0.5,
      }),
    [],
  );
  const blossomGeometry = useMemo(() => makeBlossomGeometry(0.24), []);
  const blossomMaterial = useMemo(
    () =>
      createFoliageMaterial({
        colorA: "#fda4af",
        colorB: "#fb7185",
        heart: "#fcd34d",
        heartRadius: 0.28,
      }),
    [],
  );

  const leavesRef = useRef<THREE.InstancedMesh>(null);
  const blossomsRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (leavesRef.current) fillInstances(leavesRef.current, TREE.leaves, 1.2);
    if (blossomsRef.current) fillInstances(blossomsRef.current, TREE.blossoms, 2.5);
  }, []);

  useEffect(() => {
    leafGeometry.setAttribute("aInfo", infoAttribute(TREE.leaves));
    blossomGeometry.setAttribute("aInfo", infoAttribute(TREE.blossoms));
    return () => {
      barkGeometry.dispose();
      barkMaterial.dispose();
      leafGeometry.dispose();
      leafMaterial.dispose();
      blossomGeometry.dispose();
      blossomMaterial.dispose();
    };
  }, [barkGeometry, barkMaterial, leafGeometry, leafMaterial, blossomGeometry, blossomMaterial]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const x = scrollState.progress * 7;
    const grow = treeGrowth(x);
    const night = THREE.MathUtils.smoothstep(x, 5.2, 6.2);
    barkMaterial.uniforms.uGrow.value = grow;
    barkMaterial.uniforms.uTime.value = t;
    barkMaterial.uniforms.uNight.value = night;
    leafMaterial.uniforms.uGrow.value = grow;
    leafMaterial.uniforms.uTime.value = t;
    leafMaterial.uniforms.uNight.value = night;
    blossomMaterial.uniforms.uGrow.value = grow;
    blossomMaterial.uniforms.uTime.value = t;
    blossomMaterial.uniforms.uNight.value = night;
    if (groupRef.current) {
      // hidden only during the hero seed beat — the roots ARE chapter 1
      groupRef.current.visible = x > 0.45;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={barkGeometry} material={barkMaterial} frustumCulled={false} />
      <instancedMesh
        ref={leavesRef}
        args={[leafGeometry, leafMaterial, TREE.leaves.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={blossomsRef}
        args={[blossomGeometry, blossomMaterial, TREE.blossoms.length]}
        frustumCulled={false}
      />
    </group>
  );
}
