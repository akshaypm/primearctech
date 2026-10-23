import * as THREE from "three";
import { createNetworkAudio, type NetworkAudio } from "./audio";
import { LAYER_CALLOUTS, PRODUCTS, beatAt, type BeatId, type CueName } from "./copy";
import { SCROLL_OMEGA, STORY_END, buildTau, createSpring, pxPerSecond, springTo, tauAt, timeAtTau } from "./scroll";
import { loadWorld, type MemoryReport, type NetworkWorld } from "./world";

export type AnchorPoint = { id: string; x: number; y: number; visible: boolean };

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
const INTRO_LOOP_A = 2.2;
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

  const source = params.get("src") === "original" ? "original" : "ktx";
  let world: NetworkWorld;
  try {
    world = await loadWorld(renderer, mobileQuery || window.innerWidth < 760, source, (progress, label) => {
      publish({ progress, label, intro: !shot });
    });
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
  let clock = shot ? Number(params.get("t") || 6) : 0;
  let mix = loaderMixAt(clock);
  let cross = 0;
  let assetsReady = true;
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
    fullResidency: shot || params.get("full") === "1",
  });

  const anchors = (t: number): AnchorPoint[] => {
    const beat = beatAt(t);
    const list: AnchorPoint[] = [];
    if (beat.id === "layers") {
      for (const callout of LAYER_CALLOUTS) {
        const p = world.project(callout.node);
        list.push({ id: callout.id, x: p?.x ?? 0, y: p?.y ?? 0, visible: Boolean(p && p.visible && p.x > 8 && p.y > 48 && p.x < (canvas.clientWidth || 1) - 8) });
      }
    }
    if (beat.id === "attention") {
      for (const product of PRODUCTS) {
        const p = world.project(product.node);
        list.push({ id: product.id, x: p?.x ?? 0, y: p?.y ?? 0, visible: Boolean(p && p.visible) });
      }
    }
    return list;
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
    });
  };

  let shotT = Number(params.get("t") || 6);
  if (shot) {
    await finishShot(shotT);
    const host = window as Window & { __seek?: (t: number) => void; __network?: { t: number } };
    host.__seek = (t: number) => {
      shotT = t;
      if (host.__network) host.__network.t = t;
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
      requestAnimationFrame(frame);
      return;
    }

    if (intro) {
      if (!assetsReady) {
        if (clock >= INTRO_END) clock = INTRO_LOOP_A;
        clock += dt;
        if (clock >= INTRO_END) clock = INTRO_LOOP_A;
        mix = 1;
      } else {
        clock += dt;
        if (clock < INTRO_END) mix = 1;
        else {
          cross += dt;
          clock = INTRO_END;
          mix = Math.max(0, 1 - cross / CROSSFADE);
          if (mix <= 0) {
            intro = false;
            mix = 0;
            document.documentElement.style.overflow = "";
            scrollToTime(INTRO_END);
            audio.cue("hero");
          }
        }
      }
    }

    let tau = spring.x;
    if (!intro) {
      springTo(spring, Math.min(storyPx / px, Math.max(0, targetTau)), SCROLL_OMEGA, dt);
      tau = spring.x;
    }
    let t = intro ? Math.min(clock, INTRO_END) : timeAtTau(table, tau);

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
    if (!reduced && !dive && idleFor > 0.45 && idleFor < 8) {
      const wobble = Math.sin(now * 0.001 * Math.PI * 2 * 0.2);
      world.camera.position.x += wobble * 0.008;
      world.camera.position.y += Math.cos(now * 0.001) * 0.003;
    }
    world.render();

    const beat = beatAt(intro ? 0 : t);
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

    publish({
      t: intro ? clock : t,
      beatId: intro ? "loader" : beat.id,
      ready: assetsReady,
      progress: 1,
      label: intro ? "network" : beat.id,
      intro,
      epoch,
      sand: intro ? 0 : sand,
      dive: dive && dive.u > 0.02 ? dive.id : null,
      anchors: anchors(intro ? 0 : t),
    });
    requestAnimationFrame(frame);
  };

  assetsReady = true;
  if (!shot) {
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(frame);
  } else {
    requestAnimationFrame(frame);
  }

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
