"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../scroll/scrollState";
import { SEGMENTS } from "../chapters/chapterConfig";

/**
 * Visibility-culls a chapter's whole subtree when the journey is far away —
 * hidden groups skip traversal and draw calls entirely.
 */
export function ChapterGroup({
  beat,
  span = 1.7,
  children,
}: {
  beat: number;
  span?: number;
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
