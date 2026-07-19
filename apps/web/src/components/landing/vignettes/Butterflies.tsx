"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mulberry32, rangeFrom } from "../lib/rng";

function makeWingGeometry(): THREE.BufferGeometry {
  // one wing pair: two mirrored shapes sharing the body line at x=0
  const wing = new THREE.Shape();
  wing.moveTo(0.02, -0.12);
  wing.quadraticCurveTo(0.32, -0.34, 0.36, -0.08);
  wing.quadraticCurveTo(0.38, 0.02, 0.3, 0.06);
  wing.quadraticCurveTo(0.42, 0.14, 0.34, 0.3);
  wing.quadraticCurveTo(0.2, 0.42, 0.02, 0.16);
  wing.lineTo(0.02, -0.12);
  const right = new THREE.ShapeGeometry(wing, 8);
  const left = right.clone();
  left.scale(-1, 1, 1);
  // manual merge (keep indices)
  const merge = (a: THREE.BufferGeometry, b: THREE.BufferGeometry) => {
    const pa = a.attributes.position.array as Float32Array;
    const pb = b.attributes.position.array as Float32Array;
    const pos = new Float32Array(pa.length + pb.length);
    pos.set(pa);
    pos.set(pb, pa.length);
    const ia = Array.from(a.index!.array);
    const ib = Array.from(b.index!.array).map((i) => i + a.attributes.position.count);
    // left wing was mirrored → flip its winding so faces stay consistent
    for (let i = 0; i < ib.length; i += 3) {
      const t = ib[i + 1];
      ib[i + 1] = ib[i + 2];
      ib[i + 2] = t;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex([...ia, ...ib]);
    geo.computeVertexNormals();
    return geo;
  };
  const merged = merge(right, left);
  right.dispose();
  left.dispose();
  return merged;
}

const VERT = /* glsl */ `
uniform float uTime;
uniform float uFlapSpeed;
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  vec3 p = position;
  // flap: fold each wing up around the body axis (x = 0)
  float flap = sin(uTime * uFlapSpeed) * 0.9;
  float side = sign(p.x);
  float lift = abs(p.x) * flap;
  p.y += lift * 0.55;
  p.x *= cos(flap * 0.8);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vLocal;
void main() {
  float r = length(vLocal);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.05, 0.4, r));
  // darker body line and wing edge
  col *= 1.0 - smoothstep(0.035, 0.0, abs(vLocal.x)) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`;

type ButterflySpec = {
  center: [number, number, number];
  radius: number;
  colorA: string;
  colorB: string;
};

/** A handful of butterflies looping lazy lissajous paths. Pure whimsy. */
export function Butterflies({
  butterflies,
  scale = 1,
}: {
  butterflies: ButterflySpec[];
  scale?: number;
}) {
  const geometry = useMemo(() => makeWingGeometry(), []);
  const rand = useMemo(() => mulberry32(99), []);
  const items = useMemo(
    () =>
      butterflies.map((b) => ({
        ...b,
        phase: rangeFrom(rand, 0, Math.PI * 2),
        speed: rangeFrom(rand, 0.16, 0.28),
        flap: rangeFrom(rand, 9, 13),
        material: new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          side: THREE.DoubleSide,
          uniforms: {
            uTime: { value: 0 },
            uFlapSpeed: { value: 10 },
            uColorA: { value: new THREE.Color(b.colorA) },
            uColorB: { value: new THREE.Color(b.colorB) },
          },
        }),
      })),
    [butterflies, rand],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);

  useEffect(
    () => () => {
      geometry.dispose();
      items.forEach((i) => i.material.dispose());
    },
    [geometry, items],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    items.forEach((b, i) => {
      b.material.uniforms.uTime.value = t + b.phase;
      b.material.uniforms.uFlapSpeed.value = b.flap;
      const g = refs.current[i];
      if (!g) return;
      const a = t * b.speed + b.phase;
      g.position.set(
        b.center[0] + Math.sin(a) * b.radius + Math.sin(a * 2.7) * 0.4,
        b.center[1] + Math.sin(a * 1.7) * b.radius * 0.35 + Math.sin(t * b.flap * 0.5) * 0.03,
        b.center[2] + Math.cos(a * 0.8) * b.radius,
      );
      g.rotation.y = Math.atan2(Math.cos(a) * b.radius, -Math.sin(a * 0.8) * b.radius);
      g.rotation.z = Math.sin(a * 2) * 0.2;
    });
  });

  return (
    <>
      {items.map((b, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          scale={scale}
        >
          <mesh geometry={geometry} material={b.material} rotation={[-0.5, 0, 0]} />
        </group>
      ))}
    </>
  );
}
