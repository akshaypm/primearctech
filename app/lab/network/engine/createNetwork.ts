import * as THREE from "three";
import { createNetworkAudio, type NetworkAudio } from "./audio";
import { LAYER_CALLOUTS, PRODUCTS, beatAt, beatScenes, nextScene, productFocus, type BeatId, type CueName } from "./copy";
import { SCROLL_OMEGA, STORY_END, buildTau, createSpring, pxPerSecond, springTo, tauAt, timeAtTau } from "./scroll";
import { loadWorld, type MemoryReport, type NetworkWorld, type Obstacle } from "./world";

export type AnchorPoint = {
  id: string;
  x: number;
  y: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  visible: boolean;
  focus: boolean;
};

export type FrameState = {
  t: number;
  beatId: BeatId;
  ready: boolean;
  progress: number;
  label: string;
  intro: boolean;
  epoch: boolean;
  sand: number;
  reduced: boolean;
  fallback: boolean;
  dive: string | null;
  anchors: AnchorPoint[];
  poster: number;
  obstacles: Obstacle[];
  focus: string | null;
};

export type NetworkHandle = {
  audio: NetworkAudio;
  scrollToTime: (t: number) => void;
  dive: (id: string) => void;
  cancelDive: () => void;
  skipDive: () => void;
  dispose: () => void;
};

type Options = {
  canvas: HTMLCanvasElement;
  onFrame: (state: FrameState) => void;
};

type DiveState = { id: string; node: string; u: number; dir: 1 | -1 };

const INTRO_END = 3.5;
const CROSSFADE = 0.4;
const DIVE_SECONDS = 0.9;

function loaderMixAt(t: number) {
  if (t <= INTRO_END) return 1;
  if (t >= INTRO_END + CROSSFADE) return 0;
  return 1 - (t - INTRO_END) / CROSSFADE;
}

function webgl2(canvas: HTMLCanvasElement) {
  try {
    return canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
  } catch {
    return null;
  }
}

function gpuName(gl: WebGL2RenderingContext) {
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  return String(gl.getParameter(gl.RENDERER));
}

function lowMemory() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory === "number" && memory > 0 && memory <= 2;
}

export async function createNetwork({ canvas, onFrame }: Options): Promise<NetworkHandle | null> {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get("shot") === "1";
  const reduced = !shot && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const forceFallback = params.get("fallback") === "1";
  const mobileQuery = params.get("mobile") === "1";
  const audio = createNetworkAudio();
  const table = buildTau();
  const spring = createSpring(0);

  const publish = (partial: Partial<FrameState>) => {
    onFrame({
      t: 0,
      beatId: "loader",
      ready: false,
      progress: 0,
      label: "boot",
      intro: true,
      epoch: false,
      sand: 0,
      reduced,
      fallback: forceFallback,
      dive: null,
      anchors: [],
      poster: shot ? 0 : 1,
      obstacles: [],
      focus: null,
      ...partial,
    });
  };

  if (forceFallback || lowMemory() || (!shot && !webgl2(canvas))) {
    publish({ fallback: true, intro: false, ready: true, beatId: "hero", t: 8 });
    return {
      audio,
      scrollToTime() {},
      dive() {},
      cancelDive() {},
      skipDive() {},
      dispose() {
        audio.dispose();
      },
    };
  }

  const gl = webgl2(canvas);
  if (!gl) {
    publish({ fallback: true, intro: false, ready: true });
    return null;
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: gl,
    alpha: false,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0xefe6d6, 1);

  let loadProgress = 0;
  const source = params.get("src") === "original" ? "original" : "ktx";
  const stream = params.get("stream") === "1";
  const quality = shot || source === "original" ? "full" : "boot";
  let world: NetworkWorld;
  const bootHost = window as Window & { __boot?: { firstPaint?: number; heroReady?: number; heroFrame?: number; first3d?: number; loaderFrame?: number; bytes?: number; playLoader?: boolean } };
  const boot = bootHost.__boot || {};
  bootHost.__boot = boot;
  if (!boot.firstPaint) boot.firstPaint = performance.now();
  try {
    world = await loadWorld(
      renderer,
      mobileQuery || window.innerWidth < 760,
      source,
      (progress, label) => {
        loadProgress = progress;
        publish({ progress, label, t: 6, beatId: "hero", intro: false, poster: shot ? 0 : 1 });
      },
      quality,
    );
    boot.heroReady = performance.now();
    if (shot) {
      world.startQueue();
      await world.loaded;
    }
  } catch (error) {
    console.error(error);
    publish({ fallback: true, intro: false, ready: true, label: "assets" });
    renderer.dispose();
    return null;
  }

  let mobile = mobileQuery || window.matchMedia("(max-width: 760px)").matches;
  let dprCap = mobile ? 1.5 : 1.75;
  let dpr = shot ? 1 : Math.min(dprCap, Math.max(1, window.devicePixelRatio || 1));
  let px = pxPerSecond(window.innerHeight, mobile);
  let storyPx = tauAt(table, STORY_END) * px;
  let running = true;
  let disposed = false;
  let intro = !shot;
  let clock = shot ? Number(params.get("t") || 6) : 6;
  let mix = shot ? loaderMixAt(clock) : 0;
  let cross = 0;
  const deadline = (boot.firstPaint || 0) + 1500;
  const waitForLoader = !shot && (boot.heroReady || 0) <= deadline;
  let phase: "wait" | "loader" | "hero" = shot ? "hero" : "wait";
  let poster = shot ? 0 : 1;
  let fading = false;
  let fade = 0;
  if (shot) world.startQueue();
  let epoch = false;
  let wrapping = false;
  let sand = 0;
  let sandTarget = 0;
  let held = beatAt(shot ? clock : 0).hold;
  let lastBeat: BeatId | null = null;
  let idleFor = 0;
  let lastScroll = window.scrollY;
  let scrollAt = performance.now();
  let targetTau = 0;
  let hotFrames = 0;
  let dive: DiveState | null = null;
  const productNode = new Map<string, string>(PRODUCTS.map((p) => [p.id, p.node]));

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const resize = () => {
    mobile = mobileQuery || window.matchMedia("(max-width: 760px)").matches;
    dprCap = mobile ? 1.5 : 1.75;
    if (!shot) dpr = Math.min(dpr, dprCap, window.devicePixelRatio || 1);
    const w = shot ? Number(params.get("w") || canvas.clientWidth || window.innerWidth) : canvas.clientWidth || window.innerWidth;
    const h = shot ? Number(params.get("h") || canvas.clientHeight || window.innerHeight) : canvas.clientHeight || window.innerHeight;
    world.resize(w, h, dpr);
    px = pxPerSecond(window.innerHeight || h, mobile);
    storyPx = tauAt(table, STORY_END) * px;
    const spacer = document.querySelector<HTMLElement>("[data-network-spacer]");
    if (spacer && !shot) spacer.style.height = `${storyPx + window.innerHeight}px`;
  };
  resize();

  const scrollToTime = (t: number) => {
    const tau = tauAt(table, Math.min(STORY_END, Math.max(0, t)));
    targetTau = tau;
    spring.x = tau;
    spring.v = 0;
    if (!shot) window.scrollTo(0, tau * px);
  };

  const poseOpts = (t: number) => ({
    mobile,
    smoothCamera: !shot && !reduced,
    loaderMix: shot ? loaderMixAt(t) : mix,
    dive: dive && dive.u > 0 ? { node: productNode.get(dive.id) || dive.id, u: dive.u } : null,
    fullResidency: (shot && !stream) || params.get("full") === "1",
  });

  const anchors = (t: number): AnchorPoint[] => {
    const beat = beatAt(t);
    const list: AnchorPoint[] = [];
    const width = canvas.clientWidth || window.innerWidth || 1;
    const height = canvas.clientHeight || window.innerHeight || 1;
    if (beat.id === "layers") {
      for (const callout of LAYER_CALLOUTS) {
        const box = world.projectBox(callout.node);
        const mid = box ? (box.y0 + box.y1) / 2 : 0;
        const visible = Boolean(box && box.x1 > 0 && box.x0 < width && mid > 48 && mid < height - 24);
        list.push({
          id: callout.id,
          x: box?.x1 ?? 0,
          y: mid,
          x0: box?.x0 ?? 0,
          y0: box?.y0 ?? 0,
          x1: box?.x1 ?? 0,
          y1: box?.y1 ?? 0,
          visible,
          focus: false,
        });
      }
    }
    if (beat.id === "attention") {
      const focus = productFocus(t);
      const used = new Set<string>();
      const ordered = [...PRODUCTS].sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
      for (const product of ordered) {
        let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
        for (const name of product.anchors) {
          if (used.has(name)) continue;
          const next = world.projectBox(name);
          const on = Boolean(next && next.x1 > 24 && next.x0 < width - 24 && next.y1 > 48 && next.y0 < height - 24);
          if (next && on) {
            box = next;
            used.add(name);
            break;
          }
        }
        const cy = box ? (box.y0 + box.y1) / 2 : 0;
        list.push({
          id: product.id,
          x: box ? box.x1 : 0,
          y: cy,
          x0: box?.x0 ?? 0,
          y0: box?.y0 ?? 0,
          x1: box?.x1 ?? 0,
          y1: box?.y1 ?? 0,
          visible: Boolean(box),
          focus: focus === product.id,
        });
      }
    }
    return list;
  };

  const noteBytes = () => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const rows = entries
      .filter((entry) => entry.responseEnd > 0 && entry.responseEnd <= performance.now() + 30)
      .map((entry) => ({
        name: entry.name.replace(location.origin, "").split("?")[0],
        bytes: entry.transferSize || entry.encodedBodySize || 0,
      }));
    boot.bytes = rows.reduce((sum, row) => sum + row.bytes, 0);
    (boot as { resources?: typeof rows }).resources = rows;
  };

  const finishShot = async (t: number) => {
    const opts = poseOpts(t);
    world.pose(t, opts);
    world.render();
    const pixel = new Uint8Array(4);
    for (let i = 0; i < 2; i += 1) {
      world.pose(t, opts);
      world.render();
    }
    const n = 6;
    const t0 = performance.now();
    for (let i = 0; i < n; i += 1) {
      world.pose(t, opts);
      world.render();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    }
    const frameMs = (performance.now() - t0) / n;
    const mem = world.memory();
    const report = {
      done: true,
      t,
      frameMs,
      mem,
      gl: gpuName(gl),
      threads: world.threadCount,
      warnings: world.threadWarnings,
      dpr,
      source,
      resident: world.resident(),
    };
    (window as Window & { __network?: unknown }).__network = report;
    publish({
      t,
      beatId: beatAt(t).id,
      ready: true,
      progress: 1,
      label: "shot",
      intro: false,
      sand: 0,
      anchors: anchors(t),
      poster: 0,
      obstacles: world.obstacles(beatScenes(beatAt(t).id)),
      focus: productFocus(t),
    });
  };

  let shotT = Number(params.get("t") || 6);
  if (shot) {
    await finishShot(shotT);
    const host = window as Window & { __seek?: (t: number) => void; __network?: { t: number } };
    host.__seek = (t: number) => {
      shotT = t;
      world.pose(t, poseOpts(t));
      world.render();
      if (host.__network) {
        host.__network.t = t;
        const report = host.__network as { mem?: MemoryReport; resident?: string[] };
        report.mem = world.memory();
        report.resident = world.resident();
      }
      publish({
        t,
        beatId: beatAt(t).id,
        ready: true,
        progress: 1,
        label: "shot",
        intro: false,
        sand: 0,
        anchors: anchors(t),
        poster: 0,
        obstacles: world.obstacles(beatScenes(beatAt(t).id)),
        focus: productFocus(t),
      });
    };
  }

  let last = performance.now();
  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (window.scrollY !== lastScroll) {
      lastScroll = window.scrollY;
      scrollAt = now;
      if (!intro && !shot) targetTau = window.scrollY / px;
      if (dive && dive.u > 0.02) dive.dir = -1;
    }
    idleFor = (now - scrollAt) / 1000;

    if (shot) {
      world.pose(shotT, poseOpts(shotT));
      world.render();
      publish({
        t: shotT,
        beatId: beatAt(shotT).id,
        ready: true,
        progress: 1,
        label: "shot",
        intro: false,
        sand: 0,
        anchors: anchors(shotT),
        poster: 0,
        obstacles: world.obstacles(beatScenes(beatAt(shotT).id)),
        focus: productFocus(shotT),
      });
      requestAnimationFrame(frame);
      return;
    }

    if (phase === "wait") {
      const loaderInTime = waitForLoader && world.hasScene("loader") && performance.now() <= deadline && !reduced;
      if (loaderInTime) {
        phase = "loader";
        clock = 0;
        mix = 1;
        fading = true;
        fade = 0;
        boot.playLoader = true;
        boot.loaderFrame = performance.now();
        world.startQueue();
      } else {
        phase = "hero";
        clock = 6;
        mix = 0;
        fading = true;
        fade = 0;
        boot.playLoader = false;
        boot.heroFrame = performance.now();
        boot.first3d = boot.heroFrame;
        noteBytes();
        scrollToTime(6);
        world.startQueue();
        void world.sceneReady("input").then(() => world.upgrade());
      }
    }
    if (phase === "loader") {
      clock += dt;
      if (clock < INTRO_END) mix = 1;
      else {
        cross += dt;
        clock = INTRO_END;
        mix = Math.max(0, 1 - cross / CROSSFADE);
        if (mix <= 0) {
          phase = "hero";
          intro = false;
          mix = 0;
          document.documentElement.style.overflow = "";
          scrollToTime(INTRO_END);
          audio.cue("hero");
          if (!boot.heroFrame) {
            boot.heroFrame = performance.now();
            boot.first3d = boot.heroFrame;
            noteBytes();
          }
        }
      }
    }
    if (fading) {
      fade += dt;
      poster = Math.max(0, 1 - fade / CROSSFADE);
      if (poster === 0) {
        fading = false;
        if (phase === "hero" && intro) {
          intro = false;
          document.documentElement.style.overflow = "";
          audio.cue("hero");
        }
      }
    }

    let tau = spring.x;
    if (!intro) {
      springTo(spring, Math.min(storyPx / px, Math.max(0, targetTau)), SCROLL_OMEGA, dt);
      tau = spring.x;
    }
    let t = phase === "loader" ? Math.min(clock, INTRO_END) : intro ? 6 : timeAtTau(table, tau);

    if (reduced && !intro) {
      const next = beatAt(t);
      if (Math.abs(next.hold - held) > 0.01) {
        sandTarget = 1;
        if (sand > 0.92) held = next.hold;
      } else sandTarget = 0;
      t = held;
    }

    const past = !intro && window.scrollY > storyPx + window.innerHeight * 0.62;
    epoch = !intro && window.scrollY > storyPx - 8;
    if (past && !wrapping && !reduced) {
      wrapping = true;
      sandTarget = 1;
    }
    if (wrapping && sand > 0.94) {
      sandTarget = 0;
      wrapping = false;
      epoch = false;
      window.scrollTo(0, 0);
      spring.x = 0;
      spring.v = 0;
      targetTau = 0;
      t = 0;
      audio.cue("epoch");
    }
    sand += (sandTarget - sand) * Math.min(1, dt * 8);

    if (dive) {
      const step = dt / DIVE_SECONDS;
      dive.u = Math.min(1, Math.max(0, dive.u + dive.dir * step));
      if (dive.dir < 0 && dive.u <= 0) dive = null;
    }

    world.pose(t, poseOpts(t));
    if (!shot && phase !== "wait") {
      const beatNow = beatAt(intro ? clock : t);
      const span = beatNow.t1 - beatNow.t0;
      const liveT = intro ? clock : t;
      if (span > 0 && (liveT - beatNow.t0) / span >= 0.5) {
        const next = nextScene(beatNow.id);
        if (next) world.prefetch(next);
      }
    }
    if (!reduced && !dive && idleFor > 0.45 && idleFor < 8) {
      const wobble = Math.sin(now * 0.001 * Math.PI * 2 * 0.2);
      world.camera.position.x += wobble * 0.008;
      world.camera.position.y += Math.cos(now * 0.001) * 0.003;
    }
    world.render();

    const beat = beatAt(phase === "loader" ? t : intro ? 6 : t);
    if (!intro && beat.id !== lastBeat) {
      lastBeat = beat.id;
      const cue = (beat.id === "book" ? "book" : beat.id) as CueName;
      audio.cue(cue);
    }

    const frameMs = dt * 1000;
    if (frameMs > 22) hotFrames += 1;
    else hotFrames = Math.max(0, hotFrames - 1);
    if (hotFrames > 20 && dpr > 1) {
      dpr = Math.max(1, Math.round((dpr - 0.25) * 4) / 4);
      hotFrames = 0;
      resize();
    }

    const shown = t;
    publish({
      t: shown,
      beatId: phase === "loader" ? "loader" : beat.id,
      ready: phase !== "wait",
      progress: phase === "wait" ? loadProgress : 1,
      label: phase === "wait" ? "hero" : beat.id,
      intro: phase === "loader",
      epoch,
      sand: phase === "loader" ? 0 : sand,
      dive: dive && dive.u > 0.02 ? dive.id : null,
      anchors: anchors(shown),
      poster,
      obstacles: world.obstacles(beatScenes(phase === "loader" ? "loader" : beat.id)),
      focus: productFocus(shown),
    });
    requestAnimationFrame(frame);
  };

  if (!shot) document.documentElement.style.overflow = "hidden";
  requestAnimationFrame(frame);

  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  const diveTo = (id: string) => {
    const node = productNode.get(id);
    if (!node) return;
    dive = { id, node, u: dive?.id === id ? dive.u : 0, dir: 1 };
    audio.cue("dive");
  };

  return {
    audio,
    scrollToTime,
    dive: diveTo,
    cancelDive() {
      if (dive) dive.dir = -1;
    },
    skipDive() {
      if (dive) dive.u = 1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      window.removeEventListener("resize", onResize);
      document.documentElement.style.overflow = "";
      world.dispose();
      renderer.dispose();
      audio.dispose();
    },
  };
}

export type { MemoryReport };
