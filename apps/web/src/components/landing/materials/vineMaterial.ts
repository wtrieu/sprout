import * as THREE from "three";

export type VineMaterialOptions = {
  color: string;
  glow: string;
  /** phase offset so tubes don't pulse in unison */
  phase?: number;
  /** show a traveling glow pulse along the tube (roots) */
  pulse?: boolean;
  /** glow at the growing tip (stem) */
  tipGlow?: boolean;
};

const VERT = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform vec3 uGlow;
uniform float uTime;
uniform float uGrow;
uniform float uPhase;
uniform float uPulseOn;
uniform float uTipOn;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vNormalW;

void main() {
  // tube grows tip-ward along uv.x
  float edge = uGrow;
  if (vUv.x > edge) discard;

  float light = 0.45 + 0.55 * max(0.0, dot(vNormalW, normalize(vec3(0.4, 0.8, 0.3))));
  vec3 col = uColor * light;

  // traveling pulse root -> tip (data flowing home)
  float head = mod(uTime * 0.16 + uPhase, 1.35);
  float band = smoothstep(0.10, 0.0, abs(vUv.x - head));
  col += uGlow * band * 1.6 * uPulseOn;

  // glowing growth tip
  float tip = smoothstep(0.12, 0.0, edge - vUv.x) * uTipOn;
  col += uGlow * tip * 1.8;

  gl_FragColor = vec4(col, uOpacity);
  #include <fog_fragment>
}
`;

export function createVineMaterial(opts: VineMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColor: { value: new THREE.Color(opts.color) },
      uGlow: { value: new THREE.Color(opts.glow) },
      uTime: { value: 0 },
      uGrow: { value: 1 },
      uPhase: { value: opts.phase ?? 0 },
      uPulseOn: { value: opts.pulse ? 1 : 0 },
      uTipOn: { value: opts.tipGlow ? 1 : 0 },
      uOpacity: { value: 1 },
    },
  });
}
