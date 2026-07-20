import * as THREE from "three";
import { SIMPLEX_3D } from "../materials/glsl";

const VERT = /* glsl */ `
#include <fog_pars_vertex>
uniform float uGrow;
attribute float aBirth;
attribute vec3 aCenter;
varying float vBirth;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vViewDir;

void main() {
  vBirth = aBirth;
  vUv = uv;
  // the growth frontier swells out of the centerline instead of cutting off
  float open = smoothstep(0.0, 0.045, uGrow - aBirth);
  vec3 grown = mix(aCenter, position, open);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(grown, 1.0);
  vPosW = worldPos.xyz;
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
${SIMPLEX_3D}
uniform float uGrow;
uniform float uTime;
uniform vec3 uBarkLow;
uniform vec3 uBarkHigh;
uniform vec3 uEmber;
uniform vec3 uRim;
uniform float uRimStrength;
uniform float uNight;
varying float vBirth;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec3 vViewDir;

void main() {
  if (vBirth > uGrow) discard;

  // painterly bark: striations around the ring + patches, colour drifting with height
  float striae = snoise(vec3(vUv.y * 9.0, vPosW.y * 2.4, 1.7)) * 0.5 + 0.5;
  float patches = snoise(vPosW * 0.6) * 0.5 + 0.5;
  vec3 base = mix(uBarkLow, uBarkHigh, clamp(vPosW.y / 12.0 + 0.35, 0.0, 1.0));
  base *= 0.78 + 0.3 * striae * patches;

  // soft key light + wrapped diffuse (Pixar-ish roundness)
  float l = dot(normalize(vNormalW), normalize(vec3(0.45, 0.75, 0.35)));
  float wrap = clamp((l + 0.6) / 1.6, 0.0, 1.0);
  vec3 col = base * (0.35 + 0.75 * wrap);

  // cool rim from the sky
  float fresnel = pow(1.0 - max(0.0, dot(vNormalW, vViewDir)), 3.0);
  col += uRim * fresnel * uRimStrength;

  // moonlight: dim and cool once night falls
  col = mix(col, col * vec3(0.4, 0.46, 0.66), uNight);

  // magical growth frontier: an ember band creeping through the wood
  float band = smoothstep(0.05, 0.0, abs(uGrow - vBirth) - 0.005);
  float sparkle = 0.75 + 0.25 * sin(uTime * 5.0 + vPosW.y * 7.0);
  col += uEmber * band * sparkle * 2.4;

  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

export function createBarkMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uGrow: { value: 0 },
      uTime: { value: 0 },
      uBarkLow: { value: new THREE.Color("#4a3220") },
      uBarkHigh: { value: new THREE.Color("#6b4a30") },
      uEmber: { value: new THREE.Color("#fbbf24") },
      uRim: { value: new THREE.Color("#b7c9e8") },
      uRimStrength: { value: 0.25 },
      uNight: { value: 0 },
    },
  });
}
