import * as THREE from "three";
import { buildBlockout } from "./blockout";
import {
  createClayMaterial,
  createContactTexture,
  createFingerprintRoughness,
  createGlazeMaterial,
  createGroundMaterial,
  createSandTextures,
  createSkyMaterial,
  createStudioEnv,
} from "./materials";
import { PALETTE } from "./palette";
import {
  HERO_POSE,
  beatAt,
  damp,
  orbitAround,
  parallaxRadians,
  samplePose,
  timeAtProgress,
  verticalFovForAspect,
  type CameraPath,
  type Pose,
  parseCameraPath,
} from "./path";
import { clampedDpr, shadowMapSize, stepQuality, type QualityTier } from "./quality";
import { createSceneSfx, type SfxAudio } from "./sfx";

export type WorldStats = {
  fps: number;
  frameMs: number;
  tier: QualityTier;
  dpr: number;
  beat: string;
  progress: number;
  pose: { x: number; y: number; z: number; tx: number; ty: number; tz: number };
  renderer: string;
};

export type WorldHandle = {
  setProgress: (progress: number) => void;
  setAssembly: (progress: number) => void;
  setPointer: (x: number, y: number, fine: boolean) => void;
  reveal: () => void;
  resize: () => void;
  dispose: () => void;
  stats: WorldStats;
};

export type WorldOptions = {
  canvas: HTMLCanvasElement;
  audio: SfxAudio;
  mobile: boolean;
  motion: boolean;
  onProgress: (value: number) => void;
  onReady: () => void;
  onBeat: (label: string) => void;
  onFallback: (reason: string) => void;
};

const SUN_DIR = new THREE.Vector3(0.46, 1.12, 0.32).normalize();

function clonePose(pose: Pose): Pose {
  return { ...pose };
}

function sandGround(material: THREE.Material) {
  const geo = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.getAttribute("uv");
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) * 0.16, pos.getZ(i) * 0.16);
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = "sand";
  return mesh;
}

export function createWorld(options: WorldOptions): WorldHandle {
  const stats: WorldStats = {
    fps: 0,
    frameMs: 0,
    tier: options.mobile ? 1 : 0,
    dpr: 1,
    beat: "HERO",
    progress: 0,
    pose: { x: HERO_POSE.px, y: HERO_POSE.py, z: HERO_POSE.pz, tx: HERO_POSE.tx, ty: HERO_POSE.ty, tz: HERO_POSE.tz },
    renderer: "",
  };
  let disposed = false;
  let revealed = false;
  let frame = 0;
  const sfx = createSceneSfx(options.audio);
  let path: CameraPath | null = null;
  let progress = 0;
  let assembly = 0;
  let lambda = 6.2;
  let revealUntil = 0;
  let slow = 0;
  let tier = stats.tier;
  let beat = "HERO";
  let yaw = 0;
  let pitch = 0;
  let yawTarget = 0;
  let pitchTarget = 0;
  let pointerFine = false;
  const pose = clonePose(HERO_POSE);
  let target = clonePose(HERO_POSE);
  const frameTimes: number[] = [];
  let last = performance.now();
  let raf = 0;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
  } catch {
    options.onFallback("webgl-context-failed");
    return deadHandle(stats);
  }
  if (!renderer.getContext()) {
    options.onFallback("webgl-context-failed");
    return deadHandle(stats);
  }

  renderer.setClearColor(PALETTE.sand, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  // r186 folded the soft PCF kernel into PCFShadowMap. Radius is the softness.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  stats.renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(HERO_POSE.vfov, 1, 0.12, 900);
  const hemi = new THREE.HemisphereLight(0xf3eee4, 0xcbbda8, 0.46);
  const sun = new THREE.DirectionalLight(0xfff7ef, 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize(tier) || 1024, shadowMapSize(tier) || 1024);
  sun.shadow.radius = 5;
  sun.shadow.blurSamples = 8;
  sun.shadow.bias = -0.00022;
  sun.shadow.normalBias = 0.045;
  sun.shadow.camera.near = 1.5;
  sun.shadow.camera.far = 80;
  scene.add(hemi, sun, sun.target);

  const roughness = createFingerprintRoughness();
  const sand = createSandTextures();
  const clay = createClayMaterial(PALETTE.terracotta, roughness);
  const clayDeep = createClayMaterial(PALETTE.terracottaDeep, roughness);
  const dark = createClayMaterial(PALETTE.darkClay, roughness, 0.03);
  const rods = createClayMaterial(PALETTE.rods, roughness, 0.03);
  const glaze = createGlazeMaterial();
  const ground = sandGround(createGroundMaterial(sand));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(520, 28, 16), createSkyMaterial());
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  const blockout = buildBlockout({ clay, clayDeep, dark, rods, glaze, contact: createContactTexture() }, options.mobile);
  scene.add(ground, sky, blockout.group, blockout.contact);

  const envTarget = createStudioEnv(renderer);
  scene.environment = envTarget.texture;
  options.onProgress(0.12);

  function applyTier(next: QualityTier) {
    tier = next;
    stats.tier = next;
    const size = shadowMapSize(next);
    const shadows = size > 0;
    renderer.shadowMap.enabled = shadows;
    sun.castShadow = shadows;
    blockout.contact.visible = shadows && assembly > 0.4;
    blockout.castShadows(shadows);
    if (shadows && sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    resize();
  }

  function resize() {
    const width = options.canvas.clientWidth || window.innerWidth;
    const height = Math.max(1, options.canvas.clientHeight || window.innerHeight);
    const dpr = clampedDpr(window.devicePixelRatio || 1, tier);
    stats.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    applyCamera();
  }

  function applyCamera() {
    const width = Math.max(1, options.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, options.canvas.clientHeight || window.innerHeight);
    camera.fov = verticalFovForAspect(pose.vfov, width / height);
    const orbited = orbitAround([pose.px, pose.py, pose.pz], [pose.tx, pose.ty, pose.tz], yaw, pitch);
    camera.position.set(orbited[0], orbited[1], orbited[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.tx, pose.ty, pose.tz);
    camera.setViewOffset(width, height, pose.shiftX * width, pose.shiftY * height, width, height);
    const aim = sun.target.position;
    aim.set(pose.tx, pose.ty * 0.35, pose.tz);
    sun.position.copy(aim).addScaledVector(SUN_DIR, 36);
    const dist = camera.position.distanceTo(aim);
    const extent = THREE.MathUtils.clamp(dist * 0.48, 7, 24);
    const shadow = sun.shadow.camera;
    shadow.left = -extent;
    shadow.right = extent;
    shadow.top = extent;
    shadow.bottom = -extent;
    shadow.updateProjectionMatrix();
    sky.position.copy(camera.position);
  }

  function tick(now: number) {
    if (disposed) return;
    raf = window.requestAnimationFrame(tick);
    const frameMs = now - last;
    const dt = Math.min(0.05, frameMs / 1000);
    last = now;
    frame += 1;
    if (frame > 20) {
      frameTimes.push(frameMs);
      if (frameTimes.length > 60) frameTimes.shift();
      const avg = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
      stats.frameMs = avg;
      stats.fps = avg > 0 ? 1000 / avg : 0;
      // Frames slower than 80ms are stalls (compile, a software GL readback).
      // A laptop sitting between 20ms and 80ms still steps the tier down.
      if (frame > 45 && frameMs < 80) {
        const stepped = stepQuality(tier, frameMs, slow);
        slow = stepped.slow;
        if (stepped.tier !== tier) applyTier(stepped.tier);
      }
    }

    const time = path ? timeAtProgress(progress, path.duration) : 0;
    target = path && revealed ? samplePose(path, time) : clonePose(HERO_POSE);
    if (revealed && now > revealUntil) lambda = 6.4;
    pose.px = damp(pose.px, target.px, lambda, dt);
    pose.py = damp(pose.py, target.py, lambda, dt);
    pose.pz = damp(pose.pz, target.pz, lambda, dt);
    pose.tx = damp(pose.tx, target.tx, lambda, dt);
    pose.ty = damp(pose.ty, target.ty, lambda, dt);
    pose.tz = damp(pose.tz, target.tz, lambda, dt);
    pose.vfov = damp(pose.vfov, target.vfov, lambda, dt);
    pose.shiftX = damp(pose.shiftX, target.shiftX, lambda, dt);
    pose.shiftY = damp(pose.shiftY, target.shiftY, lambda, dt);
    yaw = damp(yaw, pointerFine ? yawTarget : 0, 5, dt);
    pitch = damp(pitch, pointerFine ? pitchTarget : 0, 5, dt);

    if (revealed) {
      const next = beatAt(time);
      if (next.label !== beat) {
        beat = next.label;
        stats.beat = beat;
        options.onBeat(beat);
        sfx.at(beat, { x: camera.position.x, y: camera.position.y, z: camera.position.z });
      }
    }

    blockout.setIdle(now / 1000, options.motion && revealed);
    blockout.contact.visible = tier < 2 && assembly > 0.4;
    applyCamera();
    renderer.render(scene, camera);
    stats.progress = progress;
    stats.pose = { x: camera.position.x, y: camera.position.y, z: camera.position.z, tx: pose.tx, ty: pose.ty, tz: pose.tz };
    window.__networkPerf = stats;
  }

  function onContextLost(event: Event) {
    event.preventDefault();
    if (!disposed) options.onFallback("webgl-context-lost");
  }

  options.canvas.addEventListener("webglcontextlost", onContextLost);
  window.addEventListener("resize", resize);
  const observer = new ResizeObserver(() => resize());
  observer.observe(options.canvas);
  applyTier(tier);

  void (async () => {
    try {
      const response = await fetch("/lab/network/camera-path.json");
      if (!response.ok) throw new Error(String(response.status));
      const total = Number(response.headers.get("content-length") || 0);
      const reader = response.body?.getReader();
      let json: unknown;
      if (reader && total > 0) {
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (!disposed) {
          const part = await reader.read();
          if (part.done) break;
          if (part.value) {
            chunks.push(part.value);
            received += part.value.byteLength;
            options.onProgress(0.12 + 0.7 * Math.min(1, received / total));
          }
        }
        const bytes = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        json = JSON.parse(new TextDecoder().decode(bytes));
      } else {
        json = await response.json();
        options.onProgress(0.82);
      }
      if (disposed) return;
      path = parseCameraPath(json);
      options.onProgress(0.9);
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      options.onProgress(1);
      if (!disposed) options.onReady();
    } catch {
      if (!disposed) options.onFallback("camera-path-failed");
    }
  })();

  raf = window.requestAnimationFrame(tick);

  return {
    stats,
    setProgress(next) {
      progress = Math.min(1, Math.max(0, next));
    },
    setAssembly(next) {
      assembly = Math.min(1, Math.max(0, next));
      blockout.setAssembly(assembly);
    },
    setPointer(x, y, fine) {
      pointerFine = fine && !options.mobile;
      const angles = parallaxRadians(x, y, pointerFine);
      yawTarget = angles.yaw;
      pitchTarget = angles.pitch;
    },
    reveal() {
      if (revealed) return;
      revealed = true;
      const dx = pose.px - pose.tx;
      const dy = pose.py - pose.ty;
      const dz = pose.pz - pose.tz;
      const len = Math.hypot(dx, dy, dz) || 1;
      pose.px += (dx / len) * 0.9;
      pose.py += 0.2;
      pose.pz += (dz / len) * 0.9;
      lambda = 2.15;
      revealUntil = performance.now() + 1100;
      sfx.at("HERO", { x: pose.px, y: pose.py, z: pose.pz });
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      observer.disconnect();
      options.canvas.removeEventListener("webglcontextlost", onContextLost);
      envTarget.dispose();
      roughness.dispose();
      sand.map.dispose();
      sand.normalMap.dispose();
      sand.roughnessMap.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
        else if (material) materials.add(material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      if (window.__networkPerf) delete window.__networkPerf;
    },
  };
}

function deadHandle(stats: WorldStats): WorldHandle {
  return {
    stats,
    setProgress() {},
    setAssembly() {},
    setPointer() {},
    reveal() {},
    resize() {},
    dispose() {},
  };
}

declare global {
  interface Window {
    __networkPerf?: WorldStats;
  }
}
