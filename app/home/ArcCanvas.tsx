"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ArcHandle } from "./arc-scene";
import { decideRender, type RenderMode } from "./v3/gates";
import { clearGl, reportGl } from "./v3/gl-slot";
import { setDebug } from "./v3/gl-host";

export function ArcCanvas({ trackRef }: { trackRef: RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<RenderMode>("still");
  const [reason, setReason] = useState("ssr");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setDebug("hero", shown ? mode : "still", shown ? reason : mode === "still" ? reason : "offscreen");
  }, [mode, reason, shown]);

  useEffect(() => {
    let alive = true;
    const decision = decideRender();
    const publish = window.requestAnimationFrame(() => {
      setMode(decision.mode);
      setReason(decision.reason);
    });
    if (decision.mode === "still") {
      return () => {
        alive = false;
        window.cancelAnimationFrame(publish);
      };
    }

    const reducedMotion = decision.mode === "static-3d";
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
      if (alive) setShown(false);
    };

    const acquire = () => {
      if (handle) return;
      const mine = ++token;
      boot = window.setTimeout(() => {
        const canvas = canvasRef.current;
        if (!alive || mine !== token || !canvas) return;
        void import("./arc-scene")
          .then((mod) => {
            if (!alive || mine !== token || !canvasRef.current) return null;
            return mod.mountArcScene(canvasRef.current, {
              reducedMotion,
              mobile: mobileQuery.matches,
              keepClear: () => {
                const track = trackRef.current;
                const headline = track?.querySelector("h1");
                if (!track || !headline) return null;
                const hero = track.getBoundingClientRect();
                const box = headline.getBoundingClientRect();
                return { left: box.left - hero.left, top: box.top - hero.top, right: box.right - hero.left, bottom: box.bottom - hero.top };
              },
              onReady: () => {
                if (alive && mine === token) {
                  setMode(reducedMotion ? "static-3d" : "live");
                  setReason(reducedMotion ? "prefers-reduced-motion" : "webgl");
                  setShown(true);
                }
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
            if (alive && mine === token) {
              setMode("still");
              setReason("webgl-context-failed");
              setShown(false);
              setDebug("hero", "still", "webgl-context-failed");
            }
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
      window.cancelAnimationFrame(publish);
    };
  }, [trackRef]);

  return (
    <>
      <img className={shown ? "pa-still is-covered" : "pa-still"} src="/arc/arc-still.webp" alt="" />
      <canvas ref={canvasRef} className="pa-canvas" data-mode={mode} data-reason={reason} aria-hidden="true" />
    </>
  );
}
