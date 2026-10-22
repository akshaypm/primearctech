import * as THREE from "three";
import {
  createClayMaterial,
  createContactTexture,
  createFingerprintRoughness,
  createGlazeMaterial,
  createGroundMaterial,
  createLatticeShadow,
  createSandTextures,
  createSkyMaterial,
  createStudioEnv,
  createTerrainMaterial,
} from "./materials";
import { loadWorldScene, type WorldScene } from "./worldScene";
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

// From the far side of the hero camera, so the cast falls across the foreground sand.
const SUN_DIR = new THREE.Vector3(-1.05, 0.32, -0.28).normalize();
const CAST_FLAT = new THREE.Vector3(-SUN_DIR.x, 0, -SUN_DIR.z).normalize();

function clonePose(pose: Pose): Pose {
  return { ...pose };
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
  THREE.ColorManagement.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // AgX keeps the brick from clipping toward orange. Neutral left these reds too saturated.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  // r186 folded the soft PCF kernel into PCFShadowMap. Radius is the softness.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  stats.renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(HERO_POSE.vfov, 1, 0.12, 900);
  const hemi = new THREE.HemisphereLight(0xf6f1e8, 0xa8988c, 0.62);
  const sun = new THREE.DirectionalLight(0xfffbf8, 1.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize(tier) || 1024, shadowMapSize(tier) || 1024);
  sun.shadow.radius = 12;
  sun.shadow.blurSamples = 8;
  sun.shadow.bias = -0.00028;
  sun.shadow.normalBias = 0.012;
  sun.shadow.camera.near = 1.5;
  sun.shadow.camera.far = 120;
  scene.add(hemi, sun, sun.target);

  const roughness = createFingerprintRoughness();
  const sand = createSandTextures();
  const clay = createClayMaterial(PALETTE.terracotta, roughness);
  const dark = createClayMaterial(PALETTE.darkClay, roughness, 0.03);
  const rods = createClayMaterial(PALETTE.rods, roughness, 0.03);
  const glaze = createGlazeMaterial();
  const bone = createClayMaterial(PALETTE.glaze, roughness, 0.08);
  const groundMaterial = createGroundMaterial(sand);
  const terrain = createTerrainMaterial(roughness);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(640, 28, 16), createSkyMaterial());
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  let world: WorldScene | null = null;
  scene.add(sky);

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
    if (world) {
      world.contact.visible = shadows && assembly > 0.35;
      world.castShadows(shadows);
    }
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
    let fov = verticalFovForAspect(pose.vfov, width / height);
    const orbited = orbitAround([pose.px, pose.py, pose.pz], [pose.tx, pose.ty, pose.tz], yaw, pitch);
    camera.position.set(orbited[0], orbited[1], orbited[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.tx, pose.ty, pose.tz);
    if (options.mobile && beat === "LAYERS") {
      // The phone fov looks into the near wall. Step toward the shaft axis and down.
      fov = Math.min(fov, 58);
      camera.position.x += (20 - camera.position.x) * 0.55;
      camera.position.z += (-28 - camera.position.z) * 0.55;
      camera.position.y -= 2.6;
      camera.lookAt(pose.tx, pose.ty, pose.tz);
    } else if (options.mobile && beat === "LOSS") {
      fov = Math.min(fov, 48);
      const dx = camera.position.x - pose.tx;
      const dy = camera.position.y - pose.ty;
      const dz = camera.position.z - pose.tz;
      const len = Math.hypot(dx, dy, dz) || 1;
      const back = 11;
      camera.position.x += (dx / len) * back;
      camera.position.y += (dy / len) * back + 1.8;
      camera.position.z += (dz / len) * back;
    }
    const shiftX = options.mobile ? pose.shiftX * 0.2 : pose.shiftX;
    const shiftY = pose.shiftY + (options.mobile && (beat === "HERO" || beat === "BOOK") ? 0.2 : 0);
    camera.fov = fov;
    camera.setViewOffset(width, height, shiftX * width, shiftY * height, width, height);
    const aim = sun.target.position;
    const shadow = sun.shadow.camera;
    const longShadow = beat === "HERO" || beat === "BOOK";
    if (longShadow) {
      // Centre the map down-shadow of the lattice so the cast reaches the sand.
      aim.set(pose.tx, 0.5, pose.tz).addScaledVector(CAST_FLAT, 8);
      sun.position.copy(aim).addScaledVector(SUN_DIR, 32);
      const extent = 22;
      shadow.left = -extent;
      shadow.right = extent;
      shadow.top = extent;
      shadow.bottom = -extent;
      shadow.near = 1;
      shadow.far = 120;
      sun.shadow.normalBias = 0.01;
      sun.shadow.bias = -0.0002;
      sun.shadow.radius = 10;
    } else {
      aim.set(pose.tx, Math.max(0.3, pose.ty * 0.35), pose.tz);
      sun.position.copy(aim).addScaledVector(SUN_DIR, 34);
      const dist = camera.position.distanceTo(aim);
      const extent = THREE.MathUtils.clamp(dist * 0.9, 10, 28);
      shadow.left = -extent;
      shadow.right = extent;
      shadow.top = extent;
      shadow.bottom = -extent;
      shadow.near = 1.2;
      shadow.far = 110;
      sun.shadow.normalBias = 0.02;
      sun.shadow.radius = 8;
    }
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
    // Rest pose is the unassembled start. After the loader, the hero hold stays assembled.
    const animTime = !revealed ? assembly * 3.5 : time < 3.5 ? 3.5 : time;
    world?.setTime(animTime);
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

    if (world) world.contact.visible = tier < 2 && assembly > 0.35;
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
            options.onProgress(0.04 + 0.16 * Math.min(1, received / total));
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
        options.onProgress(0.2);
      }
      if (disposed) return;
      path = parseCameraPath(json);
      options.onProgress(0.22);
      world = await loadWorldScene(
        { clay, dark, rods, glaze, bone, ground: groundMaterial, terrain, contact: createContactTexture() },
        (value) => options.onProgress(0.22 + value * 0.68),
      );
      if (disposed) return;
      world.contact.add(createLatticeShadow(CAST_FLAT));
      world.setAssembly(assembly);
      world.castShadows(renderer.shadowMap.enabled);
      scene.add(world.group, world.contact);
      options.onProgress(0.94);
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
      world?.setAssembly(assembly);
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
