"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { journeyPosters } from "./content";
import {
  capDpr,
  chooseRenderPolicy,
  resolveJourneyState,
  resolveLayout,
  sceneTierFor,
  staticPose,
  type ChapterBounds,
  type JourneyChapter,
  type JourneyState,
  type RenderPolicy,
} from "./progress";
import type { JourneyScene } from "./createJourneyScene";

type ChapterRefs = {
  input: RefObject<HTMLElement | null>;
  assembly: RefObject<HTMLElement | null>;
  operation: RefObject<HTMLElement | null>;
};

type Props = {
  trackRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  chapters: ChapterRefs;
};

const ORDER: JourneyChapter[] = ["input", "assembly", "operation"];

export function JourneyCanvas({ trackRef, stageRef, chapters }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [policy, setPolicy] = useState<RenderPolicy>("poster");
  const [chapter, setChapter] = useState<JourneyChapter>("input");
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    const canvas = canvasRef.current;
    if (!stage || !track || !canvas) return;

    const fine = window.matchMedia("(pointer: fine)");
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = readSaveData();
    let webglAvailable = canCreateWebGL();
    let currentPolicy = chooseRenderPolicy({
      reducedMotion: reducedQuery.matches,
      saveData,
      webglAvailable,
    });
    setPolicy(currentPolicy);
    setNarrow(window.innerWidth < 768);
    stage.dataset.policy = currentPolicy;

    let scene: JourneyScene | null = null;
    let disposed = false;
    let raf = 0;
    let scrollY = window.scrollY;
    let bounds: ChapterBounds[] = measure(chapters);
    let pointerX = 0;
    let pointerY = 0;
    let moving = false;
    let visible = true;
    let settleTimer = 0;
    const chapterNow = { current: "input" as JourneyChapter };

    const applyLayout = () => {
      const layout = resolveLayout(stage.clientWidth || window.innerWidth, window.innerHeight);
      track.dataset.layout = layout;
      setNarrow(layout === "mobile" || (layout === "short" && window.innerWidth < 768));
      const tier = sceneTierFor(layout);
      const dpr = capDpr(window.devicePixelRatio || 1, tier);
      scene?.resize(stage.clientWidth, stage.clientHeight, dpr, tier);
    };

    const readState = (): JourneyState => {
      const next = resolveJourneyState(scrollY, bounds);
      return currentPolicy === "static" ? staticPose(next.chapter) : next;
    };

    const paint = (time: number) => {
      raf = 0;
      if (disposed || !scene) return;
      const next = readState();
      if (next.chapter !== chapterNow.current) {
        chapterNow.current = next.chapter;
        setChapter(next.chapter);
      }
      scene.setState(next);
      scene.setPointer(pointerX, pointerY, currentPolicy === "animated" && moving);
      scene.render(time);
      const stats = scene.stats();
      stage.dataset.calls = String(stats.calls);
      stage.dataset.triangles = String(stats.triangles);
      stage.dataset.dpr = String(stats.dpr);
      stage.dataset.renderer = stats.renderer;
      stage.dataset.policy = currentPolicy;
      stage.dataset.chapter = next.chapter;
      stage.dataset.progress = next.progress.toFixed(3);
      stage.dataset.cameraz = String(stats.cameraZ);
      stage.dataset.ready = "true";
      if (currentPolicy === "animated" && visible && !document.hidden && (moving || performance.now() < settleTimer)) {
        raf = window.requestAnimationFrame(paint);
      }
    };

    const kick = () => {
      if (disposed || !scene || currentPolicy === "poster") return;
      if (!raf) raf = window.requestAnimationFrame(paint);
    };

    const onScroll = () => {
      scrollY = window.scrollY;
      settleTimer = performance.now() + 180;
      kick();
    };
    const onResize = () => {
      const previous = scene ? readState() : null;
      bounds = measure(chapters);
      applyLayout();
      if (previous) {
        const span = bounds.find((item) => item.id === previous.chapter);
        if (span && span.end > span.start) {
          const target = span.start + (span.end - span.start) * previous.progress;
          if (Math.abs(window.scrollY - target) > 4) {
            window.scrollTo({ top: target, behavior: "auto" });
            scrollY = target;
          }
        }
      }
      settleTimer = performance.now() + 180;
      kick();
    };
    const onPointer = (event: PointerEvent) => {
      if (currentPolicy !== "animated") return;
      pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
      pointerY = event.clientY / Math.max(1, window.innerHeight) - 0.5;
      moving = true;
      settleTimer = performance.now() + 240;
      kick();
    };
    const onPointerStop = () => {
      moving = false;
      pointerX = 0;
      pointerY = 0;
      settleTimer = performance.now() + 400;
      kick();
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (raf) window.cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      kick();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(stage);
    const intersection = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) kick();
        else if (raf) {
          window.cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { rootMargin: "10% 0px" },
    );
    intersection.observe(track);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerleave", onPointerStop);
    document.addEventListener("visibilitychange", onVisibility);
    const onMotion = () => {
      currentPolicy = chooseRenderPolicy({
        reducedMotion: reducedQuery.matches,
        saveData,
        webglAvailable,
      });
      setPolicy(currentPolicy);
      stage.dataset.policy = currentPolicy;
      if (currentPolicy === "poster") stage.dataset.ready = "false";
      kick();
    };
    reducedQuery.addEventListener("change", onMotion);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      webglAvailable = false;
      currentPolicy = "poster";
      setPolicy("poster");
      stage.dataset.ready = "false";
      stage.dataset.policy = "poster";
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    let recoverTimer = 0;
    const onContextRestored = () => {
      window.clearTimeout(recoverTimer);
      recoverTimer = window.setTimeout(() => {
        if (disposed) return;
        webglAvailable = canCreateWebGL();
        onMotion();
      }, 120);
    };
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    const params = new URLSearchParams(window.location.search);
    if (params.has("capture") || params.has("debug")) {
      window.__journey = {
        setState(next: JourneyState) {
          scrollY = bounds[ORDER.indexOf(next.chapter)]?.start ?? scrollY;
          const span = bounds.find((item) => item.id === next.chapter);
          if (span) scrollY = span.start + (span.end - span.start) * next.progress;
          kick();
        },
        stats: () => scene?.stats() ?? null,
        policy: () => currentPolicy,
      };
    }

    if (currentPolicy !== "poster") {
      void import("./createJourneyScene")
        .then(async ({ createJourneyScene }) => {
          if (disposed) return null;
          const layout = resolveLayout(stage.clientWidth || window.innerWidth, window.innerHeight);
          return createJourneyScene(canvas, { tier: sceneTierFor(layout) });
        })
        .then((created) => {
          if (!created) return;
          if (disposed) {
            created.dispose();
            return;
          }
          scene = created;
          applyLayout();
          bounds = measure(chapters);
          settleTimer = performance.now() + 500;
          kick();
        })
        .catch(() => {
          currentPolicy = "poster";
          setPolicy("poster");
          stage.dataset.ready = "false";
          stage.dataset.policy = "poster";
        });
    }

    void document.fonts?.ready.then(() => {
      bounds = measure(chapters);
      kick();
    });
    bounds = measure(chapters);
    applyLayout();

    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(recoverTimer);
      observer.disconnect();
      intersection.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerleave", onPointerStop);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedQuery.removeEventListener("change", onMotion);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      scene?.dispose();
      scene = null;
      if (window.__journey) delete window.__journey;
    };
  }, [chapters, stageRef, trackRef]);

  const posters = journeyPosters[chapter];
  const src = narrow ? posters.mobile : posters.desktop;

  return (
    <>
      <img className="pj-poster" src={src} alt="" width={1600} height={900} fetchPriority={chapter === "input" ? "high" : "auto"} decoding="async" />
      <canvas ref={canvasRef} className="pj-canvas" aria-hidden="true" data-policy={policy} />
    </>
  );
}

function measure(chapters: ChapterRefs): ChapterBounds[] {
  return ORDER.flatMap((id) => {
    const node = chapters[id].current;
    if (!node) return [];
    const rect = node.getBoundingClientRect();
    const start = rect.top + window.scrollY;
    return [{ id, start, end: start + rect.height }];
  });
}

function canCreateWebGL() {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

function readSaveData() {
  const connection = navigator as Navigator & { connection?: { saveData?: boolean } };
  return Boolean(connection.connection?.saveData);
}

declare global {
  interface Window {
    __journey?: {
      setState: (state: JourneyState) => void;
      stats: () => ReturnType<JourneyScene["stats"]> | null;
      policy: () => RenderPolicy;
    };
  }
}
