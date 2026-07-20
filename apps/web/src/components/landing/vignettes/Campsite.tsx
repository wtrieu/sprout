"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ParticleField } from "../particles/ParticleField";

/** Soft rounded figure: sphere head over a capsule body. Faceless, cozy. */
function Figure({
  position,
  rotation,
  bodyColor,
  scale = 1,
  bobPhase = 0,
}: {
  position: [number, number, number];
  rotation: number;
  bodyColor: string;
  scale?: number;
  bobPhase?: number;
}) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.85 }),
    [bodyColor],
  );
  const headMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e8c4a0", roughness: 0.8 }),
    [],
  );
  const ref = useRef<THREE.Group>(null);

  useEffect(
    () => () => {
      material.dispose();
      headMaterial.dispose();
    },
    [material, headMaterial],
  );

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    // gentle campfire-story sway
    g.rotation.z = Math.sin(state.clock.elapsedTime * 0.7 + bobPhase) * 0.04;
  });

  return (
    <group ref={ref} position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh material={material} position={[0, 0.26, 0]}>
        <capsuleGeometry args={[0.16, 0.24, 6, 12]} />
      </mesh>
      <mesh material={headMaterial} position={[0, 0.62, 0]}>
        <sphereGeometry args={[0.13, 14, 12]} />
      </mesh>
    </group>
  );
}

/** Pyramid tent with a softly glowing doorway. */
function Tent({
  position,
  rotation,
  canvasColor,
  scale = 1,
}: {
  position: [number, number, number];
  rotation: number;
  canvasColor: string;
  scale?: number;
}) {
  const canvasMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: canvasColor, roughness: 0.9, flatShading: true }),
    [canvasColor],
  );
  const doorMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#ffdf9e",
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(
    () => () => {
      canvasMaterial.dispose();
      doorMaterial.dispose();
    },
    [canvasMaterial, doorMaterial],
  );

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      <mesh material={canvasMaterial} position={[0, 0.62, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.05, 1.25, 4]} />
      </mesh>
      {/* warm light spilling from the door — a family inside, telling stories */}
      <mesh material={doorMaterial} position={[0, 0.3, 0.72]} rotation={[0, 0, 0]}>
        <shapeGeometry
          args={[
            (() => {
              const s = new THREE.Shape();
              s.moveTo(-0.26, 0);
              s.lineTo(0, 0.55);
              s.lineTo(0.26, 0);
              s.lineTo(-0.26, 0);
              return s;
            })(),
          ]}
        />
      </mesh>
    </group>
  );
}

/**
 * The meadow campsite: two glowing tents, a small campfire with a family
 * gathered round, sparks rising into the leaves — an everyday evening made
 * a little magic, KyoAni-style.
 */
export function Campsite() {
  const logMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#4a3320", roughness: 1 }),
    [],
  );
  const fireLight = useRef<THREE.PointLight>(null);

  useEffect(() => () => logMaterial.dispose(), [logMaterial]);

  useFrame((state) => {
    if (fireLight.current) {
      const t = state.clock.elapsedTime;
      fireLight.current.intensity = 7 + Math.sin(t * 9.7) * 1.2 + Math.sin(t * 23.3) * 0.8;
    }
  });

  return (
    <group position={[4.2, 0, 3.4]}>
      {/* tents facing the fire */}
      <Tent position={[1.7, 0, -1.3]} rotation={-0.7} canvasColor="#f2e3c8" />
      <Tent position={[-0.4, 0, -2.2]} rotation={0.15} canvasColor="#e8b8a8" scale={0.85} />

      {/* campfire: crossed logs, flame light, spark column */}
      <group position={[0.4, 0, 0.6]}>
        {[0.4, 1.7, 2.9].map((rot, i) => (
          <mesh
            key={i}
            material={logMaterial}
            position={[0, 0.07, 0]}
            rotation={[0.12, rot, Math.PI / 2 - 0.18]}
          >
            <cylinderGeometry args={[0.045, 0.045, 0.7, 6]} />
          </mesh>
        ))}
        <pointLight ref={fireLight} position={[0, 0.5, 0]} color="#ffb057" distance={9} decay={2} />
        <ParticleField
          count={60}
          center={[0, 0.8, 0]}
          box={[0.5, 1.6, 0.5]}
          color="#ffd9a0"
          color2="#ff9d2e"
          size={2.6}
          opacity={0.9}
          additive
          twinkle={0.6}
          fallSpeed={-0.85}
          wrapY={[0.1, 2]}
          driftAmp={[0.12, 0.05, 0.12]}
          driftFreq={1.2}
          fadeFar={26}
        />
        {/* the family, gathered round */}
        <Figure position={[-0.75, 0, 0.35]} rotation={1.1} bodyColor="#5a6e9e" bobPhase={0} />
        <Figure position={[0.55, 0, 0.85]} rotation={-2.2} bodyColor="#a8586a" bobPhase={1.4} />
        <Figure position={[-0.2, 0, 1.05]} rotation={-2.9} bodyColor="#5f9e7a" scale={0.62} bobPhase={2.6} />
      </group>
    </group>
  );
}
