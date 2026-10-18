import type { SceneHandle, SceneOptions } from "./types";
import { RoundedBoxGeometry, studio, THREE, viewSize } from "./studio";

const INNER = 3.12;

function profile(u: number) {
  const width = 0.74 + 0.06 * Math.sin(u * Math.PI * 2 + 0.4);
  const depth = 0.92 + 0.05 * Math.cos(u * Math.PI * 2);
  return { width, depth };
}

function sectionOutline(bevel: number) {
  const r = bevel;
  const points: Array<[number, number]> = [];
  const corners = [
    { cx: 1 - r, cy: 1 - r, a0: 0, a1: Math.PI / 2 },
    { cx: -1 + r, cy: 1 - r, a0: Math.PI / 2, a1: Math.PI },
    { cx: -1 + r, cy: -1 + r, a0: Math.PI, a1: Math.PI * 1.5 },
    { cx: 1 - r, cy: -1 + r, a0: Math.PI * 1.5, a1: Math.PI * 2 },
  ];
  for (const corner of corners) {
    for (let step = 0; step < 4; step += 1) {
      const angle = corner.a0 + ((corner.a1 - corner.a0) * step) / 4;
      points.push([corner.cx + Math.cos(angle) * r, corner.cy + Math.sin(angle) * r]);
    }
  }
  return points;
}

function solidArch() {
  const outline = sectionOutline(0.36);
  const steps = 120;
  const count = outline.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const radial = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);

  for (let step = 0; step <= steps; step += 1) {
    const u = step / steps;
    const angle = Math.PI * u;
    const { width, depth } = profile(u);
    radial.set(Math.cos(angle), Math.sin(angle), 0);
    const center = INNER + width / 2;
    outline.forEach(([sx, sy], point) => {
      const vertex = radial.clone().multiplyScalar(center + sx * (width / 2));
      vertex.addScaledVector(zAxis, sy * (depth / 2));
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(u, point / count);
    });
  }

  const index: number[] = [];
  for (let step = 0; step < steps; step += 1) {
    for (let point = 0; point < count; point += 1) {
      const next = (point + 1) % count;
      const a = step * count + point;
      const b = step * count + next;
      const c = (step + 1) * count + point;
      const d = (step + 1) * count + next;
      index.push(a, b, c, b, d, c);
    }
  }

  const start = positions.length / 3;
  const { width: w0 } = profile(0);
  positions.push(INNER + w0 / 2, 0, 0);
  uvs.push(0, 0.5);
  for (let point = 0; point < count; point += 1) {
    index.push(start, point, (point + 1) % count);
  }
  const end = positions.length / 3;
  const { width: w1 } = profile(1);
  positions.push(-(INNER + w1 / 2), 0, 0);
  uvs.push(1, 0.5);
  const last = steps * count;
  for (let point = 0; point < count; point += 1) {
    index.push(end, last + ((point + 1) % count), last + point);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  return geometry;
}

function contactShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(128, 128, 18, 128, 128, 122);
  gradient.addColorStop(0, "rgba(48, 42, 36, 0.28)");
  gradient.addColorStop(0.55, "rgba(48, 42, 36, 0.12)");
  gradient.addColorStop(1, "rgba(48, 42, 36, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 3.6),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.renderOrder = 1;
  return mesh;
}

export async function mountBook(canvas: HTMLCanvasElement, options: SceneOptions): Promise<SceneHandle> {
  const mobile = options.mobile;
  const size = viewSize(canvas);
  let w = size.w;
  let h = size.h;
  const S = studio({
    canvas,
    w,
    h,
    mobile,
    bg: 0xf1efe9,
    floor: 0xe4dfd6,
    fog: [28, 70],
    env: 0.85,
    key: { pos: [-2, 9, 11], int: 36, angle: 0.85 },
    tone: 1.05,
    light: true,
  });
  S.setVignette(0.96);
  S.setGrain(0.008);
  S.spot.color.set(0xffe4c4);
  S.spot.penumbra = 0.9;
  S.spot.shadow.radius = 12;
  S.spot.shadow.bias = -0.0002;
  S.spot.shadow.normalBias = 0.06;
  S.rim.intensity = 0.28;
  S.rim.color.set(0xfff1e0);
  S.rim.position.set(7, 5, -6);
  const { scene, renderer } = S;
  const hemi = scene.children.find((child): child is THREE.HemisphereLight => child instanceof THREE.HemisphereLight);
  if (hemi) {
    hemi.color.set(0xf7f3eb);
    hemi.groundColor.set(0xe7e1d6);
    hemi.intensity = 1.05;
  }
  const fill = new THREE.DirectionalLight(0xf4efe6, 1.1);
  fill.position.set(8, 6, 10);
  scene.add(fill);
  const sheen = new THREE.DirectionalLight(0xffe6c6, 0.35);
  sheen.position.set(-7, 6.5, 13);
  scene.add(sheen);
  const ground = scene.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  if (ground && !Array.isArray(ground.material)) {
    const mat = ground.material as THREE.MeshStandardMaterial;
    mat.color.set(0xe7e2d8);
    mat.roughness = 0.92;
    mat.metalness = 0;
    mat.envMapIntensity = 0.15;
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.background = new THREE.Color(0xb4b2ac);
  env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 16, 24), new THREE.MeshBasicMaterial({ color: 0xb7b5af, side: THREE.BackSide })));
  const softbox = (pw: number, ph: number, x: number, y: number, z: number, color: number) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    panel.position.set(x, y, z);
    panel.lookAt(0, 1.6, 0);
    env.add(panel);
  };
  softbox(18, 10, -4, 7, 8, 0xe4dcd0);
  softbox(14, 9, 7, 4, 6, 0xc8c6c0);
  const envTarget = pmrem.fromScene(env, 0.28);
  pmrem.dispose();
  scene.environment?.dispose();
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1;

  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xc2c0ba,
    metalness: 1,
    roughness: 0.5,
    anisotropy: 0.15,
    anisotropyRotation: 0,
    envMapIntensity: 0.92,
    clearcoat: 0,
    sheen: 0,
    transmission: 0,
    transparent: false,
    opacity: 1,
  });
  const hot = new THREE.MeshPhysicalMaterial({
    color: 0xd8643e,
    metalness: 0.35,
    roughness: 0.5,
    clearcoat: 0,
    transmission: 0,
    transparent: false,
    emissive: 0xd8643e,
    emissiveIntensity: 0.04,
    envMapIntensity: 0.35,
  });

  const arc = new THREE.Group();
  const body = new THREE.Mesh(solidArch(), metal);
  body.castShadow = true;
  body.receiveShadow = false;
  arc.add(body);

  const accentU = 0.8;
  const accentAngle = Math.PI * accentU;
  const accentProfile = profile(accentU);
  const accent = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.08, accentProfile.depth * 0.62, 3, 0.016), hot);
  const accentRadius = INNER + accentProfile.width - 0.02;
  accent.position.set(Math.cos(accentAngle) * accentRadius, Math.sin(accentAngle) * accentRadius, 0);
  accent.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), accentAngle);
  accent.castShadow = true;
  accent.receiveShadow = false;
  arc.add(accent);

  const foot = new THREE.MeshPhysicalMaterial({ color: 0x2a2c2e, metalness: 0.55, roughness: 0.5, envMapIntensity: 0.25 });
  for (const sx of [-1, 1]) {
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.18, 1.05, 3, 0.03), foot);
    plinth.position.set(sx * (INNER + 0.4), 0.09, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    arc.add(plinth);
  }
  arc.position.set(0, 0.18, 0);
  arc.rotation.y = 0.75;
  scene.add(arc);

  const shadow = contactShadow();
  if (shadow) {
    shadow.rotation.z = -0.75;
    scene.add(shadow);
  }

  S.spot.target.position.set(0.2, 1.4, 0);
  const K0 = S.spot.position.clone();
  let raf = 0;
  let alive = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function frame() {
    if (mobile) S.look([-9.2, 2.7, 16.2], [-0.3, 2, 0], [0, 2, 0]);
    else S.look([-9.5, 2.6, 16.5], [-3.6, 2.6, 0], [0, 2, 0]);
    S.setAperture(0.00022);
  }
  function tick(time: number) {
    raf = 0;
    if (!alive) return;
    const sway = Math.sin(time * 0.00018) * 0.035;
    S.spot.position.set(K0.x * Math.cos(sway) - K0.z * Math.sin(sway), K0.y, K0.x * Math.sin(sway) + K0.z * Math.cos(sway));
    S.render();
    raf = window.requestAnimationFrame(tick);
  }
  frame();
  await S.settle(4);
  if (!reduced) raf = window.requestAnimationFrame(tick);

  return {
    setProgress() {},
    resize() {
      const next = viewSize(canvas);
      w = next.w;
      h = next.h;
      S.resize(w, h);
      frame();
      S.render();
    },
    anchors: () => [],
    dispose() {
      alive = false;
      window.cancelAnimationFrame(raf);
      S.dispose();
    },
  };
}
