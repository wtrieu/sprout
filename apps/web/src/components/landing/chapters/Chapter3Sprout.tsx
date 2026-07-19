"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";
import { createVineMaterial } from "../materials/vineMaterial";
import { createGodRayMaterial } from "../materials/godRayMaterial";
import { localProgress } from "./chapterConfig";
import { scrollState } from "../scroll/scrollState";

function makeLeafGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.42, 0.18, 0.52, 0.62);
  shape.quadraticCurveTo(0.28, 0.6, 0, 1.05);
  shape.quadraticCurveTo(-0.28, 0.6, -0.52, 0.62);
  shape.quadraticCurveTo(-0.42, 0.18, 0, 0);
  return new THREE.ShapeGeometry(shape, 12);
}

/** Ch 3 — the signature shot: the sprout breaks the surface at dawn. */
export function Chapter3Sprout() {
  const stem = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.5, 0),
      new THREE.Vector3(0.12, 0.5, 0.05),
      new THREE.Vector3(-0.1, 1.3, -0.04),
      new THREE.Vector3(0.06, 2.0, 0.08),
      new THREE.Vector3(0, 2.5, 0),
    ]);
    return new THREE.TubeGeometry(curve, 40, 0.055, 8, false);
  }, []);
  const stemMaterial = useMemo(
    () => createVineMaterial({ color: "#3f6b2a", glow: "#fbbf24", tipGlow: true }),
    [],
  );
  const leafGeometry = useMemo(() => makeLeafGeometry(), []);
  const leafMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#4d7c2f",
        emissive: "#1c320f",
        roughness: 0.7,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const rays = useMemo(
    () => [
      { pos: [3.2, 7.5, -2.5], rot: 0.42, scale: [2.2, 15, 2.2], base: 0.11, mat: createGodRayMaterial("#fbbf24", 0.11) },
      { pos: [1.6, 7, -3.5], rot: 0.3, scale: [1.4, 14, 1.4], base: 0.09, mat: createGodRayMaterial("#fcd34d", 0.09) },
      { pos: [4.6, 7, -1], rot: 0.52, scale: [1.1, 14, 1.1], base: 0.07, mat: createGodRayMaterial("#f59e0b", 0.07) },
    ],
    [],
  );
  const ringsRef = useRef<THREE.Group>(null);
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#fbbf24",
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  const leafL = useRef<THREE.Mesh>(null);
  const leafR = useRef<THREE.Mesh>(null);

  useEffect(
    () => () => {
      stem.dispose();
      stemMaterial.dispose();
      leafGeometry.dispose();
      leafMaterial.dispose();
      ringMaterial.dispose();
      rays.forEach((r) => r.mat.dispose());
    },
    [stem, stemMaterial, leafGeometry, leafMaterial, ringMaterial, rays],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const grow = localProgress(scrollState.progress, 3);
    // this chapter's dressing releases as the journey moves on to the sapling
    const x = scrollState.progress * 7;
    const linger = 1 - THREE.MathUtils.smoothstep(x, 3.35, 4.1);
    stemMaterial.uniforms.uTime.value = t;
    // stem draws on through the middle half of the approach
    stemMaterial.uniforms.uGrow.value = THREE.MathUtils.smoothstep(grow, 0.15, 0.75);
    for (const r of rays) {
      r.mat.uniforms.uTime.value = t;
      r.mat.uniforms.uIntensity.value =
        r.base * THREE.MathUtils.smoothstep(grow, 0.25, 0.8) * linger;
    }
    ringMaterial.opacity = 0.14 * linger;
    // leaves unfold after the stem is mostly up
    const leafT = THREE.MathUtils.smoothstep(grow, 0.6, 0.95);
    const sway = Math.sin(t * 1.1) * 0.06;
    if (leafL.current) {
      leafL.current.scale.setScalar(0.9 * leafT);
      leafL.current.rotation.z = 0.9 - leafT * 0.35 + sway;
    }
    if (leafR.current) {
      leafR.current.scale.setScalar(0.75 * leafT);
      leafR.current.rotation.z = -0.9 + leafT * 0.35 - sway;
    }
    // percentile rings drift upward past the camera
    if (ringsRef.current) {
      ringsRef.current.children.forEach((ring, i) => {
        ring.position.y = ((t * 0.22 + i * 0.35) % 1.4) * 3.2;
      });
      ringsRef.current.visible = grow > 0.35 && linger > 0.02;
    }
  });

  return (
    <ChapterGroup beat={3} span={1.8}>
      <mesh geometry={stem} material={stemMaterial} />
      <mesh
        ref={leafL}
        geometry={leafGeometry}
        material={leafMaterial}
        position={[0.06, 1.6, 0.02]}
        rotation={[0.15, 0.4, 0.9]}
      />
      <mesh
        ref={leafR}
        geometry={leafGeometry}
        material={leafMaterial}
        position={[-0.04, 2.0, -0.02]}
        rotation={[-0.1, -0.5, -0.9]}
      />
      {/* dawn god rays */}
      {rays.map((r, i) => (
        <mesh
          key={i}
          material={r.mat}
          position={r.pos as [number, number, number]}
          rotation={[0, 0, r.rot]}
          scale={r.scale as [number, number, number]}
        >
          <coneGeometry args={[1, 1, 24, 1, true]} />
        </mesh>
      ))}
      {/* faint percentile rings ascending — growth made visible */}
      <group ref={ringsRef}>
        {[1.3, 1.7, 2.1, 2.5].map((r, i) => (
          <mesh key={i} material={ringMaterial} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r, 0.012, 8, 64]} />
          </mesh>
        ))}
      </group>
      {/* dawn dust in the light */}
      <ParticleField
        count={500}
        center={[1, 2.5, -0.5]}
        box={[10, 7, 8]}
        color="#fcd34d"
        color2="#a16207"
        size={2.2}
        opacity={0.5}
        additive
        twinkle={0.45}
        driftAmp={[0.3, 0.2, 0.25]}
        driftFreq={0.4}
        growBeat={3}
        fadeFar={26}
      />
    </ChapterGroup>
  );
}
