"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Anchor, SceneHandle, SceneOptions } from "./types";
import { decideRender, type RenderMode } from "./gates";
import { clearGl, reportGl } from "./gl-slot";
import { setDebug } from "./gl-host";

export type SceneName = "demo" | "engagements" | "how" | "proof" | "products" | "partners" | "fit" | "book";

type Mount = (canvas: HTMLCanvasElement, options: SceneOptions) => Promise<SceneHandle>;

const loaders: Record<SceneName, () => Promise<Mount>> = {
  demo: () => import("./demo").then((mod) => mod.mountDemo),
  engagements: () => import("./engagements").then((mod) => mod.mountEngagements),
  how: () => import("./how").then((mod) => mod.mountHow),
  proof: () => import("./proof").then((mod) => mod.mountProof),
  products: () => import("./products").then((mod) => mod.mountProducts),
  partners: () => import("./partners").then((mod) => mod.mountPartners),
  fit: () => import("./fit").then((mod) => mod.mountFit),
  book: () => import("./book").then((mod) => mod.mountBook),
};

function scrubProgress(section: HTMLElement, center: number) {
  const rect = section.getBoundingClientRect();
  const delta = rect.top + rect.height / 2 - window.innerHeight / 2;
  const travel = rect.height * 0.55 + window.innerHeight * 0.25;
  return Math.min(1, Math.max(0, center - delta / (travel * 2)));
}

export function Stage({
  id,
  scene,
  fallback,
  mobileHeight,
  scrubCenter,
  onProgress,
  onHandle,
  children,
}: {
  id: string;
  scene: SceneName;
  fallback: string;
  mobileHeight: number;
  scrubCenter?: number;
  onProgress?: (value: number) => void;
  onHandle?: (handle: SceneHandle | null) => void;
  children?: (anchors: Anchor[]) => ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<RenderMode>("still");
  const [reason, setReason] = useState("ssr");
  const [shown, setShown] = useState(false);
  const [broken, setBroken] = useState(false);
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const progressRef = useRef(onProgress);
  const handleCb = useRef(onHandle);

  useEffect(() => {
    progressRef.current = onProgress;
    handleCb.current = onHandle;
  });

  useEffect(() => {
    const node = frameRef.current;
    const canvas = canvasRef.current;
    const decision = decideRender();
    setDebug(id, decision.mode === "still" ? "still" : "loading", decision.reason);
    const publish = window.requestAnimationFrame(() => {
      setMode(decision.mode);
      setReason(decision.reason);
    });
    if (!node || !canvas || decision.mode === "still") {
      return () => window.cancelAnimationFrame(publish);
    }

    const reducedMotion = decision.mode === "static-3d";
    let alive = true;
    let token = 0;
    let handle: SceneHandle | null = null;

    const read = () => {
      if (!handle) return;
      const section = node.closest("section");
      const mobile = window.matchMedia("(max-width: 700px)").matches;
      let value = scrubCenter ?? 0;
      if (scene === "demo" && mobile) value = 1;
      else if (mobile && (scene === "how" || scene === "partners")) value = scrubCenter ?? 0.5;
      else if (section && scrubCenter !== undefined) value = scrubProgress(section, scrubCenter);
      handle.setProgress(value);
      progressRef.current?.(value);
    };

    const release = () => {
      token += 1;
      handle?.dispose();
      handle = null;
      handleCb.current?.(null);
      if (alive) setShown(false);
    };

    const acquire = () => {
      if (handle) return;
      const mine = ++token;
      void loaders[scene]()
        .then((mount) => {
          if (!alive || mine !== token || !canvasRef.current) return null;
          const mobile = window.matchMedia("(max-width: 700px)").matches;
          return mount(canvasRef.current, { mobile, reducedMotion });
        })
        .then((next) => {
          if (!next) return;
          if (!alive || mine !== token) {
            next.dispose();
            return;
          }
          handle = next;
          next.onChange = () => {
            if (alive && handle) setAnchors(handle.anchors());
          };
          read();
          setAnchors(next.anchors());
          setMode(reducedMotion ? "static-3d" : "live");
          setReason(reducedMotion ? "prefers-reduced-motion" : "webgl");
          setShown(true);
          handleCb.current?.(next);
        })
        .catch(() => {
          if (alive && mine === token) {
            setMode("still");
            setReason("webgl-context-failed");
            setDebug(id, "still", "webgl-context-failed");
          }
        });
    };

    const observer = new IntersectionObserver((entries) => {
      const ratio = entries[0]?.isIntersecting ? entries[0].intersectionRatio : 0;
      reportGl(id, ratio, { acquire, release });
    }, { threshold: [0, 0.2, 0.35, 0.55, 0.75, 1] });
    observer.observe(node);

    const onScroll = () => read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const resizeObserver = new ResizeObserver(() => {
      handle?.resize();
      if (handle) setAnchors(handle.anchors());
    });
    resizeObserver.observe(node);

    return () => {
      alive = false;
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      clearGl(id);
      release();
      window.cancelAnimationFrame(publish);
    };
  }, [id, scene, scrubCenter]);

  return (
    <div ref={frameRef} className="pa-stage" data-ready={mode === "still" ? "false" : "true"} data-mode={mode} data-reason={reason} style={{ ["--mh" as string]: `${mobileHeight}px` }}>
      <div className="pa-stage-view">
        {broken ? null : (
          <img className={shown ? "pa-fallback is-covered" : "pa-fallback"} src={fallback} alt="" onError={() => setBroken(true)} />
        )}
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
      <div className="pa-anchors">{children?.(anchors)}</div>
    </div>
  );
}
