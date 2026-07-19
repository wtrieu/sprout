"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ChapterGroup } from "../canvas/ChapterGroup";
import { ParticleField } from "../particles/ParticleField";
import { localProgress } from "./chapterConfig";
import { scrollState } from "../scroll/scrollState";

type Segment = { start: THREE.Vector3; end: THREE.Vector3; radius: number };

/** L-system-lite: recursive branch segments + tip points for leaf clusters. */
function generateSapling(): { segments: Segment[]; tips: THREE.Vector3[] } {
  const segments: Segment[] = [];
  const tips: THREE.Vector3[] = [];

  function branch(start: THREE.Vector3, dir: THREE.Vector3, len: number, radius: number, depth: number) {
    const end = start.clone().addScaledVector(dir, len);
    segments.push({ start, end, radius });
    if (depth >= 4 || len < 0.35) {
      tips.push(end);
      return;
    }
    const children = depth === 0 ? 3 : 2;
    for (let i = 0; i < children; i++) {
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4 + 0.1, Math.random() - 0.5).normalize();
      const newDir = dir
        .clone()
        .applyAxisAngle(axis, 0.5 + Math.random() * 0.5)
        .lerp(new THREE.Vector3(0, 1, 0), 0.18)
        .normalize();
      branch(end, newDir, len * (0.62 + Math.random() * 0.14), radius * 0.6, depth + 1);
    }
  }

  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 2.6, 0.16, 0);
  return { segments, tips };
}

/** Ch 4 — growing wild: a young sapling, wind-tossed leaves, drifting pollen. */
export function Chapter4Sapling() {
  const { segments, tips } = useMemo(() => generateSapling(), []);

  const branchGeometry = useMemo(() => new THREE.CylinderGeometry(0.7, 1, 1, 6), []);
  const branchMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#4a3524", roughness: 0.9 }),
    [],
  );

  const leafPositions = useMemo(() => {
    const perTip = 14;
    const arr = new Float32Array(tips.length * perTip * 3);
    let k = 0;
    for (const tip of tips) {
      for (let i = 0; i < perTip; i++) {
        arr[k++] = tip.x + (Math.random() - 0.5) * 1.1;
        arr[k++] = tip.y + (Math.random() - 0.3) * 0.9;
        arr[k++] = tip.z + (Math.random() - 0.5) * 1.1;
      }
    }
    return arr;
  }, [tips]);

  const instRef = useRef<THREE.InstancedMesh>(null);
  const growRef = useRef(-1);

  useEffect(() => {
    return () => {
      branchGeometry.dispose();
      branchMaterial.dispose();
    };
  }, [branchGeometry, branchMaterial]);

  useFrame(() => {
    const mesh = instRef.current;
    if (!mesh) return;
    const grow = THREE.MathUtils.smoothstep(localProgress(scrollState.progress, 4), 0.1, 0.8);
    if (Math.abs(grow - growRef.current) < 0.002) return;
    growRef.current = grow;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const totalH = 5.2; // approx sapling height for stagger
    segments.forEach((seg, i) => {
      // lower segments appear first as the tree grows
      const activation = THREE.MathUtils.clamp(
        (grow * (totalH + 2) - seg.start.y) / 1.2,
        0,
        1,
      );
      dir.subVectors(seg.end, seg.start);
      const len = dir.length() * activation;
      mid.copy(seg.start).addScaledVector(dir.normalize(), len / 2);
      q.setFromUnitVectors(up, dir);
      scale.set(seg.radius * activation, Math.max(0.0001, len), seg.radius * activation);
      m.compose(mid, q, scale);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <ChapterGroup beat={4} span={1.8}>
      <instancedMesh
        ref={instRef}
        args={[branchGeometry, branchMaterial, segments.length]}
        frustumCulled={false}
      />
      {/* leaves — one draw call of wind-fluttered sprites at the branch tips */}
      <ParticleField
        count={tips.length * 14}
        positions={leafPositions}
        color="#4ade80"
        color2="#166534"
        size={9}
        opacity={0.92}
        shape="leaf"
        driftAmp={[0.14, 0.08, 0.12]}
        driftFreq={1.1}
        growBeat={4}
        fadeFar={30}
      />
      {/* pollen drifting in the light shafts */}
      <ParticleField
        count={1100}
        center={[0, 4.5, 0]}
        box={[14, 9, 10]}
        color="#fde68a"
        color2="#34d399"
        size={2}
        opacity={0.45}
        additive
        twinkle={0.5}
        driftAmp={[0.45, 0.3, 0.4]}
        driftFreq={0.35}
        growBeat={4}
        fadeFar={28}
      />
    </ChapterGroup>
  );
}
