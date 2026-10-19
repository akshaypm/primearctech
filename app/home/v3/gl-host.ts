import * as THREE from "three";

export type DebugRow = { id: string; mode: string; reason: string };

type Layer = {
  element: HTMLElement;
  tick: (time: number) => void;
  resize: (width: number, height: number) => void;
  texture: () => THREE.Texture | null;
  /** Needs the shared canvas at device density while on screen. Other frames stay at 1x. */
  dense?: boolean;
};

const layers = new Map<string, Layer>();
const debugRows = new Map<string, DebugRow>();
let renderer: THREE.WebGLRenderer | null = null;
let blitScene: THREE.Scene | null = null;
let blitCamera: THREE.Camera | null = null;
let blitUniforms: {
  map: { value: THREE.Texture | null };
  rect: { value: THREE.Vector4 };
  clip: { value: THREE.Vector4 };
  fade: { value: THREE.Vector2 };
} | null = null;
let raf = 0;
let last = 0;
const fpsSamples: number[] = [];
let fpsValue = 0;
let dprLowered = false;
let rendererName = "pending";
let hostWidth = 0;
let hostHeight = 0;
let framesSeen = 0;
let denseRatio = 1;
const FPS_WINDOW = 45;
const WARMUP_FRAMES = 30;
const SLOW_FRAME_MS = 42;

function devicePixelRatioCap() {
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

/** Section scenes keep their 1x, 640-capped buffers whatever the host canvas density. */
export function sectionPixelRatio() {
  return 1;
}

const blitVertex = `
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const blitFragment = `
  precision highp float;
  uniform sampler2D map;
  uniform vec4 rect;
  uniform vec4 clip;
  uniform vec2 fade;
  varying vec2 vUv;
  void main() {
    if (vUv.x < clip.x || vUv.y < clip.y || vUv.x > clip.x + clip.z || vUv.y > clip.y + clip.w) discard;
    vec4 color = texture2D(map, (vUv - rect.xy) / max(rect.zw, vec2(0.0001)));
    float ay = (vUv.y - clip.y) / max(clip.w, 0.0001);
    float alpha = 1.0;
    if (fade.y > 0.0) alpha = min(alpha, smoothstep(0.0, fade.y, ay));
    if (fade.x > 0.0) alpha = min(alpha, smoothstep(0.0, fade.x, 1.0 - ay));
    color.rgb *= alpha;
    color.a *= alpha;
    gl_FragColor = color;
  }
`;

function mountCanvas() {
  const existing = document.querySelector<HTMLCanvasElement>("canvas.pa-gl-host");
  if (existing) {
    existing.setAttribute("aria-hidden", "true");
    return existing;
  }
  const canvas = document.createElement("canvas");
  canvas.className = "pa-gl-host";
  canvas.setAttribute("aria-hidden", "true");
  const root = document.querySelector(".pa") ?? document.body;
  root.prepend(canvas);
  return canvas;
}

export function sharedRenderer() {
  if (renderer) return renderer;
  const canvas = mountCanvas();
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
  });
  denseRatio = devicePixelRatioCap();
  renderer.setPixelRatio(1);
  resizeHost();
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  rendererName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "webgl";
  setDebug("renderer", "live", rendererName);

  blitUniforms = {
    map: { value: null },
    rect: { value: new THREE.Vector4() },
    clip: { value: new THREE.Vector4() },
    fade: { value: new THREE.Vector2() },
  };
  const blitMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.RawShaderMaterial({
      uniforms: blitUniforms,
      vertexShader: blitVertex,
      fragmentShader: blitFragment,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  blitMesh.frustumCulled = false;
  blitScene = new THREE.Scene();
  blitScene.add(blitMesh);
  blitCamera = new THREE.Camera();
  if (!raf) {
    last = performance.now();
    raf = window.requestAnimationFrame(frame);
  }
  return renderer;
}

export function rendererLabel() {
  return rendererName;
}

function resizeHost() {
  if (!renderer) return;
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const ratio = renderer.getPixelRatio();
  const wantW = Math.floor(window.innerWidth * ratio);
  const wantH = Math.floor(window.innerHeight * ratio);
  if (window.innerWidth === hostWidth && window.innerHeight === hostHeight && buffer.x === wantW && buffer.y === wantH) return;
  hostWidth = window.innerWidth;
  hostHeight = window.innerHeight;
  renderer.setSize(hostWidth, hostHeight, false);
}

function adaptPixelRatio() {
  if (!renderer || framesSeen <= WARMUP_FRAMES || fpsSamples.length < FPS_WINDOW) return;
  if (renderer.getPixelRatio() <= 1) return;
  // On 2x-3x phones a 1x canvas brings the fin stair-stepping back; 1.5x is the floor there.
  const floor = devicePixelRatioCap() >= 2 ? 1.5 : 1;
  if (denseRatio <= floor) return;
  const sorted = [...fpsSamples].sort((a, b) => a - b);
  if (sorted[sorted.length >> 1] <= SLOW_FRAME_MS) return;
  dprLowered = true;
  denseRatio = Math.max(floor, denseRatio - 0.5);
  fpsSamples.length = 0;
}

function onScreen(layer: Layer) {
  const rect = sectionVisible(layer.element);
  if (!rect) return null;
  const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
  return visibleHeight < 64 ? null : rect;
}

export function sectionVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const height = window.innerHeight;
  const width = window.innerWidth;
  if (rect.width < 2 || rect.height < 2) return null;
  if (rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) return null;
  return rect;
}

const fadeDistance = 150;

function boundsOf(element: Element) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) return null;
  return rect;
}

function drawWindow(layer: Layer, rect: DOMRect) {
  const section = layer.element.closest("section, header");
  let top = Math.max(rect.top, 0);
  let bottom = Math.min(rect.bottom, window.innerHeight);
  let left = Math.max(rect.left, 0);
  let right = Math.min(rect.right, window.innerWidth);
  if (section) {
    const box = section.getBoundingClientRect();
    top = Math.max(top, box.top);
    bottom = Math.min(bottom, box.bottom);
    left = Math.max(left, box.left);
    right = Math.min(right, box.right);
  }
  const blockers = document.querySelectorAll(".pa-head, .pa-lede, .pa-side, .pa-foot, .pa-steps, .pa-prog");
  let fadeTop = 0;
  let fadeBottom = 0;
  blockers.forEach((node) => {
    const own = section?.contains(node) ?? false;
    const foot = node.classList.contains("pa-foot");
    if (own && !foot) return;
    const box = boundsOf(node);
    if (!box || box.right < left + 8 || box.left > right - 8) return;
    const pad = foot ? 88 : 24;
    if (foot && box.top < bottom + pad) {
      fadeBottom = fadeDistance;
      bottom = Math.min(bottom, box.top - pad);
    } else if (box.bottom <= top) fadeTop = Math.max(fadeTop, fadeDistance - (top - box.bottom));
    else if (box.top >= bottom) fadeBottom = Math.max(fadeBottom, fadeDistance - (box.top - bottom));
    else if (box.top > (top + bottom) / 2) {
      fadeBottom = fadeDistance;
      bottom = Math.min(bottom, box.top - pad);
    } else {
      fadeTop = fadeDistance;
      top = Math.max(top, box.bottom + pad);
    }
  });
  if (bottom - top < 8 || right - left < 8) return null;
  const span = bottom - top;
  return {
    top,
    bottom,
    left,
    right,
    fadeTop: Math.min(0.45, fadeTop / span),
    fadeBottom: Math.min(0.45, fadeBottom / span),
  };
}

function drawLayer(layer: Layer, rect: DOMRect) {
  if (!renderer || !blitScene || !blitCamera || !blitUniforms) return;
  const windowRect = drawWindow(layer, rect);
  if (!windowRect) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const texture = layer.texture();
  if (!texture) return;
  texture.colorSpace = THREE.NoColorSpace;
  blitUniforms.map.value = texture;
  blitUniforms.rect.value.set(rect.left / width, 1 - rect.bottom / height, rect.width / width, rect.height / height);
  blitUniforms.clip.value.set(
    windowRect.left / width,
    1 - windowRect.bottom / height,
    (windowRect.right - windowRect.left) / width,
    (windowRect.bottom - windowRect.top) / height,
  );
  blitUniforms.fade.value.set(windowRect.fadeTop, windowRect.fadeBottom);
  // setViewport and setScissor take CSS pixels; three multiplies them by the pixel ratio.
  const sx = Math.max(0, Math.floor(windowRect.left));
  const sy = Math.max(0, Math.floor(height - windowRect.bottom));
  const sw = Math.max(1, Math.min(width - sx, Math.ceil(windowRect.right - windowRect.left)));
  const sh = Math.max(1, Math.min(height - sy, Math.ceil(windowRect.bottom - windowRect.top)));
  renderer.setRenderTarget(null);
  renderer.setViewport(0, 0, width, height);
  renderer.setScissorTest(true);
  renderer.setScissor(sx, sy, sw, sh);
  renderer.render(blitScene, blitCamera);
  renderer.setScissorTest(false);
}

function frame(now: number) {
  raf = 0;
  try {
  const dt = now - last;
  last = now;
  if (dt > 0 && dt < 5000) {
    framesSeen += 1;
    fpsSamples.push(dt);
    if (fpsSamples.length > FPS_WINDOW) fpsSamples.shift();
    const average = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
    fpsValue = 1000 / average;
    adaptPixelRatio();
  }
  if (renderer) {
    const visible = new Map([...layers.entries()].map(([id, layer]) => [id, onScreen(layer)]));
    const dense = [...layers.entries()].some(([id, layer]) => layer.dense && visible.get(id));
    const ratio = dense ? denseRatio : 1;
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    resizeHost();
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    const ordered = [...layers.entries()].sort((a, b) => a[1].element.getBoundingClientRect().top - b[1].element.getBoundingClientRect().top);
    for (const [id, layer] of ordered) {
      const rect = visible.get(id);
      if (!rect) {
        setDebug(id, "offscreen", sectionVisible(layer.element) ? "edge" : "offscreen");
        continue;
      }
      layer.resize(Math.max(2, rect.width), Math.max(2, rect.height));
      layer.tick(now);
      drawLayer(layer, rect);
      setDebug(id, "live", `on screen ${Math.round(fpsValue || 0)}fps`);
    }
    setDebug("fps", "live", `${(fpsValue || 0).toFixed(1)} fps dpr ${renderer.getPixelRatio()}${dprLowered ? " (lowered)" : ""} ${rendererName}`);
  }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setDebug("renderer", "error", message);
    console.error(message);
  }
  if (layers.size > 0) raf = window.requestAnimationFrame(frame);
}

export function registerLayer(id: string, layer: Layer) {
  sharedRenderer();
  layers.set(id, layer);
  if (!raf) {
    last = performance.now();
    raf = window.requestAnimationFrame(frame);
  }
}

export function measuredFps() {
  return fpsValue;
}

export function unregisterLayer(id: string) {
  layers.delete(id);
  if (layers.size === 0 && raf) {
    window.cancelAnimationFrame(raf);
    raf = 0;
  }
}

export function setDebug(id: string, mode: string, reason: string) {
  debugRows.set(id, { id, mode, reason });
}

export function debugSnapshot() {
  return [...debugRows.values()];
}

export function debugEnabled() {
  return new URLSearchParams(window.location.search).get("debug") === "1";
}
