"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { BEATS } from "../chapters/chapterConfig";
import { scrollState } from "../scroll/scrollState";

/**
 * Samples a Catmull-Rom path through the 8 beat cameras at (damped) scroll
 * progress, then layers damped mouse parallax and a slow breathing drift so
 * the frame is never perfectly still.
 */
export function CameraRig() {
  const { posCurve, lookCurve } = useMemo(() => {
    const pos = BEATS.map((b) => new THREE.Vector3(...b.camera));
    const look = BEATS.map((b) => new THREE.Vector3(...b.lookAt));
    return {
      posCurve: new THREE.CatmullRomCurve3(pos, false, "catmullrom", 0.35),
      lookCurve: new THREE.CatmullRomCurve3(look, false, "catmullrom", 0.35),
    };
  }, []);

  const smoothed = useRef<number | null>(null);
  const parallax = useRef(new THREE.Vector2(0, 0));
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);

    // damp scroll progress a touch beyond Lenis' own lerp for buttery camera;
    // first frame snaps (deep-link/pinned-beat loads shouldn't fly the camera in)
    if (smoothed.current === null) smoothed.current = scrollState.progress;
    smoothed.current += (scrollState.progress - smoothed.current) * (1 - Math.exp(-dt * 5.5));
    const t = THREE.MathUtils.clamp(smoothed.current, 0, 1);

    posCurve.getPoint(t, pos);
    lookCurve.getPoint(t, look);

    // damped mouse parallax (state.pointer is -1..1)
    parallax.current.x += (state.pointer.x - parallax.current.x) * (1 - Math.exp(-dt * 3));
    parallax.current.y += (state.pointer.y - parallax.current.y) * (1 - Math.exp(-dt * 3));
    pos.x += parallax.current.x * 0.45;
    pos.y += parallax.current.y * 0.25;

    // breathing drift
    const time = state.clock.elapsedTime;
    pos.x += Math.sin(time * 0.23) * 0.06;
    pos.y += Math.sin(time * 0.31) * 0.05;

    state.camera.position.copy(pos);
    state.camera.lookAt(look);
  });

  return null;
}
