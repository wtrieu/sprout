import * as THREE from "three";
import type { BeatLayer, LayerMotion } from "../chapters/layerManifest";

/**
 * The one material every painted plane wears. Ambient life is all in-shader:
 * oscillating UV drift (clouds, mist — needs no tiling), continuous UV scroll
 * (tileable art only), and bottom-anchored vertex sway weighted by uv.y² so
 * foliage tips move while roots stay planted. A soft edge-mix toward the
 * scene fog color keeps card borders atmospheric against the sky.
 */

const VERT = /* glsl */ `
uniform float uTime;
uniform float uSwayAmp;
uniform float uSwayFreq;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;
  float wx = (modelMatrix * vec4(position, 1.0)).x;
  // tips sway, base anchored — uv.y² replaces a paint-mask asset
  pos.x += sin(uTime * uSwayFreq + wx * 0.35) * uSwayAmp * uv.y * uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uTime;
uniform vec2 uDriftAmp;
uniform float uDriftSpeed;
uniform vec2 uScrollDir;
uniform vec3 uFogColor;
uniform float uFogMix;
varying vec2 vUv;

void main() {
  vec2 uv = vUv
    + uDriftAmp * vec2(sin(uTime * uDriftSpeed), cos(uTime * uDriftSpeed * 0.77))
    + uScrollDir * uTime;
  vec4 c = texture2D(uMap, uv);
  float alpha = c.a * uOpacity;
  if (alpha < 0.012) discard;
  // atmospheric edges: ease the painting toward scene fog at the card border
  float edge = smoothstep(0.32, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
  vec3 col = mix(c.rgb, uFogColor, uFogMix * edge);
  gl_FragColor = vec4(col, alpha);
}
`;

export function createPaintedLayerMaterial(layer: BeatLayer): THREE.ShaderMaterial {
  const motion: LayerMotion | undefined = layer.motion;
  const drift = motion?.type === "drift" ? motion : null;
  const scroll = motion?.type === "scroll" ? motion : null;
  const sway = motion?.type === "sway" ? motion : null;

  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: layer.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uMap: { value: null },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uDriftAmp: { value: new THREE.Vector2(...(drift?.amp ?? [0, 0])) },
      uDriftSpeed: { value: drift?.speed ?? 0 },
      uScrollDir: {
        value: new THREE.Vector2(
          (scroll?.dir[0] ?? 0) * (scroll?.speed ?? 0),
          (scroll?.dir[1] ?? 0) * (scroll?.speed ?? 0),
        ),
      },
      uSwayAmp: { value: sway?.amp ?? 0 },
      uSwayFreq: { value: sway?.freq ?? 0 },
      uFogColor: { value: new THREE.Color("#0c0a09") },
      // cutouts and glow layers keep their edges; full-bleed paintings breathe
      // into the fog
      uFogMix: { value: layer.cutout || layer.additive ? 0 : 0.35 },
    },
  });
}
