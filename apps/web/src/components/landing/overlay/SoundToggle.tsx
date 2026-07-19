"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const SRC = "/landing/ambience.mp3";

/**
 * Optional ambient loop. Drop an audio file at apps/web/public/landing/ambience.mp3
 * and this toggle appears; without the file it hides itself entirely.
 * Playback only ever starts from a user gesture, gain ramps softly.
 */
export function SoundToggle() {
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(SRC, { method: "HEAD" })
      .then((res) => {
        const type = res.headers.get("content-type") ?? "";
        if (!cancelled && res.ok && type.startsWith("audio")) setAvailable(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const toggle = async () => {
    if (!audioRef.current) {
      const audio = new Audio(SRC);
      audio.loop = true;
      audio.volume = 0;
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (playing) {
      const fade = setInterval(() => {
        audio.volume = Math.max(0, audio.volume - 0.05);
        if (audio.volume <= 0) {
          audio.pause();
          clearInterval(fade);
        }
      }, 60);
      setPlaying(false);
    } else {
      try {
        await audio.play();
        const fade = setInterval(() => {
          audio.volume = Math.min(0.35, audio.volume + 0.02);
          if (audio.volume >= 0.35) clearInterval(fade);
        }, 60);
        setPlaying(true);
      } catch {
        // autoplay refused — leave silent
      }
    }
  };

  if (!available) return null;
  return (
    <button
      onClick={toggle}
      aria-label={playing ? "Mute ambience" : "Play ambience"}
      className="fixed bottom-6 left-6 z-20 rounded-full border border-neutral-700/60 bg-neutral-950/60 p-3 text-neutral-400 backdrop-blur transition hover:border-amber-500/50 hover:text-amber-300"
    >
      {playing ? <Volume2 size={16} /> : <VolumeX size={16} />}
    </button>
  );
}
