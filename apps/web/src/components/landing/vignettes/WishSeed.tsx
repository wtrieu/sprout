"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

const VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosL;
void main() {
  vPosL = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uCore;
uniform vec3 uEdge;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vPosL;
void main() {
  // soft luminous heart, rose-violet at the silhouette — KyoAni light, not lava
  float facing = max(0.0, dot(normalize(vNormalW), normalize(vViewDir)));
  float breathe = 0.92 + 0.08 * sin(uTime * 1.1);
  vec3 col = mix(uEdge, uCore * 1.9, pow(facing, 1.6)) * breathe;
  // faint vertical shimmer inside the glass
  col += uCore * 0.25 * (0.5 + 0.5 * sin(vPosL.y * 18.0 + uTime * 1.4));
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * The opening's heart: not a clod of earth but a wish — a luminous glass
 * teardrop drifting in the twilight soil-sky, trailing sparkles, waiting
 * to become the tree.
 */
export function WishSeed({ position }: { position: [number, number, number] }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uCore: { value: new THREE.Color("#fff7e0") },
          uEdge: { value: new THREE.Color("#c084fc") },
        },
      }),
    [],
  );
  const haloMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        color: "#e9d5ff",
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        map: (() => {
          // radial-gradient halo drawn once to a small canvas
          const c = document.createElement("canvas");
          c.width = c.height = 128;
          const ctx = c.getContext("2d")!;
          const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
          g.addColorStop(0, "rgba(255,255,255,1)");
          g.addColorStop(0.35, "rgba(255,240,255,0.5)");
          g.addColorStop(1, "rgba(255,240,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 128, 128);
          const tex = new THREE.CanvasTexture(c);
          return tex;
        })(),
      }),
    [],
  );
  const groupRef = useRef<THREE.Group>(null);

  useEffect(
    () => () => {
      material.dispose();
      haloMaterial.map?.dispose();
      haloMaterial.dispose();
    },
    [material, haloMaterial],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    const g = groupRef.current;
    if (!g) return;
    // adrift on a slow thermal, turning gently
    g.position.set(
      position[0] + Math.sin(t * 0.4) * 0.3,
      position[1] + Math.sin(t * 0.55) * 0.4,
      position[2] + Math.cos(t * 0.33) * 0.2,
    );
    g.rotation.z = Math.sin(t * 0.45) * 0.18;
    g.rotation.y = t * 0.12;
  });

  return (
    <group ref={groupRef}>
      <mesh material={material} scale={[0.34, 0.5, 0.34]}>
        <sphereGeometry args={[1, 32, 24]} />
      </mesh>
      <sprite material={haloMaterial} scale={[3.6, 3.6, 1]} />
      <pointLight color="#e8d5ff" intensity={7} distance={11} decay={2} />
    </group>
  );
}
