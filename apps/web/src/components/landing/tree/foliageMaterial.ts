import * as THREE from "three";

/**
 * Shared shader for instanced foliage (leaves and blossoms). Real geometry —
 * not point sprites — with per-instance birth pop, wind flutter, two-tone
 * wrapped shading and a subtle translucency glow when backlit.
 */
const VERT = /* glsl */ `
#include <fog_pars_vertex>
uniform float uTime;
uniform float uGrow;
// x: birth, y: phase, z: scale
attribute vec3 aInfo;
varying vec2 vUv;
varying float vMix;
varying vec3 vNormalW;
varying vec3 vViewDir;

void main() {
  vUv = uv;
  vMix = fract(aInfo.y * 7.31);

  // pop into being with a tiny overshoot once the growth frontier arrives
  float t = clamp((uGrow - aInfo.x) / 0.06, 0.0, 1.0);
  float pop = t * (1.0 + 0.35 * sin(t * 3.14159)) ;
  vec3 local = position * aInfo.z * pop;

  // wind: sway around the anchor, stronger at the tip of the leaf
  float sway = sin(uTime * (1.1 + aInfo.y) + aInfo.y * 6.28);
  float lift = cos(uTime * (0.9 + aInfo.y * 0.5) + aInfo.y * 4.0);
  local.x += sway * 0.09 * local.y;
  local.z += lift * 0.07 * local.y;

  mat4 im =
  #ifdef USE_INSTANCING
    instanceMatrix;
  #else
    mat4(1.0);
  #endif

  vec4 worldPos = modelMatrix * im * vec4(local, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * mat3(im) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uHeart;
uniform float uHeartRadius;
uniform float uNight;
varying vec2 vUv;
varying float vMix;
varying vec3 vNormalW;
varying vec3 vViewDir;

void main() {
  vec3 base = mix(uColorA, uColorB, vMix);

  // heart of the bloom / leaf base tint
  float d = length(vUv - vec2(0.5, 0.35));
  base = mix(uHeart, base, smoothstep(0.0, uHeartRadius, d));

  float l = dot(normalize(vNormalW), normalize(vec3(0.45, 0.75, 0.35)));
  float wrap = clamp((abs(l) + 0.5) / 1.5, 0.0, 1.0);
  vec3 col = base * (0.5 + 0.65 * wrap);

  // backlit translucency — anime光: leaves glow when the sun is behind them
  float back = pow(max(0.0, -dot(vNormalW, vViewDir)), 2.0);
  col += base * back * 0.5;

  // moonlight: dim and cool once night falls
  col = mix(col, col * vec3(0.38, 0.44, 0.62), uNight);

  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

export function createFoliageMaterial(opts: {
  colorA: string;
  colorB: string;
  heart: string;
  heartRadius?: number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    side: THREE.DoubleSide,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uGrow: { value: 0 },
      uNight: { value: 0 },
      uColorA: { value: new THREE.Color(opts.colorA) },
      uColorB: { value: new THREE.Color(opts.colorB) },
      uHeart: { value: new THREE.Color(opts.heart) },
      uHeartRadius: { value: opts.heartRadius ?? 0.4 },
    },
  });
}
