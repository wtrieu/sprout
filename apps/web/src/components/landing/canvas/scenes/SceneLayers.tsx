"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../../scroll/scrollState";
import { SEGMENTS } from "../../chapters/chapterConfig";
import { SCENES, type ParticleRecipe } from "../../chapters/layerManifest";
import { ParticleField } from "../../particles/ParticleField";

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

/**
 * The paper theater: every beat's particle weather (and, as art lands,
 * painted card layers) rendered from the layer manifest. Skies live in
 * SkyLayer; this owns everything staged inside the world.
 */
export function SceneLayers() {
  return (
    <>
      {SCENES.map((scene, beat) =>
        scene.particles.map((recipe) => (
          <BeatGroup key={`${scene.beatId}/${recipe.id}`} beat={beat} span={recipe.span ?? 1.8}>
            <RecipeField recipe={recipe} />
          </BeatGroup>
        )),
      )}
    </>
  );
}
