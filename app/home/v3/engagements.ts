import type { SceneHandle, SceneOptions } from "./types";
import { brushedTex, reseed, rnd, RoundedBoxGeometry, studio, tex, THREE, viewSize } from "./studio";

export async function mountEngagements(canvas: HTMLCanvasElement, options: SceneOptions): Promise<SceneHandle> {
  const mobile = options.mobile;
  const size = viewSize(canvas);
  let w = size.w;
  let h = size.h;
  const S = studio({
    canvas,
    w,
    h,
    mobile,
    bg: 0x111315,
    floor: 0x4a4c4e,
    fog: [22, 48],
    env: 1.35,
    key: { pos: [-8, 10, 7], int: 1900, angle: 0.42 },
    softbox: 1.4,
  });
  S.setVignette(0.55);
  const { scene } = S;
  reseed(21);
  const mottle = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const x = c.getContext("2d");
    if (!x) return tex(4, () => 180);
    x.fillStyle = "#ababaa";
    x.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 320; k += 1) {
      const r = 6 + rnd() * 42;
      const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      const v = rnd() < 0.55 ? 70 : 190;
      g.addColorStop(0, `rgba(${v},${v - 2},${v - 5},${0.035 + rnd() * 0.06})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.save();
      x.translate(rnd() * 512, rnd() * 512);
      x.scale(1, 0.6 + rnd() * 0.4);
      x.fillStyle = g;
      x.fillRect(-r, -r, 2 * r, 2 * r);
      x.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 1);
    return t;
  })();
  const millR = tex(256, () => 130 + rnd() * 90);
  const mill = new THREE.MeshPhysicalMaterial({
    color: 0xcfcfcd,
    map: mottle,
    metalness: 0.25,
    roughness: 0.78,
    roughnessMap: millR,
    bumpMap: millR,
    bumpScale: 0.06,
    envMapIntensity: 0.9,
  });
  const sc = document.createElement("canvas");
  sc.width = 1024;
  sc.height = 256;
  const cx = sc.getContext("2d");
  if (cx) {
    cx.fillStyle = "#a9a7a3";
    cx.fillRect(0, 0, 1024, 256);
    for (let k = 0; k < 4000; k += 1) {
      const v = rnd() < 0.5 ? 80 : 200;
      cx.fillStyle = `rgba(${v},${v},${v},.06)`;
      cx.fillRect(rnd() * 1024, rnd() * 256, 2 + rnd() * 10, 1 + rnd() * 3);
    }
    cx.strokeStyle = "rgba(60,62,64,.75)";
    cx.lineWidth = 1.4;
    for (const [a, b, c, d] of [[40, 60, 980, 60], [40, 196, 980, 196], [120, 20, 120, 236], [600, 20, 600, 236], [860, 30, 860, 226]]) {
      cx.beginPath();
      cx.moveTo(a, b);
      cx.lineTo(c, d);
      cx.stroke();
    }
  }
  const scT = new THREE.CanvasTexture(sc);
  scT.colorSpace = THREE.SRGBColorSpace;
  const millTop = mill.clone();
  millTop.map = scT;
  millTop.color.set(0xcfcfcd);
  const toolT = tex(512, (i, j) => 148 + Math.sin(j * 0.07) * 6 + Math.sin(i * 0.02) * 4 + (rnd() * 8 - 4));
  const roughM = new THREE.MeshPhysicalMaterial({
    color: 0xc4c5c6,
    metalness: 0.72,
    roughness: 0.5,
    roughnessMap: toolT,
    bumpMap: toolT,
    bumpScale: 0.015,
    envMapIntensity: 0.85,
  });
  const fine = new THREE.MeshPhysicalMaterial({
    color: 0xe4e3df,
    metalness: 0.8,
    roughness: 0.25,
    envMapIntensity: 2.2,
    roughnessMap: brushedTex(),
    anisotropy: 0.3,
    clearcoat: 0.25,
    clearcoatRoughness: 0.3,
  });
  const hot = new THREE.MeshPhysicalMaterial({ color: 0xd8643e, metalness: 0.55, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25 });
  const gra = new THREE.MeshPhysicalMaterial({ color: 0x2a2d30, metalness: 0.6, roughness: 0.45 });
  const sh = (obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
    scene.add(obj);
    return obj;
  };
  const D = 0.8;
  const bil = sh(new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.78, D, 4, 0.035), [mill, mill, millTop, mill, mill, mill])) as THREE.Mesh;
  bil.position.set(-4.95, 0.39, 0);
  (sh(new THREE.Mesh(new RoundedBoxGeometry(3.9, 0.16, D, 2, 0.015), roughM)) as THREE.Mesh).position.set(-1.1, 0.08, 0);
  const rg = new RoundedBoxGeometry(0.075, 1, D, 2, 0.012);
  const nB = 22;
  const rf = new THREE.InstancedMesh(rg, roughM, nB);
  sh(rf);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  for (let i = 0; i < nB; i += 1) {
    const x = -3 + 0.08 + i * (3.75 / nB);
    const height = 0.6 + (rnd() - 0.5) * 0.02;
    p.set(x, 0.16 + height / 2, 0);
    e.set(0, 0, 0);
    q.setFromEuler(e);
    s.set(1, height, 0.99);
    m.compose(p, q, s);
    rf.setMatrixAt(i, m);
  }
  const cg = new THREE.TorusGeometry(0.035, 0.008, 4, 10, Math.PI * 1.3);
  const nc = 110;
  const ch = new THREE.InstancedMesh(cg, fine, nc);
  sh(ch);
  for (let i = 0; i < nc; i += 1) {
    p.set(-2.9 + rnd() * 3.8, 0.008, 0.5 + rnd() * 1.3 * rnd());
    e.set(Math.PI / 2 + (rnd() - 0.5) * 0.8, rnd() * 6, rnd() * 6);
    q.setFromEuler(e);
    const k = 0.6 + rnd() * 0.9;
    s.set(k, k, k);
    m.compose(p, q, s);
    ch.setMatrixAt(i, m);
  }
  const R = 3.1;
  const X0 = 0.95;
  const nC = 118;
  const fg = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);
  const ff = new THREE.InstancedMesh(fg, fine, nC);
  sh(ff);
  for (let i = 0; i < nC; i += 1) {
    const t = i / (nC - 1);
    const a = -Math.PI / 2 + t * (Math.PI * 0.5);
    const width = 0.62 + 0.1 * Math.sin(t * Math.PI * 1.4 + 0.6) + 0.03 * Math.sin(t * Math.PI * 7 + 1.3);
    const bx = X0 + Math.cos(a) * R;
    const by = R + Math.sin(a) * R;
    const dx = -Math.cos(a);
    const dy = -Math.sin(a);
    p.set(bx + (dx * width) / 2, by + (dy * width) / 2, 0);
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a + Math.PI / 2);
    s.set(0.026, width, D * (0.95 + 0.05 * Math.cos(t * 3)));
    m.compose(p, q, s);
    if (i === Math.round(nC * 0.58)) {
      const hotM = sh(new THREE.Mesh(fg, hot)) as THREE.Mesh;
      hotM.position.copy(p);
      hotM.quaternion.copy(q);
      hotM.scale.copy(s);
      m.makeScale(0, 0, 0);
    }
    ff.setMatrixAt(i, m);
  }
  for (const z of [-0.3, 0.3]) {
    const sp = sh(new THREE.Mesh(new THREE.TorusGeometry(R - 0.012, 0.016, 16, 200, Math.PI * 0.5), fine)) as THREE.Mesh;
    sp.position.set(X0, R, z);
    sp.rotation.z = -Math.PI / 2;
  }
  const foot = sh(new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.6, D + 0.12, 3, 0.03), gra)) as THREE.Mesh;
  foot.position.set(X0 + R + 0.02, 3.2, 0);
  foot.visible = false;
  S.spot.target.position.set(0, 0, 0);

  let progress = 0.5;
  const mix = (a: number[], b: number[], t: number) => a.map((value, i) => value + ((b[i] ?? value) - value) * t);
  function frame() {
    if (mobile) S.look([-8.6, 3.4, 10.5], [-0.6, 1.0, 0], [-2, 0.6, 0]);
    else {
      const restP = [-4.4, 3.0, 19.5];
      const restT = [-1.35, 1.3, 0];
      const fromP = progress < 0.5 ? [-8.4, 3.3, 15.5] : restP;
      const toP = progress < 0.5 ? restP : [-0.6, 3.5, 15.2];
      const fromT = progress < 0.5 ? [-4.6, 0.7, 0] : restT;
      const toT = progress < 0.5 ? restT : [2.2, 1.8, 0];
      const t = progress < 0.5 ? progress / 0.5 : (progress - 0.5) / 0.5;
      S.look(mix(fromP, toP, t), mix(fromT, toT, t), [-1.6, 0.6, 0]);
    }
    S.setAperture(0.0006);
  }
  const api: SceneHandle = {
    setProgress(value) {
      progress = mobile ? 0.5 : Math.min(1, Math.max(0, value));
      frame();
      S.render();
      api.onChange?.();
    },
    resize() {
      const next = viewSize(canvas);
      w = next.w;
      h = next.h;
      S.resize(w, h);
      frame();
      S.render();
    },
    anchors() {
      if (mobile) return [];
      return [-4.95, -1.1, 2.9].map((x, index) => {
        const pr = new THREE.Vector3(x, 0, 1.3).project(S.camera);
        return {
          id: `s${index}`,
          x: Math.max(36, Math.min(w - 366, ((pr.x + 1) / 2) * w - 165)),
          y: ((1 - pr.y) / 2) * h + 56,
        };
      });
    },
    dispose: () => S.dispose(),
  };
  frame();
  await S.settle(4);
  return api;
}
