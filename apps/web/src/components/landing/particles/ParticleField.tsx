"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  createParticleMaterial,
  type ParticleMaterialOptions,
} from "../materials/particleMaterial";
import { scrollState } from "../scroll/scrollState";
import { localProgress } from "../chapters/chapterConfig";
import { useQuality } from "../hooks/quality";

type ParticleFieldProps = ParticleMaterialOptions & {
  count: number;
  center?: [number, number, number];
  /** spawn box dimensions around center */
  box?: [number, number, number];
  /** explicit positions override (xyz triplets) — count is ignored */
  positions?: Float32Array;
  /** stagger-scale particles in with this beat's local progress */
  growBeat?: number;
  /** per-frame opacity from global progress (chapter fades) */
  opacityFn?: (progress: number) => number;
};

/**
 * One draw call of GPU particles. All motion lives in the vertex shader;
 * per-frame JS only writes uniforms (time, scroll velocity, chapter progress).
 */
export function ParticleField({
  count,
  center = [0, 0, 0],
  box = [10, 10, 10],
  positions,
  growBeat,
  opacityFn,
  ...matOpts
}: ParticleFieldProps) {
  const { particleScale } = useQuality();
  const baseOpacity = matOpts.opacity ?? 1;
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const n = positions ? Math.floor(positions.length / 3) : Math.max(1, Math.round(count * particleScale));
    const pos =
      positions ??
      (() => {
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          arr[i * 3] = center[0] + (Math.random() - 0.5) * box[0];
          arr[i * 3 + 1] = center[1] + (Math.random() - 0.5) * box[1];
          arr[i * 3 + 2] = center[2] + (Math.random() - 0.5) * box[2];
        }
        return arr;
      })();
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, particleScale, positions]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const material = useMemo(() => createParticleMaterial(matOpts), []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame((state) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uPixelRatio.value = state.gl.getPixelRatio();
    u.uVelocity.value = scrollState.velocity;
    if (growBeat !== undefined) {
      u.uGrow.value = localProgress(scrollState.progress, growBeat);
    }
    if (opacityFn) {
      u.uOpacity.value = baseOpacity * opacityFn(scrollState.progress);
    }
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />;
}
