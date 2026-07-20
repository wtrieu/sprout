import * as THREE from "three";

export type ParticleShape = "round" | "streak" | "leaf" | "petal";

const SHAPE_ID: Record<ParticleShape, number> = {
  round: 0,
  streak: 1,
  leaf: 2,
  petal: 3,
};

export type ParticleMaterialOptions = {
  color: string;
  color2?: string;
  /** base point size (world-ish px, perspective attenuated) */
  size: number;
  opacity?: number;
  shape?: ParticleShape;
  additive?: boolean;
  /** 0..1 — how strongly particles pulse on/off (fireflies/stars) */
  twinkle?: number;
  /** sin-drift amplitude per axis */
  driftAmp?: [number, number, number];
  driftFreq?: number;
  /** falling speed; wraps vertically within wrapY */
  fallSpeed?: number;
  wrapY?: [number, number];
  /** px of extra y-offset per unit of scroll velocity (subtle streaking) */
  velocityDrag?: number;
  /** distance at which particles are fully faded out */
  fadeFar?: number;
};

const VERT = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uFall;
uniform vec2 uWrapY;
uniform float uTwinkle;
uniform float uVelocity;
uniform float uVelocityDrag;
uniform float uGrow;
uniform vec3 uDriftAmp;
uniform float uDriftFreq;
attribute vec4 aSeed;
varying float vTwinkle;
varying float vMix;
varying float vDist;

void main() {
  vec3 pos = position;
  float t = uTime;
  pos += uDriftAmp * vec3(
    sin(t * uDriftFreq * (0.5 + aSeed.x) + aSeed.y * 6.2832),
    sin(t * uDriftFreq * (0.4 + aSeed.y) + aSeed.z * 6.2832),
    sin(t * uDriftFreq * (0.6 + aSeed.z) + aSeed.w * 6.2832)
  );
  if (uFall > 0.0) {
    float h = uWrapY.y - uWrapY.x;
    pos.y = uWrapY.x + mod(position.y - uWrapY.x - t * uFall * (0.7 + 0.6 * aSeed.x), h);
  }
  pos.y += uVelocity * uVelocityDrag * (0.5 + aSeed.y);

  // staggered scale-in with chapter progress (uGrow = 1 when disabled)
  float sc = smoothstep(aSeed.z * 0.7, aSeed.z * 0.7 + 0.25, uGrow);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + 0.8 * aSeed.w) * sc * uPixelRatio * (8.0 / max(0.001, -mv.z));

  float tw = 0.5 + 0.5 * sin(t * (0.8 + 2.2 * aSeed.x) * 1.6 + aSeed.w * 6.2832);
  vTwinkle = mix(1.0, pow(tw, 3.0), uTwinkle);
  vMix = aSeed.w;
  vDist = -mv.z;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uOpacity;
uniform float uFadeFar;
uniform int uShape;
varying float vTwinkle;
varying float vMix;
varying float vDist;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a;
  if (uShape == 1) {
    // rain streak: thin vertical line, soft ends
    a = smoothstep(0.09, 0.0, abs(p.x)) * smoothstep(0.5, 0.15, abs(p.y));
  } else if (uShape == 2) {
    // leaf: soft diamond
    float d = abs(p.x) * 1.4 + abs(p.y);
    a = smoothstep(0.5, 0.18, d);
  } else if (uShape == 3) {
    // petal: soft ellipse
    a = smoothstep(0.5, 0.12, length(p * vec2(1.0, 1.55)));
  } else {
    a = pow(smoothstep(0.5, 0.0, length(p)), 1.8);
  }
  float fade = smoothstep(uFadeFar, uFadeFar * 0.45, vDist);
  float alpha = a * uOpacity * vTwinkle * fade;
  if (alpha < 0.012) discard;
  vec3 col = mix(uColor, uColor2, vMix);
  gl_FragColor = vec4(col, alpha);
}
`;

export function createParticleMaterial(opts: ParticleMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: opts.size },
      uPixelRatio: { value: 1 },
      uFall: { value: opts.fallSpeed ?? 0 },
      uWrapY: { value: new THREE.Vector2(...(opts.wrapY ?? [0, 1])) },
      uTwinkle: { value: opts.twinkle ?? 0 },
      uVelocity: { value: 0 },
      uVelocityDrag: { value: opts.velocityDrag ?? 0 },
      uGrow: { value: 1 },
      uDriftAmp: { value: new THREE.Vector3(...(opts.driftAmp ?? [0.15, 0.1, 0.15])) },
      uDriftFreq: { value: opts.driftFreq ?? 0.5 },
      uColor: { value: new THREE.Color(opts.color) },
      uColor2: { value: new THREE.Color(opts.color2 ?? opts.color) },
      uOpacity: { value: opts.opacity ?? 1 },
      uFadeFar: { value: opts.fadeFar ?? 34 },
      uShape: { value: SHAPE_ID[opts.shape ?? "round"] },
    },
  });
}
