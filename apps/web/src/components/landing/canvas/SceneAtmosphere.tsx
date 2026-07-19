"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { BEATS, SEGMENTS } from "../chapters/chapterConfig";
import { scrollState } from "../scroll/scrollState";
import { createSkyMaterial } from "../materials/skyMaterial";
import { ParticleField } from "../particles/ParticleField";

type BeatColors = {
  fog: THREE.Color;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  ambient: THREE.Color;
  key: THREE.Color;
};

/**
 * The cinematic thread: fog, lights and the sky dome lerp between chapter
 * palettes as the journey progresses. Also owns the global star field
 * (fades in for the night chapters) and the soil ground disc.
 */
export function SceneAtmosphere() {
  const scene = useThree((s) => s.scene);

  const beatColors: BeatColors[] = useMemo(
    () =>
      BEATS.map((b) => ({
        fog: new THREE.Color(b.fog),
        skyTop: new THREE.Color(b.skyTop),
        skyBottom: new THREE.Color(b.skyBottom),
        ambient: new THREE.Color(b.ambient),
        key: new THREE.Color(b.key),
      })),
    [],
  );

  const fog = useMemo(() => new THREE.Fog("#0c0a09", 2, 16), []);
  const skyMaterial = useMemo(() => createSkyMaterial(), []);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const skyRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
      skyMaterial.dispose();
    };
  }, [scene, fog, skyMaterial]);

  useFrame((state) => {
    const p = THREE.MathUtils.clamp(scrollState.progress, 0, 1);
    const x = p * SEGMENTS;
    const i = Math.min(SEGMENTS - 1, Math.floor(x));
    const f = THREE.MathUtils.smoothstep(x - i, 0, 1);
    const a = beatColors[i];
    const b = beatColors[i + 1];
    const beatA = BEATS[i];
    const beatB = BEATS[i + 1];

    fog.color.lerpColors(a.fog, b.fog, f);
    fog.near = THREE.MathUtils.lerp(beatA.fogNear, beatB.fogNear, f);
    fog.far = THREE.MathUtils.lerp(beatA.fogFar, beatB.fogFar, f);

    if (ambientRef.current) {
      ambientRef.current.color.lerpColors(a.ambient, b.ambient, f);
      ambientRef.current.intensity = THREE.MathUtils.lerp(
        beatA.ambientIntensity,
        beatB.ambientIntensity,
        f,
      );
    }
    if (keyRef.current) {
      keyRef.current.color.lerpColors(a.key, b.key, f);
      keyRef.current.intensity = THREE.MathUtils.lerp(beatA.keyIntensity, beatB.keyIntensity, f);
    }

    const sky = skyMaterial.uniforms;
    (sky.uTop.value as THREE.Color).lerpColors(a.skyTop, b.skyTop, f);
    (sky.uBottom.value as THREE.Color).lerpColors(a.skyBottom, b.skyBottom, f);
    if (skyRef.current) skyRef.current.position.copy(state.camera.position);
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.4} />
      <directionalLight ref={keyRef} position={[6, 18, 8]} intensity={0.6} />
      {/* sky dome follows the camera */}
      <mesh ref={skyRef} material={skyMaterial} frustumCulled={false}>
        <sphereGeometry args={[70, 24, 16]} />
      </mesh>
      {/* soil surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[60, 48]} />
        <meshStandardMaterial color="#171009" roughness={1} metalness={0} />
      </mesh>
      {/* stars — global, fade in as night falls (beats 5.2 → 6) */}
      <ParticleField
        count={1300}
        center={[0, 34, -6]}
        box={[130, 40, 130]}
        color="#dbe4ff"
        color2="#f5f0dc"
        size={4.2}
        opacity={0.9}
        twinkle={0.85}
        additive
        driftAmp={[0, 0, 0]}
        fadeFar={200}
        opacityFn={(p) => {
          const x = p * SEGMENTS;
          return THREE.MathUtils.smoothstep(x, 5.15, 6.0);
        }}
      />
    </>
  );
}
