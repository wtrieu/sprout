"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";
import { SEGMENTS } from "./chapterConfig";
import { Lanterns } from "../vignettes/Lanterns";
import { ShootingStars } from "../vignettes/ShootingStars";
import { Fireworks } from "../vignettes/Fireworks";

/**
 * Points tracing a sprouting seed — the whole story drawn in stars:
 * seed shell below, stem rising, two young leaves unfurling.
 */
function makeGlyphPositions(center: THREE.Vector3, size: number): Float32Array {
  const pts: number[] = [];
  const push = (v: THREE.Vector3, jitter = 0.045) => {
    pts.push(
      center.x + v.x * size + (Math.random() - 0.5) * jitter * size,
      center.y + v.y * size + (Math.random() - 0.5) * jitter * size,
      center.z + (Math.random() - 0.5) * 0.15,
    );
  };
  const sample = (curve: THREE.Curve<THREE.Vector3>, n: number) => {
    for (const p of curve.getPoints(n)) push(p);
  };
  const v = (x: number, y: number) => new THREE.Vector3(x, y, 0);

  // the seed: a plump teardrop shell, cracked open at the top
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 1.72 + Math.PI * 0.63;
    pts.push(
      center.x + Math.cos(a) * 0.3 * size,
      center.y + (Math.sin(a) * 0.38 - 0.85) * size,
      center.z + (Math.random() - 0.5) * 0.12,
    );
  }
  // the stem: one hopeful curve out of the crack
  sample(new THREE.QuadraticBezierCurve3(v(0, -0.52), v(0.14, 0.05), v(0.02, 0.55)), 13);
  // left leaf, the bigger one
  sample(new THREE.QuadraticBezierCurve3(v(0.0, 0.3), v(-0.55, 0.42), v(-0.62, 0.86)), 9);
  sample(new THREE.QuadraticBezierCurve3(v(-0.62, 0.86), v(-0.22, 0.78), v(0.02, 0.55)), 9);
  // right leaf, the younger one
  sample(new THREE.QuadraticBezierCurve3(v(0.02, 0.55), v(0.45, 0.62), v(0.5, 0.95)), 8);
  sample(new THREE.QuadraticBezierCurve3(v(0.5, 0.95), v(0.18, 0.9), v(0.02, 0.72)), 8);
  // a little starlight caught inside the seed
  for (let i = 0; i < 6; i++) {
    push(v((Math.random() - 0.5) * 0.3, -0.85 + (Math.random() - 0.5) * 0.35), 0.02);
  }
  return new Float32Array(pts);
}

/**
 * Ch 6 + finale — under the canopy at night. The tree's crown is overhead
 * (TreeSystem); lanterns hang from its high branches, fireflies wander, a
 * meteor slips by, and the ❋ blooms as a constellation for the CTA.
 */
export function Chapter6Night() {
  const glyphPositions = useMemo(
    () => makeGlyphPositions(new THREE.Vector3(0, 19.4, -3.5), 1.85),
    [],
  );

  return (
    <ChapterGroup beat={6} span={2.2}>
      <Lanterns />
      <ShootingStars />
      <Fireworks />
      {/* fireflies — slow amber wanderers with soft pulse */}
      <ParticleField
        count={230}
        center={[0, 11.5, 0]}
        box={[18, 9, 14]}
        color="#fbbf24"
        color2="#f59e0b"
        size={5}
        opacity={0.95}
        additive
        twinkle={1}
        driftAmp={[0.9, 0.55, 0.7]}
        driftFreq={0.22}
        fadeFar={44}
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
        center={[0, 10, -2]}
        box={[22, 4, 14]}
        color="#93a6d4"
        color2="#3d4a77"
        size={9}
        opacity={0.13}
        driftAmp={[0.5, 0.15, 0.4]}
        driftFreq={0.15}
        fadeFar={44}
        growBeat={6}
      />
    </ChapterGroup>
  );
}
