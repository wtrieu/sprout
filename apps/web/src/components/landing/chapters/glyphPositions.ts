import * as THREE from "three";

/**
 * Points tracing a sprouting seed — the whole story drawn in stars:
 * seed shell below, stem rising, two young leaves unfurling. Blooms as a
 * constellation over the night canopy for the finale.
 */
export function makeGlyphPositions(center: THREE.Vector3, size: number): Float32Array {
  const pts: number[] = [];
  const push = (v: THREE.Vector3, jitter = 0.045) => {
    pts.push(
      center.x + v.x * size + (Math.random() - 0.5) * jitter * size,
      center.y + v.y * size + (Math.random() - 0.5) * jitter * size,
      center.z + (Math.random() - 0.5) * 0.15,
    );
  };
  const sample = (curve: THREE.Curve<THREE.Vector3>, n: number) => {
    for (const p of curve.getPoints(n)) push(p);
  };
  const v = (x: number, y: number) => new THREE.Vector3(x, y, 0);

  // the seed: a plump teardrop shell, cracked open at the top
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 1.72 + Math.PI * 0.63;
    pts.push(
      center.x + Math.cos(a) * 0.3 * size,
      center.y + (Math.sin(a) * 0.38 - 0.85) * size,
      center.z + (Math.random() - 0.5) * 0.12,
    );
  }
  // the stem: one hopeful curve out of the crack
  sample(new THREE.QuadraticBezierCurve3(v(0, -0.52), v(0.14, 0.05), v(0.02, 0.55)), 13);
  // left leaf, the bigger one
  sample(new THREE.QuadraticBezierCurve3(v(0.0, 0.3), v(-0.55, 0.42), v(-0.62, 0.86)), 9);
  sample(new THREE.QuadraticBezierCurve3(v(-0.62, 0.86), v(-0.22, 0.78), v(0.02, 0.55)), 9);
  // right leaf, the younger one
  sample(new THREE.QuadraticBezierCurve3(v(0.02, 0.55), v(0.45, 0.62), v(0.5, 0.95)), 8);
  sample(new THREE.QuadraticBezierCurve3(v(0.5, 0.95), v(0.18, 0.9), v(0.02, 0.72)), 8);
  // a little starlight caught inside the seed
  for (let i = 0; i < 6; i++) {
    push(v((Math.random() - 0.5) * 0.3, -0.85 + (Math.random() - 0.5) * 0.35), 0.02);
  }
  return new Float32Array(pts);
}
