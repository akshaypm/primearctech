"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { ArcHandle } from "./arc-scene";

function webglAvailable() {
  try {
    const test = document.createElement("canvas");
    return Boolean(test.getContext("webgl2") || test.getContext("webgl"));
  } catch {
    return false;
  }
}

export function ArcCanvas({ trackRef }: { trackRef: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"booting" | "live" | "still">("booting");

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 820px)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

    let cancelled = false;
    let handle: ArcHandle | null = null;
    let idleId = 0;
    let usedIdle = false;
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const readProgress = () => {
      const track = trackRef.current;
      if (!track || !handle) return;
      const rect = track.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;
      const next = distance <= 1 ? 0 : Math.min(1, Math.max(0, -rect.top / distance));
      handle.setProgress(next);
    };

    const start = () => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      if (saveData || !webglAvailable()) {
        setMode("still");
        return;
      }
      void import("./arc-scene")
        .then((mod) => {
          if (cancelled || !canvasRef.current) return null;
          return mod.mountArcScene(canvasRef.current, {
            reducedMotion,
            mobile,
            onReady: () => {
              if (!cancelled) setMode("live");
            },
          });
        })
        .then((next) => {
          if (!next) return;
          if (cancelled) {
            next.dispose();
            return;
          }
          handle = next;
          readProgress();
        })
        .catch(() => {
          if (!cancelled) setMode("still");
        });
    };

    if (typeof win.requestIdleCallback === "function") {
      usedIdle = true;
      idleId = win.requestIdleCallback(start, { timeout: 320 });
    } else {
      idleId = window.setTimeout(start, 48);
    }

    window.addEventListener("scroll", readProgress, { passive: true });
    window.addEventListener("resize", readProgress);

    return () => {
      cancelled = true;
      if (usedIdle) win.cancelIdleCallback?.(idleId);
      else window.clearTimeout(idleId);
      window.removeEventListener("scroll", readProgress);
      window.removeEventListener("resize", readProgress);
      handle?.dispose();
    };
  }, [trackRef]);

  return (
    <>
      {mode === "still" ? (
        <Image className="pa-still" src="/arc/arc-still.webp" alt="" fill sizes="100vw" />
      ) : (
        <canvas ref={canvasRef} className={mode === "live" ? "pa-canvas is-ready" : "pa-canvas"} aria-hidden="true" />
      )}
    </>
  );
}
