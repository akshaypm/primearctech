"use client";

import { useEffect, useRef } from "react";

type SystemFieldProps = {
  /** Relative visual weight of the scene, 0.6 (calm) to 1.4 (dense). */
  intensity?: number;
  /** Extra className for the fixed container. */
  className?: string;
};

/**
 * SystemField renders a live 3D "system map": nodes joined by edges with signal
 * pulses travelling between them. It is a data/architecture motif for a studio
 * that builds AI systems, not decoration for its own sake.
 *
 * The whole Three.js runtime is loaded with a dynamic import inside an effect so
 * it never enters the server (RSC / Cloudflare Worker) bundle and only runs in
 * the browser. Honors prefers-reduced-motion by rendering a single static frame.
 */
export function SystemField({ intensity = 1, className = "" }: SystemFieldProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    if (typeof window === "undefined") return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    // Load Three.js only in the browser, after mount.
    import("three")
      .then((THREE) => {
        if (disposed || !mountRef.current) return;
        cleanup = start(THREE, mountRef.current, intensity);
      })
      .catch(() => {
        /* WebGL unavailable or import failed: leave the CSS background in place. */
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [intensity]);

  return <div ref={mountRef} className={`system-field ${className}`} aria-hidden="true" />;
}

type ThreeNS = typeof import("three");

/** Signal orange #D8643E and mineral white, in linear-ish rgb triplets. */
const ACCENT = [0.847, 0.392, 0.243] as const;
const MINERAL = [0.905, 0.898, 0.86] as const;

function start(THREE: ThreeNS, mount: HTMLElement, intensity: number): () => void {
  const prefersReduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const width = () => mount.clientWidth || window.innerWidth;
  const height = () => mount.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width(), height());
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, width() / height(), 0.1, 200);
  camera.position.set(0, 0, 34);

  const group = new THREE.Group();
  scene.add(group);

  // ---- Node cloud -----------------------------------------------------------
  const isNarrow = width() < 760;
  const nodeCount = Math.round((isNarrow ? 58 : 96) * clamp(intensity, 0.6, 1.4));
  const spread = { x: isNarrow ? 15 : 22, y: 15, z: 12 };

  const positions = new Float32Array(nodeCount * 3);
  const nodeColors = new Float32Array(nodeCount * 3);
  const nodePos: Array<[number, number, number]> = [];

  for (let i = 0; i < nodeCount; i++) {
    // Distribute in a soft rounded volume with a few denser bands so it reads
    // like an architecture graph rather than random noise.
    const x = (Math.random() * 2 - 1) * spread.x;
    const band = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    const y = (Math.random() * 2 - 1) * spread.y * 0.55 + band * spread.y * 0.32;
    const z = (Math.random() * 2 - 1) * spread.z;
    positions.set([x, y, z], i * 3);
    nodePos.push([x, y, z]);

    const accent = Math.random() < 0.22;
    const c = accent ? ACCENT : MINERAL;
    const shade = 0.55 + Math.random() * 0.45;
    nodeColors.set([c[0] * shade, c[1] * shade, c[2] * shade], i * 3);
  }

  const nodeGeom = new THREE.BufferGeometry();
  nodeGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  nodeGeom.setAttribute("color", new THREE.BufferAttribute(nodeColors, 3));

  const nodeMat = new THREE.PointsMaterial({
    size: isNarrow ? 0.5 : 0.62,
    map: makeDotTexture(THREE),
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const nodes = new THREE.Points(nodeGeom, nodeMat);
  group.add(nodes);

  // ---- Edges (nearest-neighbour connections) --------------------------------
  const edges: Array<[number, number]> = [];
  const maxDist = isNarrow ? 8.5 : 9.5;
  const maxPerNode = 3;
  const degree = new Array(nodeCount).fill(0);
  for (let i = 0; i < nodeCount; i++) {
    if (degree[i] >= maxPerNode) continue;
    // find a few near neighbours
    const candidates: Array<{ j: number; d: number }> = [];
    for (let j = i + 1; j < nodeCount; j++) {
      const d = dist(nodePos[i], nodePos[j]);
      if (d < maxDist) candidates.push({ j, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const cand of candidates) {
      if (degree[i] >= maxPerNode) break;
      if (degree[cand.j] >= maxPerNode) continue;
      edges.push([i, cand.j]);
      degree[i]++;
      degree[cand.j]++;
    }
  }

  const edgePositions = new Float32Array(edges.length * 6);
  for (let e = 0; e < edges.length; e++) {
    const [a, b] = edges[e];
    edgePositions.set(nodePos[a], e * 6);
    edgePositions.set(nodePos[b], e * 6 + 3);
  }
  const edgeGeom = new THREE.BufferGeometry();
  edgeGeom.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
  const edgeMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(MINERAL[0], MINERAL[1], MINERAL[2]),
    transparent: true,
    opacity: 0.13,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
  group.add(edgeLines);

  // ---- Signal pulses travelling along edges ---------------------------------
  const pulseCount = edges.length === 0 ? 0 : Math.min(edges.length, isNarrow ? 26 : 46);
  const pulsePositions = new Float32Array(pulseCount * 3);
  const pulses: Array<{ edge: number; t: number; speed: number }> = [];
  for (let p = 0; p < pulseCount; p++) {
    pulses.push({
      edge: Math.floor(Math.random() * edges.length),
      t: Math.random(),
      speed: 0.12 + Math.random() * 0.28,
    });
  }
  const pulseGeom = new THREE.BufferGeometry();
  pulseGeom.setAttribute("position", new THREE.BufferAttribute(pulsePositions, 3));
  const pulseMat = new THREE.PointsMaterial({
    size: isNarrow ? 0.72 : 0.9,
    map: makeDotTexture(THREE),
    color: new THREE.Color(ACCENT[0], ACCENT[1], ACCENT[2]),
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const pulsePoints = new THREE.Points(pulseGeom, pulseMat);
  group.add(pulsePoints);

  function writePulses() {
    for (let p = 0; p < pulseCount; p++) {
      const pulse = pulses[p];
      const [a, b] = edges[pulse.edge];
      const pa = nodePos[a];
      const pb = nodePos[b];
      const t = pulse.t;
      pulsePositions[p * 3] = pa[0] + (pb[0] - pa[0]) * t;
      pulsePositions[p * 3 + 1] = pa[1] + (pb[1] - pa[1]) * t;
      pulsePositions[p * 3 + 2] = pa[2] + (pb[2] - pa[2]) * t;
    }
    pulseGeom.attributes.position.needsUpdate = true;
  }
  writePulses();

  // ---- Interaction state ----------------------------------------------------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollProgress = 0;

  const onPointerMove = (event: PointerEvent) => {
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
  };
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const onResize = () => {
    renderer.setSize(width(), height());
    camera.aspect = width() / height();
    camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize, { passive: true });

  // ---- Render loop ----------------------------------------------------------
  const clock = new THREE.Clock();
  let frame = 0;
  let running = true;

  function renderFrame() {
    const elapsed = clock.getElapsedTime();

    // Ease pointer toward target for smooth parallax.
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;

    // Base rotation + scroll-driven travel through the system.
    group.rotation.y = elapsed * 0.045 + scrollProgress * Math.PI * 0.6;
    group.rotation.x = pointer.y * 0.18 - 0.05 + scrollProgress * 0.12;
    group.position.y = scrollProgress * 6 - 3;

    // Camera parallax + gentle dolly as the page scrolls.
    camera.position.x += (pointer.x * 4 - camera.position.x) * 0.05;
    camera.position.y += (-pointer.y * 2.4 - camera.position.y) * 0.05;
    camera.position.z = 34 + scrollProgress * 6;
    camera.lookAt(0, group.position.y * 0.3, 0);

    // Move signal pulses along their edges.
    for (let p = 0; p < pulseCount; p++) {
      const pulse = pulses[p];
      pulse.t += pulse.speed * 0.016;
      if (pulse.t >= 1) {
        pulse.t = 0;
        pulse.edge = Math.floor(Math.random() * edges.length);
      }
    }
    writePulses();

    // Subtle breathing on the edge opacity.
    edgeMat.opacity = 0.1 + Math.sin(elapsed * 0.6) * 0.03 + 0.05;

    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    renderFrame();
    frame = requestAnimationFrame(loop);
  }

  if (prefersReduced) {
    // Single static, composed frame. No animation, no pulse motion.
    group.rotation.y = 0.5;
    group.rotation.x = -0.08;
    renderer.render(scene, camera);
  } else {
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        clock.getDelta();
        loop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    loop();

    // Store for cleanup
    (renderer.domElement as HTMLCanvasElement & { __onVisibility?: () => void }).__onVisibility = onVisibility;
  }

  // ---- Cleanup --------------------------------------------------------------
  return () => {
    running = false;
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    const stored = (renderer.domElement as HTMLCanvasElement & { __onVisibility?: () => void }).__onVisibility;
    if (stored) document.removeEventListener("visibilitychange", stored);

    nodeGeom.dispose();
    edgeGeom.dispose();
    pulseGeom.dispose();
    nodeMat.map?.dispose();
    nodeMat.dispose();
    edgeMat.dispose();
    pulseMat.map?.dispose();
    pulseMat.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
  };
}

function makeDotTexture(THREE: ThreeNS) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function dist(a: [number, number, number], b: [number, number, number]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
