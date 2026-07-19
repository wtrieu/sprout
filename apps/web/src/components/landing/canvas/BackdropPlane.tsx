"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../scroll/scrollState";
import { SEGMENTS } from "../chapters/chapterConfig";

/** beat index → backdrop file id in /public/landing/backdrops/<id>.webp */
const BACKDROP_IDS = ["hero", "roots", "rain", "dawn", "noon", "golden", "night", "night"];

/**
 * Which beats currently have a painted backdrop loaded. SceneAtmosphere reads
 * this each frame to fade out its procedural hills/clouds where a painting
 * has taken over. Module-level so no React plumbing is needed on a hot path.
 */
export const backdropState = {
  loaded: new Array(BACKDROP_IDS.length).fill(false) as boolean[],
};

const PLANE_DISTANCE = 80;

/**
 * Painted-sky layer: full-frustum billboards that follow the camera, showing
 * the Midjourney backdrop for the current beat and crossfading into the next.
 * Backdrops are OPTIONAL — any beat whose file is missing simply keeps the
 * procedural sky (load errors are swallowed). Drop files in
 * apps/web/public/landing/backdrops/ (see docs/midjourney-prompts.md) and
 * they appear on refresh; no code changes needed.
 */
export function BackdropPlane() {
  const textures = useRef<(THREE.Texture | null)[]>(
    new Array(BACKDROP_IDS.length).fill(null),
  );
  const meshARef = useRef<THREE.Mesh>(null);
  const meshBRef = useRef<THREE.Mesh>(null);

  // transparent (for the crossfade) but depth-tested AND depth-writing at its
  // far distance: the opaque 3D scene has already written closer depth, so the
  // painting only fills true sky — it can never cover the tree or ground.
  const materialA = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: true,
        toneMapped: false,
      }),
    [],
  );
  const materialB = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: true,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const byId = new Map<string, number[]>();
    BACKDROP_IDS.forEach((id, beat) => {
      byId.set(id, [...(byId.get(id) ?? []), beat]);
    });
    const loaded: THREE.Texture[] = [];
    byId.forEach((beats, id) => {
      loader.load(
        `/landing/backdrops/${id}.webp`,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          loaded.push(tex);
          for (const b of beats) {
            textures.current[b] = tex;
            backdropState.loaded[b] = true;
          }
        },
        undefined,
        () => {
          // no painted backdrop for this beat (yet) — procedural sky remains
        },
      );
    });
    return () => {
      loaded.forEach((t) => t.dispose());
      textures.current.fill(null);
      backdropState.loaded.fill(false);
    };
  }, []);

  const viewDir = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const x = THREE.MathUtils.clamp(scrollState.progress, 0, 1) * SEGMENTS;
    const i = Math.min(SEGMENTS - 1, Math.floor(x));
    const f = THREE.MathUtils.smoothstep(x - i, 0, 1);
    const texA = textures.current[i];
    const texB = textures.current[i + 1];

    camera.getWorldDirection(viewDir);
    right.crossVectors(viewDir, camera.up).normalize();

    const place = (
      mesh: THREE.Mesh | null,
      material: THREE.MeshBasicMaterial,
      tex: THREE.Texture | null,
      opacity: number,
      distance: number,
    ) => {
      if (!mesh) return;
      if (!tex || opacity <= 0.001) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      if (material.map !== tex) {
        material.map = tex;
        material.needsUpdate = true;
      }
      material.opacity = opacity;
      const img = tex.image as { width?: number; height?: number } | undefined;
      const imgAspect = img?.width && img?.height ? img.width / img.height : 21 / 9;
      // cover the frustum without stretching the painting
      const scaledH = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const scaledW = scaledH * camera.aspect;
      const h = Math.max(scaledH, scaledW / imgAspect) * 1.18;
      mesh.scale.set(h * imgAspect, h, 1);
      mesh.position
        .copy(camera.position)
        .addScaledVector(viewDir, distance)
        // gentle counter-parallax: the painting sits a world apart
        .addScaledVector(right, -state.pointer.x * 1.6);
      mesh.position.y += -state.pointer.y * 0.9;
      mesh.quaternion.copy(camera.quaternion);
    };

    // A carries the current beat; B (slightly nearer, so it wins the depth
    // test against A) fades in the next one over it
    const sameTex = texA !== null && texA === texB;
    place(meshARef.current, materialA, texA, 1, PLANE_DISTANCE);
    place(meshBRef.current, materialB, sameTex ? null : texB, f, PLANE_DISTANCE - 2);
  });

  useEffect(
    () => () => {
      materialA.dispose();
      materialB.dispose();
    },
    [materialA, materialB],
  );

  return (
    <>
      <mesh ref={meshARef} material={materialA} renderOrder={-1} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={meshBRef} material={materialB} renderOrder={-0.5} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
}
