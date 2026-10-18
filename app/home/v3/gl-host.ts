import * as THREE from "three";

export type DebugRow = { id: string; mode: string; reason: string };

type Layer = {
  element: HTMLElement;
  texture: () => THREE.Texture | null;
};

const layers = new Map<string, Layer>();
const debugRows = new Map<string, DebugRow>();
const degradeListeners = new Set<(reason: string) => void>();

let renderer: THREE.WebGLRenderer | null = null;
let blitScene: THREE.Scene | null = null;
let blitCamera: THREE.Camera | null = null;
let blitUniforms: { map: { value: THREE.Texture | null }; rect: { value: THREE.Vector4 } } | null = null;
let raf = 0;
let last = 0;
let warmed = 0;
const fpsSamples: number[] = [];
let degraded: string | null = null;
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
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
    failIfMajorPerformanceCaveat: false,
  });
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
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

function drawLayer(layer: Layer) {
  if (!renderer || !blitScene || !blitCamera || !blitUniforms) return;
  const rect = layer.element.getBoundingClientRect();
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (rect.width < 2 || rect.height < 2) return;
  if (rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) return;
  const texture = layer.texture();
  if (!texture) return;
  texture.colorSpace = THREE.NoColorSpace;
  const x = rect.left / width;
  const w = rect.width / width;
  const y = 1 - rect.bottom / height;
  const h = rect.height / height;
  blitUniforms.map.value = texture;
  blitUniforms.rect.value.set(x, y, w, h);
  renderer.setRenderTarget(null);
  renderer.render(blitScene, blitCamera);
}

function frame(now: number) {
  raf = 0;
  const dt = Math.min(100, now - last);
  last = now;
  if (!degraded) {
    warmed += dt;
    if (warmed > 1800) {
      fpsSamples.push(dt);
      if (fpsSamples.length > 45) fpsSamples.shift();
      if (fpsSamples.length >= 30) {
        const average = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
        if (average > 170) degrade("low-fps");
      }
    }
  }
  if (renderer && !degraded) {
    resizeHost();
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    const ordered = [...layers.entries()].sort((a, b) => {
      return a[1].element.getBoundingClientRect().top - b[1].element.getBoundingClientRect().top;
    });
    for (const [, layer] of ordered) drawLayer(layer);
  }
  if (layers.size > 0) raf = window.requestAnimationFrame(frame);
}

export function registerLayer(id: string, layer: Layer) {
  sharedRenderer();
  layers.set(id, layer);
  if (!raf && !degraded) {
    last = performance.now();
    raf = window.requestAnimationFrame(frame);
  }
}

export function unregisterLayer(id: string) {
  layers.delete(id);
  if (layers.size === 0 && raf) {
    window.cancelAnimationFrame(raf);
    raf = 0;
  }
}

export function onDegrade(listener: (reason: string) => void) {
  degradeListeners.add(listener);
  return () => degradeListeners.delete(listener);
}

export function degrade(reason: string) {
  if (degraded) return;
  degraded = reason;
  setDebug("renderer", "still", reason);
  for (const listener of degradeListeners) listener(reason);
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
