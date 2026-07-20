"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../../scroll/scrollState";
import { SEGMENTS } from "../../chapters/chapterConfig";
import { SCENES, type ParticleRecipe } from "../../chapters/layerManifest";
import { ParticleField } from "../../particles/ParticleField";
import { LayerCard } from "./LayerCard";
import { disposePool, sweepPool } from "./useSceneTextures";
import { useQuality } from "../../hooks/quality";

/**
 * Visibility-culls a subtree when the journey is far from its beat —
 * hidden groups skip traversal and draw calls entirely.
 */
function BeatGroup({
  beat,
  span,
  children,
}: {
  beat: number;
  span: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = Math.abs(scrollState.progress * SEGMENTS - beat) < span;
  });
  return <group ref={ref}>{children}</group>;
}

function RecipeField({ recipe }: { recipe: ParticleRecipe }) {
  const { id: _id, span: _span, positions, ...props } = recipe;
  const built = useMemo(() => positions?.(), [positions]);
  return <ParticleField {...props} positions={built} />;
}

/** Once a second: release card textures whose beat has left the window. */
function PoolSweeper() {
  const { tier } = useQuality();
  const nextSweep = useRef(0);
  useFrame((state) => {
    if (state.clock.elapsedTime < nextSweep.current) return;
    nextSweep.current = state.clock.elapsedTime + 1;
    sweepPool(THREE.MathUtils.clamp(scrollState.progress, 0, 1) * SEGMENTS, tier);
  });
  useEffect(() => () => disposePool(), []);
  return null;
}

/**
 * The paper theater: every beat's painted card layers and particle weather,
 * rendered from the layer manifest. Skies live in SkyLayer; this owns
 * everything staged inside the world.
 */
export function SceneLayers() {
  return (
    <>
      <PoolSweeper />
      {SCENES.map((scene, beat) => (
        <group key={scene.beatId}>
          {scene.layers
            .filter((l) => l.kind === "card")
            .map((layer, idx) => (
              <LayerCard
                key={layer.id}
                scene={scene}
                layer={layer}
                beat={beat}
                renderOrder={idx}
              />
            ))}
          {scene.particles.map((recipe) => (
            <BeatGroup key={recipe.id} beat={beat} span={recipe.span ?? 1.8}>
              <RecipeField recipe={recipe} />
            </BeatGroup>
          ))}
        </group>
      ))}
    </>
  );
}
