import gsap from "gsap";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { createAudio } from "./audio";
import { SWARM_SEED, maskUrlForWidth, modelUrlForWidth, mulberry32, shardCountForWidth } from "./creature";
import { createBladeMaterial, createFalconMaterial, type FalconUniforms } from "./falconMaterial";
import { frameFor, type SwarmFrame } from "./frame";
import { lockEase, SPRING_C, SPRING_K } from "./motion";
import { backgroundFragment, backgroundVertex } from "./shaders";
import { createSliver } from "./sliver";

export type SwarmHandle = {
  playLock: (options?: { fast?: boolean }) => void;
  setSound: (on: boolean) => void;
  dispose: () => void;
};

type Options = {
  canvas: HTMLCanvasElement;
  sound: boolean;
  onProgress: (value: number) => void;
  onReady: () => void;
  onLockStart: () => void;
  onLive: () => void;
  onFallback: (reason: string) => void;
};

const UP = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _normal = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _preferred = new THREE.Vector3();
const _sample = new THREE.Vector3();
const _localCursor = new THREE.Vector3();
const _cursorDelta = new THREE.Vector3();

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function compose(out: Float32Array, offset: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number, qw: number, sx: number, sy: number, sz: number) {
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;
  const o = offset;
  out[o] = (1 - (yy + zz)) * sx;
  out[o + 1] = (xy + wz) * sx;
  out[o + 2] = (xz - wy) * sx;
  out[o + 3] = 0;
  out[o + 4] = (xy - wz) * sy;
  out[o + 5] = (1 - (xx + zz)) * sy;
  out[o + 6] = (yz + wx) * sy;
  out[o + 7] = 0;
  out[o + 8] = (xz + wy) * sz;
  out[o + 9] = (yz - wx) * sz;
  out[o + 10] = (1 - (xx + yy)) * sz;
  out[o + 11] = 0;
  out[o + 12] = px;
  out[o + 13] = py;
  out[o + 14] = pz;
  out[o + 15] = 1;
}

const _swirl = { x: 0, y: 0, z: 0 };

function swirl(x: number, y: number, z: number, time: number) {
  const a = time * 1.35 + x * 2.4 + y * 1.6;
  const b = time * 1.05 + z * 2.2 - x * 1.1;
  _swirl.x = Math.sin(a);
  _swirl.y = Math.cos(a + b);
  _swirl.z = Math.sin(b + y * 2.0);
}

export function createEngine(options: Options): SwarmHandle {
  const audio = createAudio();
  audio.setEnabled(options.sound);
  let disposed = false;
  let ready = false;
  let phase: "boot" | "lock" | "live" = "boot";
  let queued: { fast?: boolean } | null = null;
  let frame = frameFor(window.innerWidth, window.innerHeight);
  let scrollY = window.scrollY;
  let pointer = 0;
  let pressing = false;
  let hovering = false;
  let pressX = 0;
  let pressY = 0;
  let burstT = -1;
  let burstSnap = false;
  let rippleT = -1;
  let radius = 0;
  let hitSent = false;
  const lock = { t: 0 };
  let lockTween: gsap.core.Tween | null = null;
  const frames: number[] = [];
  const cursorWorld = new THREE.Vector3(80, 80, 80);
  const cursorPrev = new THREE.Vector3(80, 80, 80);
  const cursorVel = new THREE.Vector3();
  const rippleAt = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const aimPoint = new THREE.Vector3();

  const stats = {
    phase: "boot",
    count: 0,
    dpr: 1,
    grid: "",
    renderer: "",
    frames,
    fps: 0,
    sampleMs: 0,
    error: "",
    pulses: 0,
    computeMs: 0,
    renderMs: 0,
    tickMs: 0,
    pulse: 100,
    tris: 0,
    aim: { x: 0, y: 0 },
  };
  (window as unknown as { __SWARM__?: typeof stats }).__SWARM__ = stats;

  let renderer: THREE.WebGLRenderer | null = null;
  let falcon: THREE.Mesh | null = null;
  let blades: THREE.InstancedMesh | null = null;
  let uniforms: FalconUniforms | null = null;
  let bladeCount = 0;
  let home = new Float32Array(0);
  let normal = new Float32Array(0);
  let pos = new Float32Array(0);
  let vel = new Float32Array(0);
  let quat = new Float32Array(0);
  let seed = new Float32Array(0);
  let origin = new Float32Array(0);
  let scaleY = new Float32Array(0);
  const disposables: { dispose: () => void }[] = [];

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(frame.fov, 1, 0.08, 40);
  const group = new THREE.Group();
  scene.add(group);
  scene.add(camera);
  let backgroundMat: THREE.ShaderMaterial | null = null;

  function report(value: number) {
    if (!disposed) options.onProgress(Math.max(0, Math.min(1, value)));
  }

  function applyFrame(next: SwarmFrame) {
    frame = next;
    camera.fov = next.fov;
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    if (backgroundMat && renderer) {
      const portrait = window.innerWidth / Math.max(1, window.innerHeight) < 0.92;
      backgroundMat.uniforms.uCenter.value.set(portrait ? 0.5 : 0.72, portrait ? 0.72 : 0.52);
      backgroundMat.uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
    }
  }

  function resize() {
    if (!renderer) return;
    const mobile = window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    stats.dpr = dpr;
    applyFrame(frameFor(window.innerWidth, window.innerHeight));
  }

  function updateCursor(event: PointerEvent) {
    if (!renderer || !falcon) return;
    const rect = options.canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    camera.updateMatrixWorld();
    group.updateWorldMatrix(true, true);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(falcon, false);
    hovering = hits.length > 0;
    if (hits[0]) cursorWorld.copy(hits[0].point);
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === "touch" && !pressing) return;
    updateCursor(event);
    pointer = 1;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pressing = true;
    pressX = event.clientX;
    pressY = event.clientY;
    updateCursor(event);
    pointer = 1;
  }

  function onPointerUp(event: PointerEvent) {
    const moved = Math.hypot(event.clientX - pressX, event.clientY - pressY);
    const hit = hovering;
    pressing = false;
    if (event.pointerType === "touch") pointer = 0;
    if (phase !== "live" || moved > 14 || !hit) return;
    if (event.pointerType === "touch") {
      rippleT = 0;
      group.updateWorldMatrix(true, false);
      _localCursor.copy(cursorWorld);
      group.worldToLocal(_localCursor);
      rippleAt.copy(_localCursor);
      return;
    }
    burstT = 0;
    burstSnap = true;
    stats.pulses += 1;
    audio.hit();
  }

  function onPointerLeave() {
    if (!pressing) {
      pointer = 0;
      hovering = false;
    }
  }

  function writeBlade(slot: number, index: number, px: number, py: number, pz: number, s: number) {
    if (!blades) return;
    const q = index * 4;
    compose(
      blades.instanceMatrix.array as Float32Array,
      slot * 16,
      px,
      py,
      pz,
      quat[q],
      quat[q + 1],
      quat[q + 2],
      quat[q + 3],
      0.16 * s,
      scaleY[index] * s,
      0.07 * s,
    );
  }

  function springTo(index: number, tx: number, ty: number, tz: number, dt: number) {
    const o = index * 3;
    let vx = vel[o];
    let vy = vel[o + 1];
    let vz = vel[o + 2];
    let px = pos[o];
    let py = pos[o + 1];
    let pz = pos[o + 2];
    vx += (SPRING_K * (tx - px) - SPRING_C * vx) * dt;
    vy += (SPRING_K * (ty - py) - SPRING_C * vy) * dt;
    vz += (SPRING_K * (tz - pz) - SPRING_C * vz) * dt;
    pos[o] = px + vx * dt;
    pos[o + 1] = py + vy * dt;
    pos[o + 2] = pz + vz * dt;
    vel[o] = vx;
    vel[o + 1] = vy;
    vel[o + 2] = vz;
  }

  function placeCamera(time: number) {
    const live = phase === "live" ? 1 : 0;
    const driftX = Math.sin(time * 0.15) * 0.045 * live;
    const driftY = Math.sin(time * 0.11) * 0.028 * live;
    camera.position.set(driftX, frame.camY + driftY, frame.camZ);
    camera.lookAt(frame.lookX, frame.lookY, 0);
    const bob = Math.sin(time * 0.6) * 0.028 * live;
    const scroll = Math.min(1, Math.max(0, scrollY / Math.max(1, window.innerHeight * 0.9)));
    const eased = scroll * scroll * (3 - 2 * scroll);
    group.position.set(frame.x, frame.y + bob - eased * 0.5, 0);
    group.rotation.set(0, frame.yaw, 0);
    group.scale.setScalar(frame.scale);
    if (phase === "live") {
      const fade = 1 - Math.min(1, Math.max(0, (eased - 0.62) / 0.38)) * 0.82;
      options.canvas.style.opacity = String(fade);
    }
    group.updateWorldMatrix(true, false);
    aimPoint.set(frame.x, frame.y + bob, 0);
    aimPoint.project(camera);
    stats.aim.x = (aimPoint.x * 0.5 + 0.5) * window.innerWidth;
    stats.aim.y = (-aimPoint.y * 0.5 + 0.5) * window.innerHeight;
  }

  function simulate(dt: number, time: number) {
    if (!blades || !uniforms || bladeCount === 0) return;
    group.updateWorldMatrix(true, false);
    _localCursor.copy(cursorWorld);
    group.worldToLocal(_localCursor);
    const bursting = burstT >= 0;
    const locking = phase === "lock";
    if (phase === "live" && !bursting && rippleT < 0 && radius < 0.02 && blades.count === 0) {
      uniforms.uFade.value = 1;
      uniforms.uRadius.value = 0;
      uniforms.uTime.value = time;
      if (falcon) falcon.visible = true;
      return;
    }
    const localRadius = radius / Math.max(0.001, group.scale.x);
    let shown = 0;

    if (bursting && burstT < 2.4) burstT += dt;
    if (rippleT >= 0 && rippleT < 1.4) rippleT += dt;
    else rippleT = -1;

    for (let i = 0; i < bladeCount; i++) {
      const o = i * 3;
      const hx = home[o];
      const hy = home[o + 1];
      const hz = home[o + 2];
      const nx = normal[o];
      const ny = normal[o + 1];
      const nz = normal[o + 2];
      let show = 0;
      let px = hx;
      let py = hy;
      let pz = hz;

      if (locking) {
        const delay = seed[i] * 0.34;
        const local = Math.min(1, Math.max(0, (lock.t - delay) / 0.72));
        const eased = lockEase(local);
        const ox = origin[o];
        const oy = origin[o + 1];
        const oz = origin[o + 2];
        px = ox + (hx - ox) * eased;
        py = oy + (hy - oy) * eased;
        pz = oz + (hz - oz) * eased;
        pos[o] = px;
        pos[o + 1] = py;
        pos[o + 2] = pz;
        vel[o] = 0;
        vel[o + 1] = 0;
        vel[o + 2] = 0;
        show = 1 - smoothstep(0.84, 1, lock.t);
      } else if (bursting && burstT < 2.2) {
        swirl(hx, hy, hz, time + seed[i] * 2);
        let tx = hx;
        let ty = hy;
        let tz = hz;
        if (burstT < 0.6) {
          const lift = 0.07 + seed[i] * 0.06;
          tx = hx + nx * lift + _swirl.x * 0.08;
          ty = hy + ny * lift + _swirl.y * 0.08;
          tz = hz + nz * lift + _swirl.z * 0.08;
        }
        if (burstSnap) {
          pos[o] = tx;
          pos[o + 1] = ty;
          pos[o + 2] = tz;
          vel[o] = _swirl.x * 0.35;
          vel[o + 1] = _swirl.y * 0.35;
          vel[o + 2] = _swirl.z * 0.35;
        }
        springTo(i, tx, ty, tz, dt);
        px = pos[o];
        py = pos[o + 1];
        pz = pos[o + 2];
        show = burstT < 1.15 ? 1 : 1 - smoothstep(1.15, 1.7, burstT);
      } else {
        const dx = hx - _localCursor.x;
        const dy = hy - _localCursor.y;
        const dz = hz - _localCursor.z;
        const dist = Math.hypot(dx, dy, dz);
        const inside = hovering && localRadius > 0.03 && dist < localRadius + 0.08;
        let tx = hx;
        let ty = hy;
        let tz = hz;
        if (inside) {
          swirl(hx, hy, hz, time + seed[i] * 3);
          const influence = 1 - smoothstep(localRadius * 0.35, localRadius + 0.06, dist);
          const lift = (0.1 + seed[i] * 0.1) * influence;
          tx = hx + nx * lift + _swirl.x * 0.11 * influence;
          ty = hy + ny * lift + _swirl.y * 0.11 * influence;
          tz = hz + nz * lift + _swirl.z * 0.11 * influence;
          const speed = Math.hypot(vel[o], vel[o + 1], vel[o + 2]);
          if (speed < 0.08 && Math.hypot(pos[o] - hx, pos[o + 1] - hy, pos[o + 2] - hz) < 0.02) {
            vel[o] += nx * 0.85;
            vel[o + 1] += ny * 0.85;
            vel[o + 2] += nz * 0.85;
          }
        }
        if (rippleT >= 0) {
          const rd = Math.hypot(hx - rippleAt.x, hy - rippleAt.y, hz - rippleAt.z);
          const ring = rippleT * 1.5;
          const band = Math.exp(-((rd - ring) * (rd - ring)) / 0.02);
          tx += nx * band * 0.16;
          ty += ny * band * 0.16;
          tz += nz * band * 0.16;
        }
        springTo(i, tx, ty, tz, dt);
        px = pos[o];
        py = pos[o + 1];
        pz = pos[o + 2];
        const off = Math.hypot(px - hx, py - hy, pz - hz);
        show = off > 0.008 || inside || rippleT >= 0 ? 1 : 0;
      }

      if (show > 0.02) {
        writeBlade(shown, i, px, py, pz, show);
        shown += 1;
      }
    }

    burstSnap = false;
    if (burstT > 2.2) burstT = -1;
    blades.count = shown;
    blades.instanceMatrix.needsUpdate = shown > 0;

    const fade = locking ? smoothstep(0.58, 0.96, lock.t) : bursting && burstT >= 0 ? (burstT < 0.7 ? 0 : smoothstep(0.85, 1.45, burstT)) : 1;
    uniforms.uFade.value = fade;
    uniforms.uTime.value = time;
    uniforms.uRadius.value = phase === "live" && burstT < 0 ? radius : 0;
    uniforms.uCursor.value.copy(cursorWorld);
    if (falcon) falcon.visible = fade > 0.02;
  }

  function tick(time: number, deltaMs: number) {
    const tickStart = performance.now();
    if (!ready || !renderer || disposed) return;
    const dt = deltaMs > 0 ? Math.min(0.033, deltaMs / 1000) : 0.016;
    frames.push(deltaMs > 0 ? deltaMs : 16.7);
    if (frames.length > 240) frames.shift();
    const recent = frames.slice(-60);
    const avg = recent.reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length);
    stats.fps = avg > 0 ? 1000 / avg : 0;
    placeCamera(time);
    _cursorDelta.subVectors(cursorWorld, cursorPrev).multiplyScalar(1 / dt);
    const instant = _cursorDelta;
    if (instant.length() > 8) instant.multiplyScalar(8 / instant.length());
    cursorVel.lerp(instant, 0.45);
    cursorPrev.copy(cursorWorld);

    const radiusTarget = phase === "live" && hovering && burstT < 0 ? 0.42 * (frame.scale / 0.74) : 0;
    const rate = radiusTarget > radius ? 12 : 2.4;
    radius += (radiusTarget - radius) * (1 - Math.exp(-dt * rate));

    const computeStart = performance.now();
    simulate(dt, time);
    const renderStart = performance.now();
    renderer.render(scene, camera);
    stats.computeMs = renderStart - computeStart;
    stats.renderMs = performance.now() - renderStart;
    stats.tickMs = performance.now() - tickStart;
    stats.pulse = burstT >= 0 ? burstT : 100;

    if (phase === "lock" && lock.t >= 1) {
      phase = "live";
      stats.phase = "live";
      if (uniforms) uniforms.uFade.value = 1;
      if (falcon) falcon.visible = true;
      options.onLive();
    }

    if (phase === "live" && pointer > 0 && hovering && cursorVel.length() > 0.35) audio.grain();
  }

  function startLock(fast?: boolean) {
    if (phase !== "boot") return;
    phase = "lock";
    stats.phase = "lock";
    hitSent = false;
    lock.t = 0;
    lockTween?.kill();
    lockTween = gsap.to(lock, {
      t: 1,
      duration: fast ? 0.46 : 1.12,
      ease: "none",
      onUpdate: () => {
        if (!hitSent && lock.t >= 0.9) {
          hitSent = true;
          audio.hit();
          audio.stopHum();
        }
      },
    });
    options.onLockStart();
  }

  function onScroll() {
    scrollY = window.scrollY;
  }

  function cleanup() {
    disposed = true;
    gsap.ticker.remove(tick);
    lockTween?.kill();
    window.removeEventListener("scroll", onScroll);
    options.canvas.removeEventListener("pointermove", onPointerMove);
    options.canvas.removeEventListener("pointerdown", onPointerDown);
    options.canvas.removeEventListener("pointerup", onPointerUp);
    options.canvas.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("resize", resize);
    audio.dispose();
    for (const item of disposables) item.dispose();
    renderer?.dispose();
    renderer = null;
  }

  function sampleBlades(geometry: THREE.BufferGeometry, count: number) {
    const carrier = new THREE.Mesh(geometry);
    const sampler = new MeshSurfaceSampler(carrier).setRandomGenerator(mulberry32(SWARM_SEED)).build();
    home = new Float32Array(count * 3);
    normal = new Float32Array(count * 3);
    pos = new Float32Array(count * 3);
    vel = new Float32Array(count * 3);
    quat = new Float32Array(count * 4);
    seed = new Float32Array(count);
    origin = new Float32Array(count * 3);
    scaleY = new Float32Array(count);
    const rng = mulberry32(SWARM_SEED + 3);
    for (let i = 0; i < count; i++) {
      sampler.sample(_sample, _normal);
      if (_normal.lengthSq() < 1e-8) _normal.set(0, 1, 0);
      _normal.normalize();
      _preferred.set(0, _sample.y, _sample.z);
      if (_preferred.lengthSq() < 0.04) _preferred.set(0.65, _sample.y, _sample.z);
      _preferred.addScaledVector(_normal, -_preferred.dot(_normal));
      if (_preferred.lengthSq() < 1e-6) _preferred.crossVectors(_normal, UP);
      _preferred.normalize();
      _tangent.crossVectors(_normal, _preferred).multiplyScalar((rng() - 0.5) * 0.4);
      _preferred.add(_tangent).normalize();
      _quat.setFromUnitVectors(UP, _preferred);
      const o = i * 3;
      home[o] = _sample.x;
      home[o + 1] = _sample.y;
      home[o + 2] = _sample.z;
      normal[o] = _normal.x;
      normal[o + 1] = _normal.y;
      normal[o + 2] = _normal.z;
      pos[o] = _sample.x;
      pos[o + 1] = _sample.y;
      pos[o + 2] = _sample.z;
      const q = i * 4;
      quat[q] = _quat.x;
      quat[q + 1] = _quat.y;
      quat[q + 2] = _quat.z;
      quat[q + 3] = _quat.w;
      seed[i] = rng();
      scaleY[i] = 0.08 + rng() * 0.045;
      const fromRight = rng() < 0.72;
      origin[o] = fromRight ? 3.4 + rng() * 2.4 : (rng() - 0.2) * 3.2;
      origin[o + 1] = fromRight ? (rng() - 0.45) * 2.6 : 2.6 + rng() * 1.8;
      origin[o + 2] = (rng() - 0.5) * 1.8;
    }
    bladeCount = count;
  }

  void (async () => {
    try {
      report(0.04);
      const mobile = window.innerWidth < 768;
      const url = modelUrlForWidth(window.innerWidth);
      const draco = new DRACOLoader();
      draco.setDecoderPath("/lab/swarm/draco/");
      const hooked = draco as DRACOLoader & {
        workerSourceURL: string;
        decoderPending: Promise<void> | null;
        _initDecoder: () => Promise<void>;
      };
      hooked._initDecoder = function () {
        this.workerSourceURL = "/lab/swarm/draco/draco-worker.js";
        this.decoderPending = Promise.resolve();
        return this.decoderPending;
      };
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      const maskTexture = new THREE.TextureLoader().load(maskUrlForWidth(window.innerWidth));
      maskTexture.colorSpace = THREE.SRGBColorSpace;
      maskTexture.flipY = false;
      maskTexture.wrapS = THREE.ClampToEdgeWrapping;
      maskTexture.wrapT = THREE.ClampToEdgeWrapping;
      loader.register(() => ({
        name: "FALCON_MASK",
        loadTexture: () => Promise.resolve(maskTexture),
      }));
      const gltfPromise = loader.loadAsync(url);
      await document.fonts.load('400 12px "IBM Plex Mono"');
      await document.fonts.load('500 96px "General Sans"');
      if (disposed) return;

      renderer = new THREE.WebGLRenderer({
        canvas: options.canvas,
        antialias: !mobile,
        alpha: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
      });
      if (!renderer.capabilities.isWebGL2) throw new Error("webgl2-unavailable");
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1.02;
      renderer.setClearColor(0x111315, 1);
      resize();
      const gl = renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      stats.renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "webgl2";
      report(0.16);

      const gltf = await gltfPromise;
      if (disposed) return;
      report(0.4);
      gltf.scene.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      gltf.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) meshes.push(mesh);
      });
      const sourceMesh = meshes[0];
      if (!sourceMesh) throw new Error("falcon-mesh-missing");
      const geometry = sourceMesh.geometry.clone();
      geometry.applyMatrix4(sourceMesh.matrixWorld);
      if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      const sourceMaterial = Array.isArray(sourceMesh.material) ? sourceMesh.material[0] : sourceMesh.material;
      const map = (sourceMaterial as THREE.MeshStandardMaterial).map ?? null;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.needsUpdate = true;
      }
      sourceMaterial.dispose();

      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      const envMap = pmrem.fromScene(room, 0.04).texture;
      scene.environment = envMap;
      scene.environmentIntensity = 1.05;
      pmrem.dispose();
      room.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
      });
      disposables.push(envMap, draco);

      const key = new THREE.DirectionalLight(0xfff7f0, 3.4);
      key.position.set(-6, 8, 5);
      const rim = new THREE.DirectionalLight(0xd5deea, 2.4);
      rim.position.set(2.5, 3.5, -6);
      const fill = new THREE.DirectionalLight(0xf4f7fb, 0.85);
      fill.position.set(5, 1.5, 4);
      scene.add(key, rim, fill);

      const built = createFalconMaterial(map, envMap);
      uniforms = built.uniforms;
      falcon = new THREE.Mesh(geometry, built.material);
      falcon.frustumCulled = false;
      falcon.visible = false;
      group.add(falcon);
      disposables.push(geometry, built.material);
      if (map) disposables.push(map);

      const index = geometry.index;
      stats.tris = index ? index.count / 3 : geometry.getAttribute("position").count / 3;
      const count = shardCountForWidth(window.innerWidth);
      stats.count = count;
      stats.grid = mobile ? `mobile-${count}` : `web-${count}`;
      const t0 = performance.now();
      sampleBlades(geometry, count);
      stats.sampleMs = performance.now() - t0;
      report(0.72);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      if (disposed) return;

      const bladeMaterial = createBladeMaterial(envMap);
      blades = new THREE.InstancedMesh(createSliver(), bladeMaterial, count);
      blades.count = 0;
      blades.frustumCulled = false;
      blades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(blades);
      disposables.push(blades.geometry, bladeMaterial);

      const background = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 24),
        new THREE.ShaderMaterial({
          uniforms: {
            uInk: { value: new THREE.Color("#111315") },
            uLift: { value: new THREE.Color("#191C1F") },
            uResolution: { value: new THREE.Vector2(renderer.domElement.width, renderer.domElement.height) },
            uCenter: { value: new THREE.Vector2(0.72, 0.52) },
          },
          vertexShader: backgroundVertex,
          fragmentShader: backgroundFragment,
          depthWrite: false,
          depthTest: false,
        }),
      );
      backgroundMat = background.material as THREE.ShaderMaterial;
      background.position.set(0, 0, -8);
      background.renderOrder = -1;
      background.frustumCulled = false;
      camera.add(background);
      disposables.push(background.geometry, background.material);
      applyFrame(frame);
      report(0.88);

      renderer.compile(scene, camera);
      placeCamera(0);
      renderer.render(scene, camera);
      report(1);
      if (disposed) return;

      ready = true;
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", resize);
      options.canvas.addEventListener("pointermove", onPointerMove);
      options.canvas.addEventListener("pointerdown", onPointerDown);
      options.canvas.addEventListener("pointerup", onPointerUp);
      options.canvas.addEventListener("pointerleave", onPointerLeave);
      gsap.ticker.add(tick);
      options.onReady();
      if (queued) startLock(queued.fast);
    } catch (error) {
      stats.error = error instanceof Error ? error.message : "webgl-failed";
      if (!disposed) options.onFallback(stats.error);
      cleanup();
    }
  })();

  return {
    playLock(opts) {
      if (!ready) {
        queued = opts ?? {};
        return;
      }
      startLock(opts?.fast);
    },
    setSound(on) {
      audio.setEnabled(on);
      if (on && (phase === "boot" || phase === "lock")) audio.startHum();
    },
    dispose() {
      if (!disposed) cleanup();
    },
  };
}
