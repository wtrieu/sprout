"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../scroll/scrollState";
import { SEGMENTS } from "../chapters/chapterConfig";

const VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aSeed;
varying float vAlpha;
void main() {
  // each star fires briefly once per long cycle, offset by its seed
  float cycle = 11.0 + aSeed.x * 7.0;
  float t = mod(uTime + aSeed.y * 31.0, cycle) / cycle;
  float window = 0.045;
  float k = clamp(t / window, 0.0, 1.0);
  vAlpha = (t < window) ? sin(k * 3.14159) : 0.0;

  // streak from its spawn point diagonally down-left
  vec3 pos = position + vec3(-k * 22.0, -k * 9.0, 0.0);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (140.0 + aSeed.z * 80.0) * (10.0 / max(1.0, -mv.z));
}
`;

const FRAG = /* glsl */ `
varying float vAlpha;
uniform float uOpacity;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  // angled streak with a bright head
  float along = p.x + p.y * 0.42;
  float across = p.y * 0.42 - p.x * 0.18;
  float tail = smoothstep(0.5, -0.15, along);
  float thin = smoothstep(0.05, 0.0, abs(across));
  float head = pow(smoothstep(0.35, 0.0, length(p + vec2(0.3, 0.12))), 2.0);
  float a = (tail * thin * 0.8 + head) * vAlpha * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), a);
}
`;

/** Rare, quiet meteors over the night canopy. Blink and you'll miss one. */
export function ShootingStars() {
  const { geometry, material } = useMemo(() => {
    const n = 3;
    const pos = new Float32Array(n * 3);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = 6 + i * 9;
      pos[i * 3 + 1] = 30 + i * 4;
      pos[i * 3 + 2] = -26 - i * 6;
      for (let j = 0; j < 4; j++) seeds[i * 4 + j] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    });
    return { geometry, material };
  }, []);

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
    material.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(x, 5.4, 6.1);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
