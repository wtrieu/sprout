"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../scroll/scrollState";
import { BEATS, SEGMENTS } from "../chapters/chapterConfig";
import { moteTarget } from "./moteTarget";

const UP = new THREE.Vector3(0, 1, 0);

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;

void main() {
  vec2 p = vUv - 0.5;
  float d = length(p);
  // soft luminous core with a four-point star flare — the wish itself
  float core = pow(smoothstep(0.5, 0.0, d), 2.2);
  float star = pow(max(0.0, 1.0 - abs(p.x * p.y) * 46.0), 5.0) * smoothstep(0.55, 0.08, d);
  float a = (core + star * 0.7) * uOpacity;
  if (a < 0.01) discard;
  vec3 col = uColor * (0.75 + 1.1 * core) + vec3(0.25) * core;
  gl_FragColor = vec4(col, a);
}
`;

/**
 * The story's connective thread: one glowing ❋ mote that rides beside the
 * camera from seed to canopy, tinted by each beat's emotional accent. The
 * tree it will become lives in the paintings; the mote is the wish that
 * travels with you (and, at the finale, settles into the CTA).
 */
export function WishMote() {
  const meshRef = useRef<THREE.Mesh>(null);
  const smoothed = useRef(0);

  // a drifting path parallel to the camera path: ahead of each beat camera,
  // weaving gently side to side so it never blocks the copy
  const curve = useMemo(() => {
    const stations = BEATS.map((b, i) => {
      const cam = new THREE.Vector3(...b.camera);
      const look = new THREE.Vector3(...b.lookAt);
      const dir = look.clone().sub(cam).normalize();
      const right = new THREE.Vector3().crossVectors(dir, UP).normalize();
      const side = i % 2 === 0 ? 1 : -1;
      return cam
        .clone()
        .addScaledVector(dir, 6)
        .addScaledVector(right, side * 1.7)
        .add(new THREE.Vector3(0, 0.45 * ((i % 3) - 1), 0));
    });
    return new THREE.CatmullRomCurve3(stations, false, "centripetal");
  }, []);

  const accents = useMemo(() => BEATS.map((b) => new THREE.Color(b.accent)), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor: { value: new THREE.Color("#f0abfc") },
          uOpacity: { value: 1 },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const pos = useMemo(() => new THREE.Vector3(), []);
  const landPos = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(delta, 0.1);
    const time = state.clock.elapsedTime;

    // same frame-rate-independent damping as the CameraRig, slightly looser —
    // the mote trails the journey like a companion, not a crosshair
    smoothed.current += (scrollState.progress - smoothed.current) * (1 - Math.exp(-dt * 4.5));
    const t = THREE.MathUtils.clamp(smoothed.current, 0, 1);
    curve.getPoint(t, pos);

    const x = t * SEGMENTS;

    // the finale: the wish descends and settles into the ❋ on the CTA
    const landing = THREE.MathUtils.smoothstep(x, 6.4, 6.92);
    const drift = 1 - landing;

    // firefly drift, stilled as it comes in to land
    pos.x += (Math.sin(time * 0.7) * 0.2 + Math.sin(time * 1.7) * 0.05) * drift;
    pos.y += Math.sin(time * 0.9 + 1.7) * 0.16 * drift;
    pos.z += Math.sin(time * 0.5 + 3.1) * 0.12 * drift;

    if (landing > 0 && moteTarget.el) {
      // project the button's viewport center onto a ray from the camera and
      // land a fixed distance along it
      const rect = moteTarget.el.getBoundingClientRect();
      const nx = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
      const ny = -(((rect.top + rect.height / 2) / window.innerHeight) * 2 - 1);
      landPos.set(nx, ny, 0.5).unproject(state.camera).sub(state.camera.position).normalize();
      landPos.multiplyScalar(7).add(state.camera.position);
      pos.lerp(landPos, landing);
    }

    mesh.position.copy(pos);
    mesh.quaternion.copy(state.camera.quaternion);
    const pulse = 1 + 0.12 * Math.sin(time * 2.3) * drift;
    // it settles smaller — a wish becoming a doorway's keyhole
    mesh.scale.setScalar(THREE.MathUtils.lerp(0.6, 0.34, landing) * pulse);

    // accent tint lerped between beats
    const i = Math.min(SEGMENTS - 1, Math.floor(x));
    const f = THREE.MathUtils.smoothstep(x - i, 0, 1);
    (material.uniforms.uColor.value as THREE.Color).lerpColors(accents[i], accents[i + 1], f);
  });

  return (
    <mesh ref={meshRef} material={material} renderOrder={5} frustumCulled={false}>
      <planeGeometry args={[1.1, 1.1]} />
    </mesh>
  );
}
