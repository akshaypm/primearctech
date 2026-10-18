"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { ArcHandle } from "./arc-scene";
import { clearGl, reportGl } from "./v3/gl-slot";

function webglAvailable() {
  try {
    const test = document.createElement("canvas");
    return Boolean(test.getContext("webgl2") || test.getContext("webgl"));
  } catch {
    return false;
  }
}

function holdStill() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  if (nav.connection?.saveData) return true;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return true;
  return !webglAvailable();
}

export function ArcCanvas({ trackRef }: { trackRef: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"booting" | "live" | "still">("booting");

  useEffect(() => {
    let alive = true;
    if (holdStill()) {
      const frame = window.requestAnimationFrame(() => {
        if (alive) setMode("still");
      });
      return () => {
        alive = false;
        window.cancelAnimationFrame(frame);
      };
    }
    const mobileQuery = window.matchMedia("(max-width: 820px)");
    let token = 0;
    let handle: ArcHandle | null = null;
    let boot = 0;

    const readProgress = () => {
      const track = trackRef.current;
      if (!track || !handle) return;
      const rect = track.getBoundingClientRect();
      const next = rect.height <= 1 ? 0 : Math.min(1, Math.max(0, -rect.top / rect.height));
      handle.setProgress(next);
    };

    const release = () => {
      token += 1;
      window.clearTimeout(boot);
      handle?.dispose();
      handle = null;
      if (alive) setMode("still");
    };

    const acquire = () => {
      if (handle) return;
      const mine = ++token;
      if (alive) setMode("booting");
      boot = window.setTimeout(() => {
        const canvas = canvasRef.current;
        if (!alive || mine !== token || !canvas) return;
        void import("./arc-scene")
          .then((mod) => {
            if (!alive || mine !== token || !canvasRef.current) return null;
            return mod.mountArcScene(canvasRef.current, {
              reducedMotion: false,
              mobile: mobileQuery.matches,
              onReady: () => {
                if (alive && mine === token) setMode("live");
              },
            });
          })
          .then((next) => {
            if (!next) return;
            if (!alive || mine !== token) {
              next.dispose();
              return;
            }
            handle = next;
            readProgress();
          })
          .catch(() => {
            if (alive && mine === token) setMode("still");
          });
      }, 48);
    };

    const node = trackRef.current;
    const observer = new IntersectionObserver((entries) => {
      const ratio = entries[0]?.isIntersecting ? entries[0].intersectionRatio : 0;
      reportGl("hero", ratio, { acquire, release });
    }, { threshold: [0, 0.15, 0.3, 0.5, 0.75, 1] });
    if (node) observer.observe(node);

    window.addEventListener("scroll", readProgress, { passive: true });
    window.addEventListener("resize", readProgress);
    return () => {
      alive = false;
      observer.disconnect();
      window.removeEventListener("scroll", readProgress);
      window.removeEventListener("resize", readProgress);
      clearGl("hero");
      release();
    };
  }, [trackRef]);

  return (
    <>
      <Image className={mode === "live" ? "pa-still is-covered" : "pa-still"} src="/arc/arc-still.webp" alt="" fill sizes="100vw" />
      <canvas ref={canvasRef} className={mode === "live" ? "pa-canvas is-ready" : "pa-canvas"} aria-hidden="true" />
    </>
  );
}
