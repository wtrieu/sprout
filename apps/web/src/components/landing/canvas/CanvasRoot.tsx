"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { QualityContext, QUALITY_PRESETS, type Quality } from "../hooks/quality";
import { CameraRig } from "./CameraRig";
import { SceneAtmosphere } from "./SceneAtmosphere";
import { Effects } from "../post/Effects";

/**
 * Pinned-beat dev mode renders on a timer instead of rAF so stills render
 * even in hidden/backgrounded tabs (rAF is suspended there).
 */
function ManualLoop() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    advance(performance.now() / 1000);
    const id = setInterval(() => advance(performance.now() / 1000), 200);
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__advanceR3F = advance;
    }
    return () => {
      clearInterval(id);
      if (process.env.NODE_ENV !== "production") {
        delete (window as unknown as Record<string, unknown>).__advanceR3F;
      }
    };
  }, [advance]);
  return null;
}

/**
 * The single persistent WebGL canvas, fixed behind the scrolling overlay.
 * Quality context is provided INSIDE the canvas (R3F is a separate React
 * root, so outside context wouldn't cross the boundary reliably).
 */
export function CanvasRoot({
  quality: initialQuality,
  manualLoop = false,
  children,
}: {
  quality: Quality;
  manualLoop?: boolean;
  children: React.ReactNode;
}) {
  const [quality, setQuality] = useState(initialQuality);

  return (
    <div className="fixed inset-0 z-0" aria-hidden>
      <Canvas
        gl={{ antialias: true, powerPreference: "high-performance" }}
        dpr={quality.dpr}
        frameloop={manualLoop ? "never" : "always"}
        camera={{ fov: 45, near: 0.1, far: 160, position: [0, -15.5, 5.5] }}
        onCreated={({ gl }) => {
          gl.setClearColor("#0c0a09");
        }}
      >
        <QualityContext.Provider value={quality}>
          {manualLoop ? (
            <>
              <ManualLoop />
              <Suspense fallback={null}>
                <CameraRig />
                <SceneAtmosphere />
                {children}
                {quality.post && <Effects />}
              </Suspense>
            </>
          ) : (
            <>
              <PerformanceMonitor
                onDecline={() =>
                  setQuality((q) =>
                    q.tier === "high" ? QUALITY_PRESETS.mid : QUALITY_PRESETS.low,
                  )
                }
              >
                <Suspense fallback={null}>
                  <CameraRig />
                  <SceneAtmosphere />
                  {children}
                  {quality.post && <Effects />}
                </Suspense>
              </PerformanceMonitor>
              <AdaptiveDpr />
            </>
          )}
        </QualityContext.Provider>
      </Canvas>
    </div>
  );
}
