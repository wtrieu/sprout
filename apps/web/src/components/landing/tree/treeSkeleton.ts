import * as THREE from "three";
import { mulberry32, rangeFrom } from "../lib/rng";

export type TreeSegment = {
  points: THREE.Vector3[];
  r0: number;
  r1: number;
  /** 0..1 window within the tree's total growth when this segment extends */
  birth0: number;
  birth1: number;
  depth: number;
  isRoot: boolean;
};

export type LeafAnchor = {
  position: THREE.Vector3;
  /** growth time at which this leaf pops */
  birth: number;
  scale: number;
};

export type TreeSkeleton = {
  segments: TreeSegment[];
  leaves: LeafAnchor[];
  blossoms: LeafAnchor[];
  /** high outer-branch tips — lantern hanging points */
  lanternAnchors: THREE.Vector3[];
  /** a sturdy horizontal-ish branch point for the swing */
  swingAnchor: THREE.Vector3 | null;
};

/**
 * One continuous organism, grown from a fixed seed: roots reach down from the
 * collar, the trunk rises from the same point, branches taper out of their
 * parents with matching radii. `birth` orders growth (roots → trunk → limbs →
 * twigs) so a single 0..1 scalar grows the whole tree in the shader.
 */
export function generateTreeSkeleton(seed = 7): TreeSkeleton {
  const rand = mulberry32(seed);
  const segments: TreeSegment[] = [];
  const leaves: LeafAnchor[] = [];
  const blossoms: LeafAnchor[] = [];
  const lanternAnchors: THREE.Vector3[] = [];
  let swingAnchor: THREE.Vector3 | null = null;
  let bestSwingScore = -1;

  const COLLAR_RADIUS = 0.42;

  // ---- roots: birth 0 → 0.22, fanning down from the collar ----
  const rootCount = 9;
  for (let r = 0; r < rootCount; r++) {
    const angle = (r / rootCount) * Math.PI * 2 + rangeFrom(rand, -0.25, 0.25);
    const spread = rangeFrom(rand, 2.2, 5);
    const depthY = rangeFrom(rand, -9, -14.5);
    const pts: THREE.Vector3[] = [];
    const steps = 5;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const flare = Math.pow(t, 0.7);
      pts.push(
        new THREE.Vector3(
          Math.cos(angle) * spread * flare + rangeFrom(rand, -0.4, 0.4) * t,
          -0.15 + depthY * Math.pow(t, 1.25),
          Math.sin(angle) * spread * flare + rangeFrom(rand, -0.4, 0.4) * t,
        ),
      );
    }
    segments.push({
      points: pts,
      r0: COLLAR_RADIUS * rangeFrom(rand, 0.5, 0.7),
      r1: 0.015,
      birth0: 0.0,
      birth1: rangeFrom(rand, 0.16, 0.22),
      depth: 0,
      isRoot: true,
    });
  }

  // ---- trunk + branches: recursive, radius-continuous ----
  type BranchJob = {
    start: THREE.Vector3;
    dir: THREE.Vector3;
    length: number;
    radius: number;
    depth: number;
    birth: number;
  };

  const branchOut = (job: BranchJob) => {
    const { start, dir, length, radius, depth, birth } = job;
    // sample a gently curving path for this limb
    const pts: THREE.Vector3[] = [start.clone()];
    const cur = start.clone();
    const heading = dir.clone();
    const steps = depth === 0 ? 6 : 4;
    for (let s = 1; s <= steps; s++) {
      heading
        .add(
          new THREE.Vector3(
            rangeFrom(rand, -0.16, 0.16),
            depth === 0 ? 0.06 : rangeFrom(rand, -0.02, 0.1),
            rangeFrom(rand, -0.16, 0.16),
          ),
        )
        .normalize();
      cur.addScaledVector(heading, length / steps);
      pts.push(cur.clone());
    }

    const tipRadius = depth >= 3 ? 0.012 : radius * rangeFrom(rand, 0.42, 0.55);
    const birthSpan = depth === 0 ? 0.14 : 0.11 - depth * 0.015;
    const birth1 = Math.min(1, birth + birthSpan);
    segments.push({
      points: pts,
      r0: radius,
      r1: tipRadius,
      birth0: birth,
      birth1,
      depth,
      isRoot: false,
    });

    const tip = pts[pts.length - 1];

    if (depth >= 3 || length < 1.1) {
      // twig tip: sprout foliage
      const leafCount = 7;
      for (let i = 0; i < leafCount; i++) {
        leaves.push({
          position: new THREE.Vector3(
            tip.x + rangeFrom(rand, -0.9, 0.9),
            tip.y + rangeFrom(rand, -0.5, 0.8),
            tip.z + rangeFrom(rand, -0.9, 0.9),
          ),
          birth: Math.min(1, birth1 + rangeFrom(rand, 0, 0.08)),
          scale: rangeFrom(rand, 0.7, 1.25),
        });
      }
      for (let i = 0; i < 4; i++) {
        blossoms.push({
          position: new THREE.Vector3(
            tip.x + rangeFrom(rand, -0.8, 0.8),
            tip.y + rangeFrom(rand, -0.4, 0.7),
            tip.z + rangeFrom(rand, -0.8, 0.8),
          ),
          birth: Math.min(1, birth1 + rangeFrom(rand, 0.16, 0.34)),
          scale: rangeFrom(rand, 0.7, 1.2),
        });
      }
      const farFromOthers = lanternAnchors.every((a) => a.distanceTo(tip) > 2.1);
      if (
        tip.y > 8.5 &&
        Math.hypot(tip.x, tip.z) > 1.2 &&
        lanternAnchors.length < 6 &&
        farFromOthers &&
        rand() > 0.25
      ) {
        lanternAnchors.push(tip.clone());
      }
      return;
    }

    // children fork from the tip, sharing its radius
    const children = depth === 0 ? 3 : rand() > 0.3 ? 3 : 2;
    for (let c = 0; c < children; c++) {
      const spin = (c / children) * Math.PI * 2 + rangeFrom(rand, 0, 1.5);
      const tilt = depth === 0 ? rangeFrom(rand, 0.55, 0.95) : rangeFrom(rand, 0.35, 0.8);
      const childDir = heading
        .clone()
        .applyAxisAngle(
          new THREE.Vector3(Math.cos(spin), 0, Math.sin(spin)).normalize(),
          tilt,
        )
        .lerp(new THREE.Vector3(0, 1, 0), 0.22)
        .normalize();
      branchOut({
        start: tip.clone(),
        dir: childDir,
        length: length * rangeFrom(rand, 0.55, 0.7),
        radius: tipRadius,
        depth: depth + 1,
        birth: birth1 - 0.02,
      });
    }

    // remember a good swing branch: roughly horizontal, low enough to reach
    if (depth >= 1) {
      const flatness = 1 - Math.abs(heading.y);
      const mid = pts[Math.floor(pts.length / 2)];
      const score = flatness * 2 + (mid.y > 3.2 && mid.y < 5.5 ? 2 : 0) - depth * 0.3;
      if (score > bestSwingScore && mid.y > 2.8 && mid.y < 6) {
        bestSwingScore = score;
        swingAnchor = mid.clone();
      }
    }
  };

  // trunk in two stories: lower bole (birth 0.2 → 0.34), then the upper
  // trunk continues while two low limbs lean out from the first fork —
  // the silhouette branches low, like a climbing tree should
  const boleTop = new THREE.Vector3(0.12, 3.0, -0.06);
  segments.push({
    points: [
      new THREE.Vector3(0, -0.3, 0),
      new THREE.Vector3(0.05, 1, 0.02),
      new THREE.Vector3(0.14, 2.1, -0.03),
      boleTop,
    ],
    r0: COLLAR_RADIUS,
    r1: 0.3,
    birth0: 0.2,
    birth1: 0.34,
    depth: 0,
    isRoot: false,
  });
  // two low limbs from the first fork — swing height
  for (const side of [1, -1]) {
    const dir = new THREE.Vector3(side, 0.75, rangeFrom(rand, -0.5, 0.5)).normalize();
    branchOut({
      start: boleTop.clone(),
      dir,
      length: rangeFrom(rand, 2.4, 3),
      radius: 0.15,
      depth: 1,
      birth: 0.33,
    });
  }
  // upper trunk carries on to the crown
  branchOut({
    start: boleTop.clone(),
    dir: new THREE.Vector3(-0.06, 1, 0.04).normalize(),
    length: 4.4,
    radius: 0.28,
    depth: 0,
    birth: 0.34,
  });

  return { segments, leaves, blossoms, lanternAnchors, swingAnchor };
}
