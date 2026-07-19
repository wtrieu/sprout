"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { StaticFallback } from "./StaticFallback";
import { detectTier, type Tier } from "./hooks/quality";

const Experience = dynamic(() => import("./Experience"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 bg-neutral-950" aria-hidden />,
});

type Mode = "pending" | "full" | "static";

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!canvas.getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * Capability gate. Decides BEFORE downloading any 3D chunk:
 * - ?static=1, prefers-reduced-motion, or no WebGL2 → StaticFallback
 * - otherwise → full experience at the detected device tier
 */
export default function LandingExperience() {
  const [mode, setMode] = useState<Mode>("pending");
  const [tier, setTier] = useState<Tier>("high");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (params.get("static") === "1" || reduced || !supportsWebGL2()) {
      setMode("static");
      return;
    }
    setTier(detectTier());
    setMode("full");
  }, []);

  if (mode === "static") return <StaticFallback />;
  if (mode === "pending") return <div className="fixed inset-0 bg-neutral-950" aria-hidden />;
  return <Experience tier={tier} />;
}
