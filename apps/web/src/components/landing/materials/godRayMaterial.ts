import * as THREE from "three";
import { SIMPLEX_3D } from "./glsl";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
${SIMPLEX_3D}
uniform float uTime;
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  // v: 0 at cone tip (sun), 1 at base — fade toward the base
  float fadeLen = smoothstep(1.0, 0.05, vUv.y);
  // soft flicker across the cone's circumference
  float flicker = 0.6 + 0.4 * snoise(vec3(vUv.x * 5.0, uTime * 0.14, 0.0));
  // feather the wrap seam
  float seam = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  float a = fadeLen * flicker * uIntensity * (0.35 + 0.65 * seam);
  gl_FragColor = vec4(uColor, a);
}
`;

/** Additive volumetric light cone (dawn god rays). */
export function createGodRayMaterial(color: string, intensity = 0.14): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
  });
}
