import * as THREE from "three";

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
varying vec3 vDir;
void main() {
  float h = smoothstep(-0.35, 0.65, vDir.y);
  vec3 col = mix(uBottom, uTop, h);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Inverted gradient dome that follows the camera; colors lerped per frame. */
export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color("#0b0908") },
      uBottom: { value: new THREE.Color("#171009") },
    },
  });
}
