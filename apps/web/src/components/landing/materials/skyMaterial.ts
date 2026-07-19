import * as THREE from "three";

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

/**
 * Anime-film sky: layered gradient, drifting FBM clouds lit from the sun's
 * side, a sun/moon disc with a soft halo. Everything palette-driven so the
 * one dome carries soil-dark, storm, dawn, noon, golden hour and night.
 */
const FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uHaloStrength;
uniform float uCloudAmount;
uniform vec3 uCloudColor;
uniform vec3 uCloudShadow;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.13 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = smoothstep(-0.35, 0.7, dir.y);
  // triple-stop gradient: horizon glow (daylight only — uHaloStrength gates it)
  float glowAmt = 0.35 * clamp(uHaloStrength * 2.5, 0.0, 1.0);
  vec3 horizonGlow = mix(uBottom, uSunColor, glowAmt);
  vec3 col = mix(horizonGlow, uBottom, smoothstep(0.0, 0.22, abs(dir.y)));
  col = mix(col, uTop, h);

  // sun / moon
  float sunDot = dot(dir, normalize(uSunDir));
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.55, sunDot);
  float halo = pow(max(0.0, sunDot), 24.0) * uHaloStrength;
  col += uSunColor * (disc * 1.6 + halo);

  // clouds hug the mid-sky band; they scroll slowly and take the sun's light
  if (uCloudAmount > 0.003 && dir.y > 0.02) {
    vec2 cuv = dir.xz / (dir.y + 0.28);
    float n = fbm(cuv * 1.4 + vec2(uTime * 0.012, uTime * 0.004));
    float wisps = fbm(cuv * 3.1 - vec2(uTime * 0.02, 0.0));
    float cloud = smoothstep(1.0 - uCloudAmount, 1.0 - uCloudAmount + 0.28, n * 0.75 + wisps * 0.35);
    cloud *= smoothstep(0.02, 0.14, dir.y) * smoothstep(0.95, 0.35, dir.y);
    float lit = 0.5 + 0.5 * sunDot;
    vec3 cloudCol = mix(uCloudShadow, uCloudColor, lit);
    // silver lining near the sun
    cloudCol += uSunColor * pow(max(0.0, sunDot), 8.0) * 0.45;
    col = mix(col, cloudCol, cloud * 0.85);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color("#0b0908") },
      uBottom: { value: new THREE.Color("#171009") },
      uSunDir: { value: new THREE.Vector3(0.4, 0.25, -0.6) },
      uSunColor: { value: new THREE.Color("#f59e0b") },
      uSunSize: { value: 0.0006 },
      uHaloStrength: { value: 0 },
      uCloudAmount: { value: 0 },
      uCloudColor: { value: new THREE.Color("#e8d9c2") },
      uCloudShadow: { value: new THREE.Color("#3a3f52") },
      uTime: { value: 0 },
    },
  });
}
