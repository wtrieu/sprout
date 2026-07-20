"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { scrollState } from "../../scroll/scrollState";
import { SEGMENTS } from "../../chapters/chapterConfig";
import { SCENES } from "../../chapters/layerManifest";
import { skyState } from "./SkyLayer";
import { useQuality } from "../../hooks/quality";

/**
 * Ambient video loops for the hero / golden / night skies (cta shares
 * night's). Each loop is a Higgsfield image-to-video pass over the beat's
 * own painted still, so the still IS the loop's poster frame: the sky shows
 * the still instantly, and the moment the loop is confirmed rendering frames
 * it takes over the same plane seamlessly. Fallback chain: any load/play
 * failure (iOS Low-Power, data-saver, missing file) leaves the still in
 * place forever; a missing still falls through to the procedural sky.
 *
 * Loops are fetched only on beat approach (|x − beat| < 1.25), paused and
 * fully released once the journey moves on (> 2 beats away), and never
 * fetched at all on the low tier.
 */

type UnitState = "idle" | "arming" | "playing" | "failed";

type VideoUnit = {
  /** candidate sources, tried in order */
  sources: string[];
  beats: number[];
  state: UnitState;
  video: HTMLVideoElement | null;
  texture: THREE.VideoTexture | null;
  sourceIndex: number;
};

function buildUnits(): VideoUnit[] {
  const byDir = new Map<string, VideoUnit>();
  SCENES.forEach((scene, beat) => {
    const sky = scene.layers.find((l) => l.kind === "sky");
    if (!sky?.video) return;
    const dir = sky.dir ?? scene.dir;
    const unit = byDir.get(dir) ?? {
      sources: [`/landing/scenes/${dir}/${sky.id}.webm`, `/landing/scenes/${dir}/${sky.id}.mp4`],
      beats: [],
      state: "idle" as UnitState,
      video: null,
      texture: null,
      sourceIndex: 0,
    };
    unit.beats.push(beat);
    byDir.set(dir, unit);
  });
  return [...byDir.values()];
}

function release(unit: VideoUnit) {
  for (const b of unit.beats) skyState.video[b] = null;
  unit.texture?.dispose();
  unit.texture = null;
  if (unit.video) {
    unit.video.pause();
    unit.video.removeAttribute("src");
    unit.video.load();
    unit.video = null;
  }
  if (unit.state !== "failed") unit.state = "idle";
}

function arm(unit: VideoUnit) {
  unit.state = "arming";
  unit.sourceIndex = 0;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = "auto";
  unit.video = video;

  const fail = () => {
    // try the next container; out of candidates → the still stays forever
    unit.sourceIndex += 1;
    if (unit.sourceIndex < unit.sources.length) {
      video.src = unit.sources[unit.sourceIndex];
      video.load();
      return;
    }
    unit.state = "failed";
    release(unit);
  };
  video.addEventListener("error", fail);

  video.addEventListener("canplay", () => {
    if (unit.video !== video) return; // released while loading
    video.play().catch(fail);
  });

  // only hand the texture over once frames are actually rendering
  video.addEventListener("timeupdate", function onFrames() {
    video.removeEventListener("timeupdate", onFrames);
    if (unit.video !== video || video.currentTime <= 0) return;
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    unit.texture = tex;
    unit.state = "playing";
    for (const b of unit.beats) skyState.video[b] = tex;
  });

  video.src = unit.sources[0];
  video.load();
}

export function VideoLayer() {
  const { tier } = useQuality();
  const units = useMemo(buildUnits, []);

  useEffect(() => {
    const onVisibility = () => {
      for (const unit of units) {
        if (unit.state !== "playing" || !unit.video) continue;
        if (document.hidden) unit.video.pause();
        else void unit.video.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      units.forEach(release);
    };
  }, [units]);

  useFrame(() => {
    if (tier === "low") return;
    const x = THREE.MathUtils.clamp(scrollState.progress, 0, 1) * SEGMENTS;
    for (const unit of units) {
      const d = Math.min(...unit.beats.map((b) => Math.abs(x - b)));
      if (d < 1.25 && unit.state === "idle") arm(unit);
      else if (d > 2 && (unit.state === "arming" || unit.state === "playing")) release(unit);
    }
  });

  return null;
}
