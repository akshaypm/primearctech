import type { SceneHandle, SceneOptions } from "./types";
import { RoundedBoxGeometry, studio, THREE, viewSize } from "./studio";

const INNER = 3.12;
const RIBS = 30;
const ACCENT_U = 0.8;
const BONE = 0xf1efe9;

function profile(u: number) {
  const width = 0.64 + 0.045 * Math.sin(u * Math.PI * 2 + 0.5);
  const depth = 0.8 + 0.04 * Math.cos(u * Math.PI * 2);
  return { width, depth };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

function machinedCut(u: number, sy: number) {
  const span = 0.38;
  const absSy = Math.abs(sy);
  if (absSy > span) return 0;
  const fade = 1 - smoothstep(span - 0.05, span, absSy);
  if (Math.abs(u - ACCENT_U) < 0.009 && absSy < 0.3) return 0.086 * fade;
  const phase = (u * RIBS) % 1;
  const dist = Math.abs(phase - 0.5);
  const grooveHalf = 0.22;
  if (dist > grooveHalf) return 0;
  const shoulder = grooveHalf * 0.62;
  const shape = dist < shoulder ? 1 : 1 - smoothstep(shoulder, grooveHalf, dist);
  return 0.135 * shape * fade;
}

function sectionRing(width: number, depth: number) {
  const chamfer = 0.03;
  const cx = Math.min(0.16, chamfer / (width / 2));
  const cy = Math.min(0.16, chamfer / (depth / 2));
  const points: Array<[number, number, boolean]> = [
    [1, 1 - cy, true],
    [1 - cx, 1, false],
    [-1 + cx, 1, false],
    [-1, 1 - cy, false],
    [-1, -1 + cy, false],
    [-1 + cx, -1, false],
    [1 - cx, -1, false],
    [1, -1 + cy, true],
  ];
  const segments = 8;
  for (let step = 1; step < segments; step += 1) {
    const t = step / segments;
    const sy = -1 + cy + (2 - 2 * cy) * t;
    points.push([1, sy, true]);
  }
  return points;
}

function theta(u: number) {
  const extension = 0.1;
  return -extension + (Math.PI + extension * 2) * u;
}

function place(u: number, sx: number, sy: number, outer: boolean) {
  const angle = theta(u);
  const { width, depth } = profile(u);
  const cut = outer ? machinedCut(u, sy) : 0;
  const radius = INNER + width / 2 + sx * (width / 2) - cut;
  return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, sy * (depth / 2));
}

function solidArch() {
  const steps = 240;
  const probe = sectionRing(profile(0).width, profile(0).depth);
  const count = probe.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const tangents: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];

  const add = (point: THREE.Vector3, normal: THREE.Vector3, tangent: THREE.Vector3, uv: [number, number]) => {
    const at = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    normals.push(normal.x, normal.y, normal.z);
    tangents.push(tangent.x, tangent.y, tangent.z, 1);
    uvs.push(uv[0], uv[1]);
    return at;
  };
  const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, tangent: THREE.Vector3, uv: [number, number]) => {
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0);
    else normal.normalize();
    const i0 = add(a, normal, tangent, uv);
    const i1 = add(b, normal, tangent, uv);
    const i2 = add(c, normal, tangent, uv);
    index.push(i0, i1, i2);
  };

  for (let step = 0; step < steps; step += 1) {
    const u0 = step / steps;
    const u1 = (step + 1) / steps;
    for (let point = 0; point < count; point += 1) {
      const next = (point + 1) % count;
      const [sx0, sy0, outer0] = probe[point];
      const [sx1, sy1, outer1] = probe[next];
      const a = place(u0, sx0, sy0, outer0);
      const b = place(u0, sx1, sy1, outer1);
      const c = place(u1, sx0, sy0, outer0);
      const d = place(u1, sx1, sy1, outer1);
      const tangent = c.clone().sub(a);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0);
      else tangent.normalize();
      const uv: [number, number] = [u0, point / count];
      face(a, b, c, tangent, uv);
      face(b, d, c, tangent, uv);
    }
  }

  const cap = (u: number, outward: number) => {
    const { width } = profile(u);
    const angle = theta(u);
    const center = new THREE.Vector3(Math.cos(angle) * (INNER + width / 2), Math.sin(angle) * (INNER + width / 2), 0);
    const tangent = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
    const desired = tangent.clone().multiplyScalar(outward);
    const ring = probe.map(([sx, sy, outer]) => place(u, sx, sy, outer));
    for (let point = 0; point < count; point += 1) {
      const current = ring[point];
      const next = ring[(point + 1) % count];
      const trial = current.clone().sub(center).cross(next.clone().sub(center));
      if (trial.dot(desired) >= 0) face(center, current, next, tangent, [u, 0.5]);
      else face(center, next, current, tangent, [u, 0.5]);
    }
  };
  cap(0, -1);
  cap(1, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("tangent", new THREE.Float32BufferAttribute(tangents, 4));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

function footShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(128, 128, 12, 128, 128, 118);
  gradient.addColorStop(0, "rgba(36, 34, 30, 0.38)");
  gradient.addColorStop(0.45, "rgba(36, 34, 30, 0.16)");
  gradient.addColorStop(1, "rgba(36, 34, 30, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.05, 1.7),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.012;
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
    bg: BONE,
    floor: BONE,
    fog: [80, 160],
    env: 1,
    key: { pos: [-1.5, 11, 9], int: 28, angle: 0.78 },
    tone: 1,
    light: true,
  });
  S.setVignette(1);
  S.setGrain(0);
  S.spot.color.set(0xffe7cf);
  S.spot.penumbra = 0.75;
  S.spot.shadow.radius = 8;
  S.spot.shadow.bias = -0.00025;
  S.spot.shadow.normalBias = 0.04;
  S.rim.intensity = 0.45;
  S.rim.color.set(0xffd7b8);
  S.rim.position.set(8, 3.5, -7);
  const { scene, renderer } = S;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(BONE, 1);
  scene.background = new THREE.Color(BONE);
  scene.fog = null;
  const hemi = scene.children.find((child): child is THREE.HemisphereLight => child instanceof THREE.HemisphereLight);
  if (hemi) {
    hemi.color.set(0xc5ced4);
    hemi.groundColor.set(0x3a3532);
    hemi.intensity = 0.28;
  }
  const fill = new THREE.DirectionalLight(0xd5dde2, 0.22);
  fill.position.set(7, 5, 10);
  scene.add(fill);
  const ground = scene.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  if (ground) ground.visible = false;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 18, 30), new THREE.MeshBasicMaterial({ color: 0x3c4248, side: THREE.BackSide })));
  const panel = (pw: number, ph: number, x: number, y: number, z: number, color: number, gain: number) => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(gain);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 1.5, 0);
    env.add(mesh);
  };
  panel(26, 16, 0, 7.2, 9, 0xfff6ee, 2.35);
  panel(16, 12, -8, 4.5, 7, 0xe7eef3, 1.55);
  panel(18, 8, 0, -7, 1, 0x24282c, 1);
  panel(18, 14, 0, 3, -13, 0x22262a, 1);
  panel(0.42, 12, 9, 2.6, -6, 0xffc7a4, 6);
  panel(0.42, 12, -10, 2.8, -3, 0xffc7a4, 4.5);
  const envTarget = pmrem.fromScene(env, 0.05);
  pmrem.dispose();
  scene.environment?.dispose();
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1;

  const metal = new THREE.MeshPhysicalMaterial({
    color: 0x9aa0a4,
    metalness: 1,
    roughness: 0.3,
    anisotropy: 0.28,
    anisotropyRotation: 0,
    envMapIntensity: 1,
    clearcoat: 0,
    sheen: 0,
    transmission: 0,
    transparent: false,
    opacity: 1,
  });
  const hot = new THREE.MeshPhysicalMaterial({
    color: 0xd8643e,
    metalness: 0.55,
    roughness: 0.38,
    clearcoat: 0,
    transmission: 0,
    transparent: false,
    emissive: 0xd8643e,
    emissiveIntensity: 0.03,
    envMapIntensity: 0.45,
  });

  const arc = new THREE.Group();
  const body = new THREE.Mesh(solidArch(), metal);
  body.castShadow = true;
  body.receiveShadow = false;
  arc.add(body);

  const accentAngle = theta(ACCENT_U);
  const accentProfile = profile(ACCENT_U);
  const accentThick = 0.06;
  const accentRecess = 0.007;
  const accentRadius = INNER + accentProfile.width - accentRecess - accentThick / 2;
  const accent = new THREE.Mesh(new RoundedBoxGeometry(accentThick, 0.15, accentProfile.depth * 0.3, 2, 0.004), hot);
  accent.position.set(Math.cos(accentAngle) * accentRadius, Math.sin(accentAngle) * accentRadius, 0);
  accent.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), accentAngle);
  accent.castShadow = false;
  accent.receiveShadow = false;
  arc.add(accent);

  const foot = new THREE.MeshPhysicalMaterial({ color: 0x1a1c1e, metalness: 0.35, roughness: 0.46, envMapIntensity: 0.35 });
  const collarMat = new THREE.MeshStandardMaterial({ color: 0x101214, roughness: 0.7, metalness: 0.15 });
  const footX = INNER + profile(0).width / 2;
  for (const sx of [-1, 1]) {
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.28, 1.46, 3, 0.02), foot);
    plinth.position.set(sx * footX, 0.1, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    const collar = new THREE.Mesh(new RoundedBoxGeometry(1.16, 0.024, 1.12, 2, 0.008), collarMat);
    collar.position.set(sx * footX, 0.232, 0);
    collar.castShadow = false;
    collar.receiveShadow = true;
    arc.add(plinth, collar);
    const shadow = footShadow();
    if (shadow) {
      shadow.position.x = sx * footX;
      arc.add(shadow);
    }
  }
  arc.position.set(0, 0.2, 0);
  arc.rotation.y = 0.75;
  scene.add(arc);

  S.spot.target.position.set(0, 1.2, 0);
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
