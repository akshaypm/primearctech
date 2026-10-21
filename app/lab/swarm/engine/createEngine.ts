import gsap from "gsap";
import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import { createAudio } from "./audio";
import { DESKTOP_GRID, MOBILE_GRID, SWARM_SEED, shardsFromBake, type Shard } from "./creature";
import { frameFor, type SwarmFrame } from "./frame";
import { SPRING_C, SPRING_K } from "./motion";
import { backgroundFragment, backgroundVertex, displayFragment, displayVertex, positionShader, velocityShader } from "./shaders";
import { createSliver } from "./sliver";

export type SwarmHandle = {
  playLock: (options?: { fast?: boolean }) => void;
  setSound: (on: boolean) => void;
  dispose: () => void;
};

type Uniforms = Record<string, { value: unknown }>;

type ComputeVariable = {
  material: THREE.ShaderMaterial;
  name: string;
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

const bounds = { minX: -1.6, maxX: 1.6, minY: -0.9, maxY: 0.9 };

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
  let pressX = 0;
  let pressY = 0;
  let pulseTime = 100;
  let burstArmed = false;
  let pendingBurst = false;
  let rippleT = -1;
  let hitSent = false;
  const lock = { t: 0 };
  let lockTween: gsap.core.Tween | null = null;
  const frames: number[] = [];
  const cursor = new THREE.Vector3(40, 40, 0);
  const cursorPrev = new THREE.Vector3(40, 40, 0);
  const cursorVel = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

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
  };
  (window as unknown as { __SWARM__?: typeof stats }).__SWARM__ = stats;

  let renderer: THREE.WebGLRenderer | null = null;
  let gpu: { compute: () => void; getCurrentRenderTarget: (variable: ComputeVariable) => THREE.WebGLRenderTarget; dispose: () => void } | null = null;
  let posVar: ComputeVariable | null = null;
  let velVar: ComputeVariable | null = null;
  const disposables: { dispose: () => void }[] = [];

  const sim: Uniforms = {
    uHome: { value: null },
    uOrigin: { value: null },
    uSeam: { value: null },
    uShape: { value: null },
    uDt: { value: 0.016 },
    uMode: { value: 0 },
    uLock: { value: 0 },
    uPulse: { value: 100 },
    uBurst: { value: 0 },
    uTime: { value: 0 },
    uCursor: { value: cursor },
    uCursorVel: { value: cursorVel },
    uPointer: { value: 0 },
    uRipple: { value: new THREE.Vector3(40, 40, 0) },
    uRippleT: { value: -1 },
    uSpringK: { value: SPRING_K },
    uSpringC: { value: SPRING_C },
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(frame.fov, 1, 0.1, 40);
  const group = new THREE.Group();
  scene.add(group);
  let display: THREE.ShaderMaterial | null = null;

  function report(value: number) {
    if (!disposed) options.onProgress(Math.max(0, Math.min(1, value)));
  }

  function applyFrame(next: SwarmFrame) {
    frame = next;
    camera.fov = next.fov;
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.position.set(0, next.camY, next.camZ);
    camera.lookAt(next.lookX, next.lookY, 0);
    camera.updateProjectionMatrix();
  }

  function resize() {
    if (!renderer) return;
    const mobile = window.innerWidth < 760;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    stats.dpr = dpr;
    applyFrame(frameFor(window.innerWidth, window.innerHeight));
  }

  function overCreature(point: THREE.Vector3) {
    return point.x > bounds.minX && point.x < bounds.maxX && point.y > bounds.minY && point.y < bounds.maxY;
  }

  function updateCursor(event: PointerEvent) {
    if (!renderer) return;
    camera.updateMatrixWorld();
    const rect = options.canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    group.updateWorldMatrix(true, false);
    const worldPlane = plane.clone().applyMatrix4(group.matrixWorld);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(worldPlane, hitPoint)) return;
    group.worldToLocal(hitPoint);
    cursor.copy(hitPoint);
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
    const local = cursor.clone();
    pressing = false;
    if (event.pointerType === "touch") pointer = 0;
    if (phase !== "live" || moved > 14 || !overCreature(local)) return;
    if (event.pointerType === "touch") {
      rippleT = 0;
      (sim.uRipple.value as THREE.Vector3).copy(local);
      return;
    }
    pulseTime = 0;
    sim.uPulse.value = 0;
    burstArmed = true;
    pendingBurst = false;
    stats.pulses += 1;
  }

  function onPointerLeave() {
    if (!pressing) pointer = 0;
  }

  function fillTextures(shards: Shard[], gridX: number, gridY: number) {
    const count = gridX * gridY;
    const make = (track: boolean) => {
      const data = new Float32Array(count * 4);
      const texture = new THREE.DataTexture(data, gridX, gridY, THREE.RGBAFormat, THREE.FloatType);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.NoColorSpace;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      if (track) disposables.push(texture);
      return { data, texture };
    };
    const home = make(true);
    const origin = make(true);
    const tangent = make(true);
    const shape = make(true);
    const extra = make(true);
    const seam = make(true);
    const position = make(false);
    const velocity = make(false);
    for (let i = 0; i < count; i++) {
      const shard = shards[i];
      const o = i * 4;
      home.data[o] = shard.home[0];
      home.data[o + 1] = shard.home[1];
      home.data[o + 2] = shard.home[2];
      home.data[o + 3] = shard.seamFlag;
      origin.data[o] = shard.origin[0];
      origin.data[o + 1] = shard.origin[1];
      origin.data[o + 2] = shard.origin[2];
      origin.data[o + 3] = shard.thin;
      tangent.data[o] = shard.tangent[0];
      tangent.data[o + 1] = shard.tangent[1];
      tangent.data[o + 2] = shard.tangent[2];
      tangent.data[o + 3] = shard.length;
      shape.data[o] = shard.rough;
      shape.data[o + 1] = shard.twist;
      shape.data[o + 2] = shard.wing;
      shape.data[o + 3] = shard.delay;
      extra.data[o] = shard.normal[0];
      extra.data[o + 1] = shard.normal[1];
      extra.data[o + 2] = shard.normal[2];
      extra.data[o + 3] = shard.width;
      seam.data[o] = shard.seam[0];
      seam.data[o + 1] = shard.seam[1];
      seam.data[o + 2] = shard.seam[2];
      seam.data[o + 3] = 1;
      position.data[o] = shard.origin[0];
      position.data[o + 1] = shard.origin[1];
      position.data[o + 2] = shard.origin[2];
      position.data[o + 3] = 1;
    }
    for (const tex of [home, origin, tangent, shape, extra, seam, position, velocity]) tex.texture.needsUpdate = true;
    return { home, origin, tangent, shape, extra, seam, position, velocity };
  }

  function tick(_time: number, deltaMs: number) {
    const tickStart = performance.now();
    if (!ready || !renderer || !gpu || !posVar || !velVar || !display || disposed) return;
    const dt = deltaMs > 0 ? Math.min(0.033, deltaMs / 1000) : 0.016;
    frames.push(deltaMs > 0 ? deltaMs : 16.7);
    if (frames.length > 240) frames.shift();
    const recent = frames.slice(-60);
    const avg = recent.reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length);
    stats.fps = avg > 0 ? 1000 / avg : 0;

    const scroll = Math.min(1, Math.max(0, scrollY / Math.max(1, window.innerHeight * 0.9)));
    const eased = scroll * scroll * (3 - 2 * scroll);
    const breathe = phase === "live" ? Math.sin(_time * 0.28) : 0;
    const scale = frame.scale * (1 + breathe * 0.007);
    group.position.set(frame.x, frame.y - eased * 0.42, 0);
    group.rotation.set(eased * 0.03, frame.yaw + breathe * 0.006 + eased * 0.28, eased * -0.03);
    group.scale.set(scale * (1 + eased * 0.05), scale * (1 + eased * 0.2), scale);
    if (phase === "live") {
      const fade = 1 - Math.min(1, Math.max(0, (eased - 0.62) / 0.38)) * 0.82;
      options.canvas.style.opacity = String(fade);
    }

    const instant = cursor.clone().sub(cursorPrev).multiplyScalar(1 / dt);
    if (instant.length() > 6) instant.multiplyScalar(6 / instant.length());
    cursorVel.lerp(instant, 0.5);
    cursorPrev.copy(cursor);

    sim.uDt.value = dt;
    sim.uTime.value = _time;
    sim.uPointer.value = pointer;
    sim.uCursorVel.value = cursorVel;
    if (rippleT >= 0 && rippleT < 1.45) {
      rippleT += dt;
      sim.uRippleT.value = rippleT;
    } else {
      sim.uRippleT.value = -1;
    }
    if (pulseTime < 8) pulseTime += dt;
    sim.uPulse.value = pulseTime;
    stats.pulse = pulseTime;
    if (burstArmed && pulseTime >= 0.25) {
      pendingBurst = true;
      burstArmed = false;
      audio.hit();
    }
    sim.uBurst.value = pendingBurst ? 1 : 0;
    pendingBurst = false;

    if (phase === "lock") {
      sim.uMode.value = 0;
      sim.uLock.value = lock.t;
    } else {
      sim.uMode.value = 1;
    }

    const computeStart = performance.now();
    gpu.compute();
    const renderStart = performance.now();
    display.uniforms.uPosition.value = gpu.getCurrentRenderTarget(posVar).texture;
    display.uniforms.uVelocity.value = gpu.getCurrentRenderTarget(velVar).texture;
    renderer.render(scene, camera);
    stats.computeMs = renderStart - computeStart;
    stats.renderMs = performance.now() - renderStart;
    stats.tickMs = performance.now() - tickStart;

    if (phase === "lock" && lock.t >= 1) {
      phase = "live";
      stats.phase = "live";
      options.onLive();
    }

    if (phase === "live" && pointer > 0 && cursorVel.length() > 0.45 && overCreature(cursor)) audio.grain();
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
      ease: (t: number) => {
        const s = t * t * (3 - 2 * t);
        return s * s * (3 - 2 * s);
      },
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
    gpu?.dispose();
    for (const item of disposables) item.dispose();
    renderer?.dispose();
    renderer = null;
  }

  function onScroll() {
    scrollY = window.scrollY;
  }

  void (async () => {
    try {
      report(0.04);
      const bakePromise = fetch("/lab/swarm/falcon.bin").then(async (response) => {
        if (!response.ok) throw new Error("falcon-bake-missing");
        return response.arrayBuffer();
      });
      await document.fonts.load('400 12px "IBM Plex Mono"');
      await document.fonts.load('500 96px "General Sans"');
      const bake = await bakePromise;
      if (disposed) return;
      report(0.18);

      renderer = new THREE.WebGLRenderer({
        canvas: options.canvas,
        antialias: window.innerWidth >= 760,
        alpha: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
      });
      if (!renderer.capabilities.isWebGL2) throw new Error("webgl2-unavailable");
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setClearColor(0x111315, 1);
      renderer.autoClear = true;
      resize();
      const gl = renderer.getContext();
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      stats.renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "webgl2";

      report(0.32);
      if (disposed) return;

      const mobile = window.innerWidth < 760;
      const grid = mobile ? MOBILE_GRID : DESKTOP_GRID;
      const count = grid.x * grid.y;
      stats.count = count;
      stats.grid = `${grid.x}x${grid.y}`;
      const t0 = performance.now();
      const shards = shardsFromBake(bake, count, SWARM_SEED);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const shard of shards) {
        minX = Math.min(minX, shard.home[0]);
        maxX = Math.max(maxX, shard.home[0]);
        minY = Math.min(minY, shard.home[1]);
        maxY = Math.max(maxY, shard.home[1]);
      }
      bounds.minX = minX - 0.12;
      bounds.maxX = maxX + 0.12;
      bounds.minY = minY - 0.12;
      bounds.maxY = maxY + 0.18;
      stats.sampleMs = performance.now() - t0;
      const textures = fillTextures(shards, grid.x, grid.y);
      report(0.62);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      if (disposed) return;

      const gpuCompute = new GPUComputationRenderer(grid.x, grid.y, renderer);
      const floatOk = Boolean(gl.getExtension("EXT_color_buffer_float"));
      if (!floatOk) gpuCompute.setDataType(THREE.HalfFloatType);
      const positionVar = gpuCompute.addVariable("texturePosition", positionShader, textures.position.texture) as ComputeVariable;
      const velocityVar = gpuCompute.addVariable("textureVelocity", velocityShader, textures.velocity.texture) as ComputeVariable;
      gpuCompute.setVariableDependencies(positionVar, [positionVar, velocityVar]);
      gpuCompute.setVariableDependencies(velocityVar, [positionVar, velocityVar]);
      sim.uHome.value = textures.home.texture;
      sim.uOrigin.value = textures.origin.texture;
      sim.uSeam.value = textures.seam.texture;
      sim.uShape.value = textures.shape.texture;
      Object.assign(positionVar.material.uniforms, sim);
      Object.assign(velocityVar.material.uniforms, sim);
      const error = gpuCompute.init();
      if (error) {
        gpuCompute.dispose();
        throw new Error(error);
      }
      gpu = gpuCompute;
      posVar = positionVar;
      velVar = velocityVar;
      report(0.82);

      const top = new THREE.Color("#191c1f");
      const bottom = new THREE.Color("#111315");
      const background = new THREE.Mesh(
        new THREE.PlaneGeometry(48, 28),
        new THREE.ShaderMaterial({
          uniforms: { uTop: { value: top }, uBottom: { value: bottom } },
          vertexShader: backgroundVertex,
          fragmentShader: backgroundFragment,
          depthWrite: false,
        }),
      );
      background.position.set(0, 0.2, -3);
      background.frustumCulled = false;
      scene.add(background);
      disposables.push(background.geometry, background.material);

      display = new THREE.ShaderMaterial({
        uniforms: {
          uPosition: { value: gpu.getCurrentRenderTarget(positionVar).texture },
          uVelocity: { value: gpu.getCurrentRenderTarget(velocityVar).texture },
          uHome: sim.uHome,
          uTangent: { value: textures.tangent.texture },
          uShape: sim.uShape,
          uExtra: { value: textures.extra.texture },
          uOrigin: sim.uOrigin,
          uGrid: { value: new THREE.Vector2(grid.x, grid.y) },
          uShard: { value: mobile ? 0.17 : 0.15 },
          uGirth: { value: mobile ? 0.34 : 0.28 },
          uTime: sim.uTime,
          uMode: sim.uMode,
          uPulse: sim.uPulse,
          uOrange: { value: new THREE.Color("#D8643E") },
          uMineral: { value: new THREE.Color("#F1EFE9") },
        },
        vertexShader: displayVertex,
        fragmentShader: displayFragment,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.InstancedMesh(createSliver(), display, count);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      group.add(mesh);
      disposables.push(mesh.geometry, display);

      gpu.compute();
      renderer.compile(scene, camera);
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
