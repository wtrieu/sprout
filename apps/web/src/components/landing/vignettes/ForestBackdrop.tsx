"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mulberry32, rangeFrom } from "../lib/rng";

type TreeSpec = {
  pos: THREE.Vector3;
  trunkH: number;
  canopyR: number;
  color: string;
  tall: boolean;
};

/**
 * A storybook treeline behind the meadow — plump canopies in spring greens
 * with the odd sakura-pink and honey-gold crown, softened by the fog into
 * a painted background.
 */
export function ForestBackdrop() {
  const trees: TreeSpec[] = useMemo(() => {
    const rand = mulberry32(777);
    const palette = ["#4f9d4a", "#5fae52", "#3f8f5c", "#f4a9c4", "#6fbf6a", "#e8c46a", "#54a468"];
    const out: TreeSpec[] = [];
    // two arcs: mid-distance and far, leaving the front of frame open
    const rings: Array<[number, number, number]> = [
      [16, 24, 8],
      [26, 38, 10],
    ];
    let k = 0;
    for (const [rMin, rMax, n] of rings) {
      for (let i = 0; i < n; i++) {
        // bias to the back and sides; keep the camera's low-front clear
        const a = rangeFrom(rand, Math.PI * 0.55, Math.PI * 2.45);
        const r = rangeFrom(rand, rMin, rMax);
        out.push({
          pos: new THREE.Vector3(Math.sin(a) * r, 0, -Math.cos(a) * r),
          trunkH: rangeFrom(rand, 1.6, 3.2),
          canopyR: rangeFrom(rand, 1.4, 2.8),
          color: palette[k++ % palette.length],
          tall: rand() > 0.6,
        });
      }
    }
    return out;
  }, []);

  const trunkMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#5a4030", roughness: 1 }),
    [],
  );
  const canopyMaterials = useMemo(
    () =>
      new Map(
        trees.map((t) => [
          t.color,
          new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.9, flatShading: false }),
        ]),
      ),
    [trees],
  );

  useEffect(
    () => () => {
      trunkMaterial.dispose();
      canopyMaterials.forEach((m) => m.dispose());
    },
    [trunkMaterial, canopyMaterials],
  );

  return (
    <>
      {trees.map((t, i) => {
        const mat = canopyMaterials.get(t.color)!;
        return (
          <group key={i} position={t.pos}>
            <mesh material={trunkMaterial} position={[0, t.trunkH / 2, 0]}>
              <cylinderGeometry args={[0.14, 0.22, t.trunkH, 7]} />
            </mesh>
            {t.tall ? (
              // stacked cones — a young cypress-ish storybook tree
              <>
                <mesh material={mat} position={[0, t.trunkH + t.canopyR * 0.7, 0]}>
                  <coneGeometry args={[t.canopyR, t.canopyR * 1.8, 9]} />
                </mesh>
                <mesh material={mat} position={[0, t.trunkH + t.canopyR * 1.8, 0]}>
                  <coneGeometry args={[t.canopyR * 0.7, t.canopyR * 1.4, 9]} />
                </mesh>
              </>
            ) : (
              // plump cloud-canopy
              <>
                <mesh material={mat} position={[0, t.trunkH + t.canopyR * 0.6, 0]}>
                  <sphereGeometry args={[t.canopyR, 12, 10]} />
                </mesh>
                <mesh
                  material={mat}
                  position={[t.canopyR * 0.55, t.trunkH + t.canopyR * 0.3, 0.2]}
                >
                  <sphereGeometry args={[t.canopyR * 0.62, 10, 8]} />
                </mesh>
                <mesh
                  material={mat}
                  position={[-t.canopyR * 0.5, t.trunkH + t.canopyR * 0.45, -0.2]}
                >
                  <sphereGeometry args={[t.canopyR * 0.55, 10, 8]} />
                </mesh>
              </>
            )}
          </group>
        );
      })}
    </>
  );
}
