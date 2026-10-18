import * as THREE from "three";

export type DebugRow = { id: string; mode: string; reason: string };

type Layer = {
  element: HTMLElement;
  tick: (time: number) => void;
  resize: (width: number, height: number) => void;
  texture: () => THREE.Texture | null;
};

const layers = new Map<string, Layer>();
const debugRows = new Map<string, DebugRow>();
let renderer: THREE.WebGLRenderer | null = null;
let blitScene: THREE.Scene | null = null;
let blitCamera: THREE.Camera | null = null;
let blitUniforms: { map: { value: THREE.Texture | null }; rect: { value: THREE.Vector4 } } | null = null;
let raf = 0;
let last = 0;
const fpsSamples: number[] = [];
let fpsValue = 0;
let dprLowered = false;
let rendererName = "pending";

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
  varying vec2 vUv;
  void main() {
    if (vUv.x < rect.x || vUv.y < rect.y || vUv.x > rect.x + rect.z || vUv.y > rect.y + rect.w) discard;
    gl_FragColor = texture2D(map, (vUv - rect.xy) / rect.zw);
  }
`;

function mountCanvas() {
  const existing = document.querySelector<HTMLCanvasElement>("canvas.pa-gl-host");
  if (existing) return existing;
  const canvas = document.createElement("canvas");
  canvas.className = "pa-gl-host";
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
  const dpr = 1;
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
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
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

export function sectionVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const height = window.innerHeight;
  const width = window.innerWidth;
  if (rect.width < 2 || rect.height < 2) return null;
  if (rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) return null;
  return rect;
}

function drawLayer(layer: Layer, rect: DOMRect) {
  if (!renderer || !blitScene || !blitCamera || !blitUniforms) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const texture = layer.texture();
  if (!texture) return;
  texture.colorSpace = THREE.NoColorSpace;
  const x = rect.left / width;
  const w = rect.width / width;
  const y = 1 - rect.bottom / height;
  const h = rect.height / height;
  blitUniforms.map.value = texture;
  blitUniforms.rect.value.set(x, y, w, h);
  const dpr = renderer.getPixelRatio();
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const sx = Math.max(0, Math.floor(rect.left * dpr));
  const sy = Math.max(0, Math.floor((height - rect.bottom) * dpr));
  const sw = Math.max(1, Math.min(buffer.x - sx, Math.floor(rect.width * dpr)));
  const sh = Math.max(1, Math.min(buffer.y - sy, Math.floor(rect.height * dpr)));
  renderer.setRenderTarget(null);
  renderer.setViewport(0, 0, buffer.x, buffer.y);
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
    fpsSamples.push(dt);
    if (fpsSamples.length > 30) fpsSamples.shift();
    const average = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
    fpsValue = 1000 / average;
    if (!dprLowered && renderer && average > 42 && renderer.getPixelRatio() > 1) {
      dprLowered = true;
      renderer.setPixelRatio(1);
    }
  }
  if (renderer) {
    resizeHost();
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    const ordered = [...layers.entries()].sort((a, b) => a[1].element.getBoundingClientRect().top - b[1].element.getBoundingClientRect().top);
    for (const [id, layer] of ordered) {
      const rect = sectionVisible(layer.element);
      const visibleHeight = rect ? Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0) : 0;
      if (!rect || visibleHeight < 64) {
        setDebug(id, "offscreen", rect ? "edge" : "offscreen");
        continue;
      }
      layer.resize(Math.max(2, rect.width), Math.max(2, rect.height));
      layer.tick(now);
      drawLayer(layer, rect);
      setDebug(id, "live", `on screen ${Math.round(fpsValue || 0)}fps`);
    }
    setDebug("fps", "live", `${(fpsValue || 0).toFixed(1)} fps${dprLowered ? " dpr1" : ""} ${rendererName}`);
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
