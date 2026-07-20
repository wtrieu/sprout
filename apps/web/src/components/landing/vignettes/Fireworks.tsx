"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../scroll/scrollState";
import { SEGMENTS } from "../chapters/chapterConfig";
import { mulberry32, rangeFrom } from "../lib/rng";

const VERT = /* glsl */ `
uniform float uTime;
// aDir: unit direction of this spark; aSeed: (burstPhase, speed, size, colorMix)
attribute vec3 aDir;
attribute vec4 aSeed;
varying float vFade;
varying float vMix;
varying float vT;

void main() {
  float cycle = 6.5;
  float t = fract(uTime / cycle + aSeed.x);
  // launch pause: only the first 55% of the cycle is the burst
  float bt = clamp(t / 0.55, 0.0, 1.0);
  float ease = 1.0 - pow(1.0 - bt, 3.0);
  vec3 pos = position + aDir * ease * (3.2 + aSeed.y * 2.6);
  pos.y -= bt * bt * 2.4; // sparks droop as they die

  vT = bt;
  float twinkle = 0.55 + 0.45 * sin(uTime * (14.0 + aSeed.y * 8.0) + aSeed.w * 40.0);
  vFade = pow(max(0.0, 1.0 - bt), 1.7) * twinkle * step(t, 0.55);
  vMix = aSeed.w;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (5.5 + aSeed.z * 4.0) * (1.0 - bt * 0.5) * (26.0 / max(1.0, -mv.z));
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vFade;
varying float vMix;
varying float vT;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = pow(smoothstep(0.5, 0.0, d), 1.6) * vFade * uOpacity;
  if (a < 0.012) discard;
  // white-hot at the moment of the burst, then the shell's colour blooms
  vec3 shell = mix(uColorA, uColorB, vMix);
  vec3 col = mix(vec3(1.0, 0.98, 0.92), shell, clamp(vT * 2.6, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}
`;

/**
 * Festival fireworks far beyond the tree — one draw call per colourway,
 * bursts cycling on offset phases so the night sky is never empty.
 */
function Burst({ colors, seed }: { colors: [string, string]; seed: number }) {
  const { geometry, material } = useMemo(() => {
    const rand = mulberry32(seed);
    const bursts = 4;
    const perBurst = 110;
    const n = bursts * perBurst;
    const pos = new Float32Array(n * 3);
    const dir = new Float32Array(n * 3);
    const seeds = new Float32Array(n * 4);
    for (let b = 0; b < bursts; b++) {
      const cx = rangeFrom(rand, -24, 24);
      const cy = rangeFrom(rand, 19, 28);
      const cz = rangeFrom(rand, -42, -30);
      const phase = rand();
      for (let i = 0; i < perBurst; i++) {
        const k = b * perBurst + i;
        pos[k * 3] = cx;
        pos[k * 3 + 1] = cy;
        pos[k * 3 + 2] = cz;
        // random point on a sphere → spherical shell burst
        const u = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        dir[k * 3] = s * Math.cos(a);
        dir[k * 3 + 1] = u;
        dir[k * 3 + 2] = s * Math.sin(a);
        seeds[k * 4] = phase;
        seeds[k * 4 + 1] = rand();
        seeds[k * 4 + 2] = rand();
        seeds[k * 4 + 3] = rand();
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColorA: { value: new THREE.Color(colors[0]) },
        uColorB: { value: new THREE.Color(colors[1]) },
      },
    });
    return { geometry, material };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    const x = scrollState.progress * SEGMENTS;
    material.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(x, 6.0, 6.6);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export function Fireworks() {
  return (
    <>
      <Burst colors={["#f0abfc", "#c084fc"]} seed={31} />
      <Burst colors={["#fde68a", "#fb923c"]} seed={57} />
      <Burst colors={["#99f6e4", "#60a5fa"]} seed={83} />
    </>
  );
}
