import * as THREE from "three";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;

float ring(float r, float t, float width) {
  float radius = fract(t);
  return smoothstep(width, 0.0, abs(r - radius)) * (1.0 - radius);
}

void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = 0.0;
  a += ring(r, uTime * 0.23, 0.035);
  a += ring(r, uTime * 0.23 + 0.37, 0.03);
  a += ring(r, uTime * 0.23 + 0.71, 0.025);
  // fade the whole disc toward its rim
  a *= smoothstep(1.0, 0.55, r) * uOpacity;
  gl_FragColor = vec4(uColor, a * 0.5);
}
`;

/** Expanding rain-ripple rings on the ground plane. */
export function createRippleMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
    },
  });
}
