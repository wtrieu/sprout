import * as THREE from "three";
import { SIMPLEX_3D } from "./glsl";

const VERT = /* glsl */ `
#include <fog_pars_vertex>
${SIMPLEX_3D}
uniform float uTime;
varying vec3 vNormalW;
varying vec3 vPosL;
varying vec3 vViewDir;
void main() {
  vPosL = position;
  float n = snoise(position * 2.6 + vec3(0.0, uTime * 0.06, 0.0));
  vec3 displaced = position + normal * n * 0.09;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <fog_pars_fragment>
${SIMPLEX_3D}
uniform float uTime;
uniform vec3 uCrust;
uniform vec3 uEmber;
varying vec3 vNormalW;
varying vec3 vPosL;
varying vec3 vViewDir;

void main() {
  // slow heartbeat
  float beat = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(uTime * 1.7), 2.0);

  float n = snoise(vPosL * 5.0);
  // glowing cracks where noise bands cross zero
  float crack = smoothstep(0.16, 0.02, abs(n));

  float light = 0.35 + 0.65 * max(0.0, dot(vNormalW, normalize(vec3(0.4, 0.9, 0.4))));
  vec3 col = uCrust * light;
  col += uEmber * crack * beat * 2.2;

  // warm fresnel rim — the life inside showing at the silhouette
  float fresnel = pow(1.0 - max(0.0, dot(vNormalW, vViewDir)), 2.5);
  col += uEmber * fresnel * beat * 0.8;

  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

export function createSeedMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uCrust: { value: new THREE.Color("#3a2a1a") },
      uEmber: { value: new THREE.Color("#f59e0b") },
    },
  });
}
