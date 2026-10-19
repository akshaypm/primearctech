import type { SceneHandle, SceneOptions } from "./types";
import { brushedTex, rnd, RoundedBoxGeometry, studio, tex, THREE, viewSize } from "./studio";

export async function mountProducts(canvas: HTMLCanvasElement, options: SceneOptions): Promise<SceneHandle> {
  const mobile = options.mobile;
  const size = viewSize(canvas);
  let w = size.w;
  let h = size.h;
  const S = studio({
    canvas,
    w,
    h,
    mobile,
    bg: 0xc9c5bd,
    floor: 0xbab5ac,
    fog: [24, 52],
    env: 0.55,
    light: true,
    key: { pos: [-5, 11, 8], int: 900, angle: 0.32 },
  });
  const { scene } = S;
  const F = mobile ? 0.74 : 1;
  S.spot.target.position.set(-2.7 * F, 0, 2.6 * F);
  S.rim.intensity = 1.6;
  S.rim.position.set(7, 5, -10);
  const spots: THREE.SpotLight[] = [S.spot];
  for (const [x0, z0, intensity] of [[1.3, -1.2, 420], [5.2, -3.8, 380]] as const) {
    const x = x0 * F;
    const z = z0 * F;
    const s = new THREE.SpotLight(0xfaf6f0, intensity, 40, 0.22, 1, 2);
    s.position.set(x - 3, 11, z + 7);
    s.target.position.set(x, 0, z);
    s.castShadow = true;
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.radius = 4;
    s.shadow.bias = -0.0002;
    scene.add(s, s.target);
    spots.push(s);
  }
  const baseInts = spots.map((s) => s.intensity);
  const bead = tex(256, () => 160 + rnd() * 70);
  bead.repeat.set(6, 6);
  const alu = new THREE.MeshPhysicalMaterial({ color: 0xdcdbd7, metalness: 0.85, roughness: 0.4, roughnessMap: bead, envMapIntensity: 1.2 });
  const polish = new THREE.MeshPhysicalMaterial({ color: 0xe4e3df, metalness: 1, roughness: 0.16, roughnessMap: brushedTex(), envMapIntensity: 1.2, clearcoat: 0.2 });
  const hot = new THREE.MeshPhysicalMaterial({ color: 0xd8643e, metalness: 0.28, roughness: 0.52, clearcoat: 0.2, clearcoatRoughness: 0.45 });
  const graphite = new THREE.MeshPhysicalMaterial({ color: 0x3a3d41, metalness: 0.6, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const cutAl = new THREE.MeshPhysicalMaterial({
    color: 0x8e8d89,
    metalness: 0.82,
    roughness: 0.56,
    roughnessMap: brushedTex(),
    anisotropy: 0.35,
    anisotropyRotation: Math.PI / 2,
    envMapIntensity: 0.4,
  });
  const sawT0 = () => {
    const t = tex(512, (i, j) => 128 + Math.sin(j * 0.9 + Math.sin(i * 0.01) * 2) * 18 + Math.sin(j * 0.21) * 8 + (rnd() * 12 - 6));
    t.repeat.set(2, 2);
    return t;
  };
  const roughMap = sawT0();
  const roughAl = new THREE.MeshPhysicalMaterial({
    color: 0xaeaca7,
    metalness: 0.5,
    roughness: 0.55,
    roughnessMap: roughMap,
    bumpMap: roughMap,
    bumpScale: 0.03,
    envMapIntensity: 0.7,
  });
  const millMap = tex(512, (_i, j) => 120 + Math.sin(j * 1.7) * 6 + (rnd() * 22 - 11));
  const mottle = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const x = c.getContext("2d");
    if (!x) return tex(4, () => 180);
    x.fillStyle = "#c4c1bb";
    x.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 260; k += 1) {
      const r = 8 + rnd() * 46;
      const gg = x.createRadialGradient(0, 0, 0, 0, 0, r);
      const v = rnd() < 0.5 ? 90 : 205;
      gg.addColorStop(0, `rgba(${v},${v - 2},${v - 6},${0.04 + rnd() * 0.07})`);
      gg.addColorStop(1, "rgba(0,0,0,0)");
      x.save();
      x.translate(rnd() * 512, rnd() * 512);
      x.scale(1, 0.35 + rnd() * 0.5);
      x.fillStyle = gg;
      x.fillRect(-r, -r, 2 * r, 2 * r);
      x.restore();
    }
    for (let j = 0; j < 512; j += 2) {
      x.fillStyle = `rgba(60,60,60,${rnd() * 0.035})`;
      x.fillRect(0, j, 512, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  const stock = new THREE.MeshPhysicalMaterial({
    color: 0xc2bfb9,
    map: mottle,
    metalness: 0.3,
    roughness: 0.74,
    roughnessMap: millMap,
    bumpMap: millMap,
    bumpScale: 0.05,
    envMapIntensity: 0.9,
  });
  const scribeM = new THREE.MeshBasicMaterial({ color: 0x2a2c2e });
  const chips = (g: THREE.Object3D, cx: number, cz: number, n: number, spread: number) => {
    const cg = new THREE.TorusGeometry(0.03, 0.007, 4, 10, Math.PI * 1.3);
    const ch = new THREE.InstancedMesh(cg, cutAl, n);
    const M2 = new THREE.Matrix4();
    const q2 = new THREE.Quaternion();
    const e2 = new THREE.Euler();
    for (let i = 0; i < n; i += 1) {
      const a = rnd() * 6.28;
      const r = spread * (0.6 + rnd() * 0.6);
      e2.set(Math.PI / 2 + (rnd() - 0.5) * 0.8, rnd() * 6, rnd() * 6);
      q2.setFromEuler(e2);
      const k = 0.6 + rnd();
      M2.compose(new THREE.Vector3(cx + Math.cos(a) * r, 0.007, cz + Math.sin(a) * r * 0.7), q2, new THREE.Vector3(k, k, k));
      ch.setMatrixAt(i, M2);
    }
    ch.castShadow = true;
    g.add(ch);
  };

  const targets = [
    new THREE.Vector3(-2.7 * F, 0.5, 2.6 * F),
    new THREE.Vector3(1.3 * F, 0.4, -1.2 * F),
    new THREE.Vector3(5 * F, 0.4, -3.6 * F),
  ];
  {
    const g = new THREE.Group();
    const prof = [[0, 0], [1.18, 0], [1.22, 0.04], [1.22, 0.3], [1.18, 0.34], [1.0, 0.36], [0, 0.36]].map((p) => new THREE.Vector2(p[0], p[1]));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), alu);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.225, 1.225, 0.06, 96, 1, true), hot);
    band.position.y = 0.12;
    g.add(band);
    const N = 72;
    const fg = new RoundedBoxGeometry(0.5, 1, 0.026, 2, 0.008);
    const fins = new THREE.InstancedMesh(fg, alu, N);
    fins.castShadow = fins.receiveShadow = true;
    const M = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < N; k += 1) {
      const a = (k / N) * Math.PI * 2;
      const finH = 0.075 + 0.012 * Math.sin(a * 3 + 0.4);
      q.setFromAxisAngle(Y, -a);
      M.compose(new THREE.Vector3(Math.cos(a) * 0.66, 0.36 + finH / 2, Math.sin(a) * 0.66), q, new THREE.Vector3(1, finH, 1));
      fins.setMatrixAt(k, M);
    }
    g.add(fins);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.12, 64), graphite);
    hub.position.y = 0.42;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.012, 12, 80), polish);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.48;
    g.add(ring, hub);
    g.position.copy(targets[0]);
    g.position.y = 0;
    g.scale.setScalar(1.25);
    g.rotation.y = 0.3;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
    });
    scene.add(g);
  }
  {
    const g = new THREE.Group();
    const BW = 2.2;
    const BD = 1.15;
    const BH = 0.62;
    const base = new THREE.Mesh(new RoundedBoxGeometry(BW, BH, BD, 5, 0.05), stock);
    base.position.y = BH / 2;
    g.add(base);
    const deck = new THREE.Mesh(new RoundedBoxGeometry(BW - 0.02, 0.05, BD - 0.02, 4, 0.02), cutAl);
    deck.position.y = BH + 0.02;
    g.add(deck);
    const bank = BW / 4;
    const fh = 0.42;
    const M = new THREE.Matrix4();
    for (let b = 0; b < 4; b += 1) {
      const x0 = -BW / 2 + b * bank + 0.04;
      const width = bank - 0.08;
      if (b < 2) {
        const n = 9;
        const fg = new RoundedBoxGeometry(0.03, 1, BD - 0.12, 3, 0.012);
        const im = new THREE.InstancedMesh(fg, cutAl, n);
        for (let k = 0; k < n; k += 1) {
          const finH = fh * (0.92 + 0.08 * Math.sin(k * 0.6 + b));
          M.makeScale(1, finH, 1);
          M.setPosition(x0 + 0.02 + (k * (width - 0.04)) / (n - 1), BH + 0.045 + finH / 2, 0);
          im.setMatrixAt(k, M);
        }
        g.add(im);
      } else if (b === 2) {
        const n = 5;
        const fg = new RoundedBoxGeometry(0.07, 1, BD - 0.12, 2, 0.01);
        const im = new THREE.InstancedMesh(fg, roughAl, n);
        for (let k = 0; k < n; k += 1) {
          const finH = fh * 0.97;
          M.makeScale(1, finH, 1);
          M.setPosition(x0 + 0.04 + (k * (width - 0.08)) / (n - 1), BH + 0.045 + finH / 2, 0);
          im.setMatrixAt(k, M);
        }
        g.add(im);
      } else {
        const blk = new THREE.Mesh(new RoundedBoxGeometry(width + 0.04, fh, BD - 0.06, 4, 0.03), stock);
        blk.position.set(x0 + width / 2, BH + 0.045 + fh / 2, 0);
        g.add(blk);
        for (let k = 0; k < 4; k += 1) {
          const l = new THREE.Mesh(new THREE.PlaneGeometry(0.004, BD - 0.12), scribeM);
          l.rotation.x = -Math.PI / 2;
          l.position.set(x0 + 0.04 + (k * (width - 0.08)) / 3, BH + 0.046 + fh + 0.001, 0);
          g.add(l);
        }
      }
    }
    chips(g, 0.2, 0.1, 70, 1.3);
    g.position.set(1.3 * F, 0, -1.2 * F);
    g.rotation.y = -0.35;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
    });
    scene.add(g);
  }
  {
    const g = new THREE.Group();
    const R0 = 0.44;
    const L = 2;
    const raw = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [R0 - 0.02, 0], [R0, 0.02], [R0, L * 0.48], [0, L * 0.48]].map((p) => new THREE.Vector2(p[0], p[1])), 64), stock);
    g.add(raw);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, L * 0.52, 48), cutAl);
    core.position.y = L * 0.48 + L * 0.26;
    g.add(core);
    const n = 11;
    for (let k = 0; k < n; k += 1) {
      const y = L * 0.5 + 0.04 + (k * (L * 0.5 - 0.08)) / (n - 1);
      const fin = new THREE.Mesh(new THREE.LatheGeometry([[0.25, -0.022], [R0 - 0.035, -0.022], [R0 - 0.02, -0.01], [R0 - 0.02, 0.01], [R0 - 0.035, 0.022], [0.25, 0.022]].map((p) => new THREE.Vector2(p[0], p[1])), 48), cutAl);
      fin.position.y = y;
      g.add(fin);
    }
    const shoulder = new THREE.Mesh(new THREE.LatheGeometry([[0.25, 0], [R0 - 0.004, 0], [R0 - 0.004, 0.01], [0.25, 0.01]].map((p) => new THREE.Vector2(p[0], p[1])), 48), cutAl);
    shoulder.position.y = L * 0.48;
    g.add(shoulder);
    const scribe = new THREE.Mesh(new THREE.CylinderGeometry(R0 + 0.0008, R0 + 0.0008, 0.005, 64, 1, true), scribeM);
    scribe.position.y = L * 0.22;
    g.add(scribe);
    g.rotation.z = Math.PI / 2;
    const wrap = new THREE.Group();
    wrap.add(g);
    g.position.set(L / 2, R0, 0);
    chips(wrap, -0.2, 0.2, 45, 1);
    wrap.position.set(5 * F, 0, -3.6 * F);
    wrap.rotation.y = 0.5 + Math.PI;
    wrap.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
    });
    scene.add(wrap);
  }

  const wide = mobile
    ? { p: new THREE.Vector3(-0.2, 6.2, 16.5), t: new THREE.Vector3(0.9, -0.5, -0.9) }
    : { p: new THREE.Vector3(-0.8, 7.6, 21), t: new THREE.Vector3(0.5, 0.4, -1) };
  const closes = [
    { p: new THREE.Vector3(-4.4 * F, 2.6, 7.2), t: targets[0].clone() },
    { p: new THREE.Vector3(0.1 * F, 3.1, 5.4), t: targets[1].clone() },
    { p: new THREE.Vector3(3.6 * F, 2.5, 2.2), t: targets[2].clone() },
  ];
  const camP = wide.p.clone();
  const camT = wide.t.clone();
  let wantP = wide.p.clone();
  let wantT = wide.t.clone();
  let hover = -1;
  let raf = 0;
  let alive = true;

  function applyCam() {
    S.look([camP.x, camP.y, camP.z], [camT.x, camT.y, camT.z], [camT.x, camT.y, camT.z]);
    S.setAperture(0.0008);
    spots.forEach((spot, i) => {
      const boost = hover === i ? 1.45 : hover === -1 ? 1 : 0.72;
      spot.intensity = baseInts[i] * boost;
    });
  }
  const api: SceneHandle = {
    setProgress() {},
    setHover(id) {
      hover = id === "c0" ? 0 : id === "c1" ? 1 : id === "c2" ? 2 : -1;
      const next = hover === -1 ? wide : closes[hover];
      wantP = next.p.clone();
      wantT = next.t.clone();
      if (!raf) raf = window.requestAnimationFrame(tick);
    },
    resize() {
      const next = viewSize(canvas);
      w = next.w;
      h = next.h;
      S.resize(w, h);
      applyCam();
      S.render();
    },
    anchors() {
      if (mobile) return [];
      return [
        { id: "c0", at: new THREE.Vector3(-2.5, 0, 4.6) },
        { id: "c1", at: new THREE.Vector3(1.4, 0, 0.2) },
        { id: "c2", at: new THREE.Vector3(5.3, 0, -2.9) },
      ].map(({ id, at }) => {
        const pr = at.project(S.camera);
        return { id, x: ((pr.x + 1) / 2) * w, y: ((1 - pr.y) / 2) * h };
      });
    },
    dispose() {
      alive = false;
      window.cancelAnimationFrame(raf);
      S.dispose();
    },
  };
  function tick() {
    raf = 0;
    if (!alive) return;
    camP.lerp(wantP, 0.08);
    camT.lerp(wantT, 0.08);
    applyCam();
    S.render();
    api.onChange?.();
    if (camP.distanceTo(wantP) > 0.02) raf = window.requestAnimationFrame(tick);
  }
  applyCam();
  await S.settle(3);
  return api;
}
