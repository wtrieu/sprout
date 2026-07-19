"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { BEATS, SEGMENTS } from "../chapters/chapterConfig";
import { scrollState } from "../scroll/scrollState";
import { createSkyMaterial } from "../materials/skyMaterial";
import { ParticleField } from "../particles/ParticleField";
import { mergeGeometries } from "../lib/taperedTube";
import { mulberry32, rangeFrom } from "../lib/rng";
import { backdropState } from "./BackdropPlane";

type BeatColors = {
  fog: THREE.Color;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
  ambient: THREE.Color;
  key: THREE.Color;
  sunColor: THREE.Color;
  cloudColor: THREE.Color;
  cloudShadow: THREE.Color;
  ground: THREE.Color;
  sunDir: THREE.Vector3;
};

/** Rolling hill silhouettes — three depth bands of merged cones. */
function makeHillBand(seed: number, radius: number, height: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const cones: THREE.BufferGeometry[] = [];
  const count = 5;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rangeFrom(rand, -0.3, 0.3);
    const r = radius * rangeFrom(rand, 0.85, 1.15);
    const h = height * rangeFrom(rand, 0.55, 1.25);
    const base = rangeFrom(rand, 13, 22);
    const cone = new THREE.ConeGeometry(base, h, 24, 1, true);
    cone.translate(Math.cos(a) * r, h / 2 - 0.05, Math.sin(a) * r);
    cones.push(cone.toNonIndexed());
  }
  // toNonIndexed strips indices; re-index trivially for the shared merge util
  const indexed = cones.map((g) => {
    const idx = new Uint32Array(g.attributes.position.count);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  });
  const merged = mergeGeometries(indexed);
  indexed.forEach((g) => g.dispose());
  return merged;
}

/**
 * The film's color script made live: fog, lights, sky (sun, clouds), ground
 * and hill silhouettes all lerp between chapter palettes as the journey
 * progresses. Also owns the global star field.
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
        sunColor: new THREE.Color(b.sunColor),
        cloudColor: new THREE.Color(b.cloudColor),
        cloudShadow: new THREE.Color(b.cloudShadow),
        ground: new THREE.Color(b.ground),
        sunDir: new THREE.Vector3(...b.sunDir).normalize(),
      })),
    [],
  );

  const fog = useMemo(() => new THREE.Fog("#0c0a09", 2, 16), []);
  const skyMaterial = useMemo(() => createSkyMaterial(), []);
  const groundMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#171009", roughness: 1, metalness: 0 }),
    [],
  );
  const hillBands = useMemo(
    () => [
      { geo: makeHillBand(11, 42, 4.4), mat: new THREE.MeshBasicMaterial({ transparent: true }) },
      { geo: makeHillBand(23, 58, 6.2), mat: new THREE.MeshBasicMaterial({ transparent: true }) },
      { geo: makeHillBand(37, 78, 8.8), mat: new THREE.MeshBasicMaterial({ transparent: true }) },
    ],
    [],
  );

  const ambientRef = useRef<THREE.AmbientLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const skyRef = useRef<THREE.Mesh>(null);
  const hillsRef = useRef<THREE.Group>(null);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpDir = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
      skyMaterial.dispose();
      groundMaterial.dispose();
      hillBands.forEach((b) => {
        b.geo.dispose();
        b.mat.dispose();
      });
    };
  }, [scene, fog, skyMaterial, groundMaterial, hillBands]);

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
      // the key light follows the sun across the sky
      tmpDir.lerpVectors(a.sunDir, b.sunDir, f).normalize();
      keyRef.current.position.set(tmpDir.x * 30, Math.max(6, tmpDir.y * 30), tmpDir.z * 30);
    }

    // how much of the current view is covered by a painted backdrop —
    // procedural clouds and hills bow out where a painting has taken over
    const painted = THREE.MathUtils.lerp(
      backdropState.loaded[i] ? 1 : 0,
      backdropState.loaded[i + 1] ? 1 : 0,
      f,
    );

    const sky = skyMaterial.uniforms;
    (sky.uTop.value as THREE.Color).lerpColors(a.skyTop, b.skyTop, f);
    (sky.uBottom.value as THREE.Color).lerpColors(a.skyBottom, b.skyBottom, f);
    (sky.uSunColor.value as THREE.Color).lerpColors(a.sunColor, b.sunColor, f);
    (sky.uCloudColor.value as THREE.Color).lerpColors(a.cloudColor, b.cloudColor, f);
    (sky.uCloudShadow.value as THREE.Color).lerpColors(a.cloudShadow, b.cloudShadow, f);
    (sky.uSunDir.value as THREE.Vector3).lerpVectors(a.sunDir, b.sunDir, f);
    sky.uSunSize.value = THREE.MathUtils.lerp(beatA.sunSize, beatB.sunSize, f);
    sky.uHaloStrength.value = THREE.MathUtils.lerp(beatA.halo, beatB.halo, f);
    sky.uCloudAmount.value =
      THREE.MathUtils.lerp(beatA.cloudAmount, beatB.cloudAmount, f) * (1 - painted);
    sky.uTime.value = state.clock.elapsedTime;
    if (skyRef.current) skyRef.current.position.copy(state.camera.position);

    groundMaterial.color.lerpColors(a.ground, b.ground, f);

    // hills take a silhouette tone between fog and sky-bottom, deeper per band
    if (hillsRef.current) {
      hillsRef.current.visible = x > 1.55 && painted < 0.98;
      tmpColor.lerpColors(a.fog, b.fog, f);
      const skyBottomNow = skyMaterial.uniforms.uBottom.value as THREE.Color;
      hillBands.forEach((band, bi) => {
        band.mat.opacity = 1 - painted;
        band.mat.color
          .copy(tmpColor)
          .lerp(skyBottomNow, 0.14 + bi * 0.14)
          .multiplyScalar(0.88);
      });
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.4} />
      <directionalLight ref={keyRef} position={[6, 18, 8]} intensity={0.6} />
      {/* sky dome follows the camera; painted backdrops draw over it at renderOrder -1 */}
      <mesh ref={skyRef} material={skyMaterial} renderOrder={-2} frustumCulled={false}>
        <sphereGeometry args={[110, 32, 20]} />
      </mesh>
      {/* rolling ground + hill silhouettes */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} material={groundMaterial}>
        <circleGeometry args={[120, 64]} />
      </mesh>
      <group ref={hillsRef}>
        {hillBands.map((band, i) => (
          <mesh key={i} geometry={band.geo} material={band.mat} />
        ))}
      </group>
      {/* stars — global, fade in as night falls (beats 5.2 → 6) */}
      <ParticleField
        count={1300}
        center={[0, 40, -6]}
        box={[160, 50, 160]}
        color="#dbe4ff"
        color2="#f5f0dc"
        size={4.2}
        opacity={0.9}
        twinkle={0.85}
        additive
        driftAmp={[0, 0, 0]}
        fadeFar={260}
        opacityFn={(p) => {
          const x = p * SEGMENTS;
          return THREE.MathUtils.smoothstep(x, 5.15, 6.0);
        }}
      />
    </>
  );
}
