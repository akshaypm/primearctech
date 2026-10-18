import type { SceneHandle, SceneOptions } from "./types";
import { brushedTex, RoundedBoxGeometry, studio, THREE, viewSize } from "./studio";

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
    bg: 0xe9e6df,
    floor: 0xd6d1c7,
    fog: [24, 60],
    env: 0.5,
    key: { pos: [9, 3.2, -11], int: 2600, angle: 0.35 },
    tone: 1,
    light: true,
  });
  S.setVignette(0.82);
  S.spot.color.set(0xffe9cf);
  S.spot.penumbra = 0.6;
  S.spot.shadow.radius = 3;
  S.rim.intensity = 0.3;
  const { scene, renderer } = S;
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 24, 40), new THREE.MeshBasicMaterial({ color: 0x5e5850, side: THREE.BackSide })));
  const pnl = (pw: number, ph: number, x: number, y: number, z: number, color: number, intensity: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 1.5, 0);
    env.add(m);
  };
  pnl(16, 6, 14, 4, -14, 0xffd9b0, 5);
  pnl(6, 14, 18, 6, -4, 0xffe4c6, 2.2);
  pnl(30, 30, 0, -11, 0, 0xe9e2d4, 0.9);
  pnl(14, 10, -16, 6, 12, 0xe6e8ea, 1.6);
  pnl(30, 4, 0, 14, 0, 0xf2ede4, 1);
  const pm = new THREE.PMREMGenerator(renderer);
  const envTex = pm.fromScene(env, 0.03).texture;
  pm.dispose();
  scene.environment?.dispose();
  scene.environment = envTex;
  const R = 3.1;
  const N = mobile ? 180 : 260;
  const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xd6d3cd, metalness: 1, roughness: 0.22, roughnessMap: brushedTex(), anisotropy: 0.5, envMapIntensity: 1, envMap: envTex });
  const hot = new THREE.MeshPhysicalMaterial({ color: 0xd8643e, metalness: 0.3, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, emissive: 0xd8643e, emissiveIntensity: 0.12, envMap: envTex });
  const fins = new THREE.InstancedMesh(geo, metal, N);
  fins.castShadow = fins.receiveShadow = true;
  const M = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const arc = new THREE.Group();
  const HOT = Math.round(N * 0.8);
  for (let k = 0; k < N; k += 1) {
    const u = k / (N - 1);
    const a = Math.PI * u;
    const width = 0.5 + 0.13 * Math.sin(u * Math.PI * 3 + 0.6) + 0.035 * Math.sin(u * Math.PI * 11 + 1.3);
    const depth = 0.62 + 0.1 * Math.cos(u * Math.PI * 2);
    const r = R + width / 2;
    p.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
    s.set(width, 0.021, depth);
    M.compose(p, q, s);
    if (k === HOT) {
      const h = new THREE.Mesh(geo, hot);
      const rr = R + (width + 0.16) / 2;
      h.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0);
      h.quaternion.copy(q);
      h.scale.set(width + 0.16, 0.026, depth + 0.1);
      h.castShadow = true;
      arc.add(h);
      M.makeScale(0, 0, 0);
    }
    fins.setMatrixAt(k, M);
  }
  arc.add(fins);
  const foot = new THREE.MeshPhysicalMaterial({ color: 0x2a2c2e, metalness: 0.6, roughness: 0.45 });
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.18, 1.05, 3, 0.03), foot);
    f.position.set(sx * (R + 0.42), 0.09, 0);
    f.castShadow = f.receiveShadow = true;
    arc.add(f);
  }
  arc.position.set(0, 0.18, 0);
  arc.rotation.y = 0.75;
  scene.add(arc);
  S.spot.target.position.set(0, 1.5, 0);
  const K0 = S.spot.position.clone();
  let raf = 0;
  let alive = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function frame() {
    if (mobile) S.look([-9.2, 2.7, 16.2], [-0.3, 2, 0], [0, 2, 0]);
    else S.look([-9.5, 2.6, 16.5], [-3.6, 2.6, 0], [0, 2, 0]);
    S.setAperture(0.0007);
  }
  function tick(time: number) {
    raf = 0;
    if (!alive) return;
    const a = Math.sin(time * 0.00035) * 0.22;
    S.spot.position.set(K0.x * Math.cos(a) - K0.z * Math.sin(a), K0.y, K0.x * Math.sin(a) + K0.z * Math.cos(a));
    S.render();
    raf = window.requestAnimationFrame(tick);
  }
  frame();
  await S.settle(3);
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
