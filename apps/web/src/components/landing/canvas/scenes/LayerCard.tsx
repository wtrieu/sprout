"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../../scroll/scrollState";
import { SEGMENTS } from "../../chapters/chapterConfig";
import {
  layerSources,
  type BeatLayer,
  type BeatScene,
} from "../../chapters/layerManifest";
import { createPaintedLayerMaterial } from "../../materials/paintedLayerMaterial";
import { placeLayer } from "./layerPlacement";
import { decodeWidthForTier, ensureEntry } from "./useSceneTextures";
import { useQuality, type Tier } from "../../hooks/quality";

const TIER_RANK: Record<Tier, number> = { low: 0, mid: 1, high: 2 };

/**
 * One painted card in a beat's diorama: a world-anchored plane staged on the
 * beat's view axis, fading in on approach and out on departure. The file is
 * optional — until (unless) it loads, the card simply never becomes visible.
 */
export function LayerCard({
  scene,
  layer,
  beat,
  renderOrder,
}: {
  scene: BeatScene;
  layer: BeatLayer;
  beat: number;
  renderOrder: number;
}) {
  const quality = useQuality();
  const meshRef = useRef<THREE.Mesh>(null);

  const placement = useMemo(() => placeLayer(beat, layer), [beat, layer]);
  const material = useMemo(() => createPaintedLayerMaterial(layer), [layer]);
  const urls = useMemo(() => layerSources(scene, layer), [scene, layer]);
  useEffect(() => () => material.dispose(), [material]);

  const enabled = TIER_RANK[quality.tier] >= TIER_RANK[layer.minTier ?? "low"];

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!enabled) {
      mesh.visible = false;
      return;
    }
    const x = THREE.MathUtils.clamp(scrollState.progress, 0, 1) * SEGMENTS;
    const d = x - beat;

    // residency window: request the texture as the journey approaches
    let texture: THREE.Texture | null = null;
    if (d > -2.25 && d < 2.25) {
      const entry = ensureEntry(urls[0], urls, beat, decodeWidthForTier(quality.tier));
      texture = entry.status === "ready" ? entry.texture : null;
    }

    // diorama fade: in on approach, out on departure — between stations the
    // cards rest so transit views can't catch one edge-on
    const fade =
      THREE.MathUtils.smoothstep(d, -0.55, -0.2) * (1 - THREE.MathUtils.smoothstep(d, 0.2, 0.55));

    if (!texture || fade <= 0.001) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    const u = material.uniforms;
    if (u.uMap.value !== texture) {
      if (layer.motion?.type === "scroll") {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
      }
      u.uMap.value = texture;
      const img = texture.image as { width?: number; height?: number } | undefined;
      const aspect = img?.width && img?.height ? img.width / img.height : 21 / 9;
      mesh.scale.set(placement.height * aspect, placement.height, 1);
    }
    u.uTime.value = state.clock.elapsedTime;
    u.uOpacity.value = fade * (layer.opacity ?? 1);
    const fog = state.scene.fog;
    if (fog) (u.uFogColor.value as THREE.Color).copy(fog.color);
  });

  return (
    <mesh
      ref={meshRef}
      material={material}
      position={placement.position}
      quaternion={placement.quaternion}
      renderOrder={renderOrder}
      frustumCulled={false}
      visible={false}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
