import type { SceneHandle, SceneOptions } from "./types";
import { brushedTex, rnd, RoundedBoxGeometry, studio, tex, THREE, viewSize } from "./studio";

function localRng(start: number) {
  let s = start;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function variedSteel() {
  const n = localRng(19);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const x = canvas.getContext("2d");
  if (!x) return tex(4, () => 160);
  x.fillStyle = "#b7b9bb";
  x.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 28; k += 1) {
    const y = n() * 512;
    const tone = 90 + n() * 90;
    x.fillStyle = `rgba(${tone},${tone + 2},${tone + 4},${0.08 + n() * 0.12})`;
    x.fillRect(0, y, 512, 6 + n() * 28);
  }
  for (let k = 0; k < 80; k += 1) {
    const r = 18 + n() * 70;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    const v = n() < 0.5 ? 70 : 190;
    g.addColorStop(0, `rgba(${v},${v},${v + 6},${0.08 + n() * 0.1})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.save();
    x.translate(n() * 512, n() * 512);
    x.scale(1.4, 0.45);
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  const image = x.getImageData(0, 0, 512, 512);
  for (let i = 0; i < image.data.length; i += 4) {
    const j = (i / 4) | 0;
    const row = (j / 512) | 0;
    const grain = Math.sin(row * 0.85) * 10 + (n() * 16 - 8);
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + grain));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + grain));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + grain - 2));
  }
  x.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function mountFit(canvas: HTMLCanvasElement, options: SceneOptions): Promise<SceneHandle> {
  const mobile = options.mobile;
  const size = viewSize(canvas);
  let w = size.w;
  let h = size.h;
  const S = studio({
    canvas,
    w,
    h,
    mobile,
    bg: 0xa29f98,
    floor: 0x96928b,
    fog: [26, 60],
    env: 0.75,
    light: true,
    key: { pos: [-4, 13, 6], int: 1300, angle: 0.32 },
  });
  S.setVignette(0.72);
  S.rim.intensity = 2.2;
  S.rim.position.set(5, 4, -7);
  const { scene } = S;
  const brush = brushedTex();
  const steelMap = variedSteel();
  const steel = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: steelMap,
    metalness: 1,
    roughness: 0.38,
    roughnessMap: steelMap,
    bumpMap: steelMap,
    bumpScale: 0.07,
    anisotropy: 0.75,
    envMapIntensity: 0.95,
  });
  const ground2 = tex(512, (i) => 150 + Math.sin(i * 2.3) * 8 + (rnd() * 40 - 20));
  const steelG = new THREE.MeshPhysicalMaterial({ color: 0x8e9194, metalness: 1, roughness: 0.42, roughnessMap: ground2, envMapIntensity: 1 });
  const alu = new THREE.MeshPhysicalMaterial({ color: 0xd9d8d4, metalness: 1, roughness: 0.28, roughnessMap: brush, envMapIntensity: 1.1 });
  const hot = new THREE.MeshPhysicalMaterial({ color: 0xd8643e, metalness: 0.4, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const mottle = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const x = c.getContext("2d");
    if (!x) return tex(4, () => 80);
    x.fillStyle = "#5f5f5e";
    x.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 300; k += 1) {
      const r = 6 + rnd() * 40;
      const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      const v = rnd() < 0.6 ? 35 : 105;
      g.addColorStop(0, `rgba(${v},${v - 3},${v - 8},${0.08 + rnd() * 0.12})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.save();
      x.translate(rnd() * 512, rnd() * 512);
      x.scale(1, 0.4 + rnd() * 0.6);
      x.fillStyle = g;
      x.fillRect(-r, -r, 2 * r, 2 * r);
      x.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const scale = tex(256, () => 110 + rnd() * 130);
  const rough = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: mottle, metalness: 0.35, roughness: 0.8, roughnessMap: scale, bumpMap: scale, bumpScale: 0.2, envMapIntensity: 0.9 });
  const sh = (obj: THREE.Mesh) => {
    obj.castShadow = obj.receiveShadow = true;
    scene.add(obj);
    return obj;
  };
  const engrave = (draw: (x: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas");
    c.width = 2048;
    c.height = 832;
    const x = c.getContext("2d");
    if (x) draw(x);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return new THREE.MeshPhysicalMaterial({ map: t, transparent: true, metalness: 0.6, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  };
  const letters = (x: CanvasRenderingContext2D, txt: string, cx: number, cy: number, size: number) => {
    x.font = `500 ${size}px "General Sans"`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillStyle = "rgba(255,255,255,.35)";
    x.fillText(txt, cx, cy + 2);
    x.fillStyle = "rgba(22,24,26,.9)";
    x.fillText(txt, cx, cy);
  };
  const GW = 3.2;
  const GH = 1.3;
  const GD = 0.95;
  const slot = 0.075;
  const half = (GW - slot) / 2;
  for (const sx of [-1, 1]) sh(new THREE.Mesh(new RoundedBoxGeometry(half, GH, GD, 6, 0.045), steel)).position.set(sx * (slot / 2 + half / 2), GH / 2 + 0.18, 0);
  sh(new THREE.Mesh(new RoundedBoxGeometry(GW + 0.3, 0.18, GD + 0.25, 5, 0.035), steelG)).position.set(0, 0.09, 0);
  for (const sx of [-1, 1]) {
    const lip = sh(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, GD - 0.06), alu));
    lip.position.set(sx * (slot / 2 + 0.01), GH + 0.18 - 0.006, 0);
    lip.rotation.z = sx * Math.PI / 4;
  }
  const face = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH), engrave((x) => {
    letters(x, "GO", 560, 250, 190);
    letters(x, "NO-GO", 1500, 250, 190);
    x.font = '400 46px "IBM Plex Mono"';
    x.textAlign = "center";
    x.fillStyle = "rgba(22,24,26,.8)";
    x.fillText("0.075 +0.002 / -0", 560, 420);
    x.fillText("0.075 +0.010", 1500, 420);
    x.fillStyle = "rgba(22,24,26,.75)";
    for (let i = -28; i <= 28; i += 1) {
      if (Math.abs(i) < 1) continue;
      const X = 1024 + i * 30;
      const L = i % 5 === 0 ? 70 : 36;
      x.fillRect(X - 2, 832 - 60 - L, 4, L);
    }
    x.fillText("FIT GAUGE · No. 09", 430, 560);
  }));
  face.position.set(0, GH / 2 + 0.18, GD / 2 + 0.0015);
  scene.add(face);
  const rail = sh(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.05, 7.4, 2, 0.02), steelG));
  rail.position.set(0, 0.205, -1.2);
  const finG = new RoundedBoxGeometry(0.05, 1.65, 0.5, 3, 0.016);
  [0, -1.35, -2, -2.65, -3.3, -3.95, -4.6].forEach((z, i) => {
    const f = sh(new THREE.Mesh(finG, i === 0 ? hot : alu));
    f.position.set(0, 0.23 + 0.825, z);
  });
  const bad = sh(new THREE.Mesh(new RoundedBoxGeometry(0.42, 1, 0.62, 3, 0.03), rough));
  bad.position.set(0.05, 0.23 + 0.5, GD / 2 + 0.4);
  bad.rotation.set(-0.05, 0.16, 0.04);
  const probe = sh(new THREE.Mesh(finG, alu));
  probe.visible = false;
  const probeRough = rough;
  let probeZ = 2.5;
  let probeTarget = 2.5;
  let mode: "idle" | "go" | "nogo" = "idle";
  let raf = 0;
  let alive = true;
  S.spot.target.position.set(0, 0.8, 0);

  function frame() {
    if (mobile) S.look([-4.2, 6.8, 13.5], [0.3, 0.9, -0.6], [0.3, 0.8, 0.5]);
    else S.look([-5.6, 8.4, 18.5], [1.6, 1.8, -1.2], [0.3, 0.8, 0.6]);
    S.setAperture(0.0009);
  }
  function tick() {
    raf = 0;
    if (!alive) return;
    probeZ += (probeTarget - probeZ) * (mode === "nogo" ? 0.14 : 0.1);
    probe.position.set(mode === "nogo" ? 0.04 : 0, 0.23 + (mode === "nogo" ? 0.5 : 0.825), probeZ);
    probe.scale.set(mode === "nogo" ? 8 : 1, mode === "nogo" ? 0.6 : 1, mode === "nogo" ? 1.2 : 1);
    probe.material = mode === "nogo" ? probeRough : alu;
    probe.visible = mode !== "idle" || Math.abs(probeZ - 2.5) > 0.04;
    if (mode === "nogo" && Math.abs(probeZ - probeTarget) < 0.05) probe.rotation.z = Math.sin(performance.now() / 80) * 0.04;
    else probe.rotation.z = 0;
    S.render();
    if (Math.abs(probeZ - probeTarget) > 0.015) raf = window.requestAnimationFrame(tick);
    else if (mode === "nogo") {
      window.setTimeout(() => {
        if (mode === "nogo") S.render();
      }, 180);
    }
  }
  frame();
  await S.settle(4);

  return {
    setProgress() {},
    setHover(id) {
      if (!id) {
        mode = "idle";
        probeTarget = 2.5;
      } else if (id.startsWith("no")) {
        mode = "nogo";
        probeZ = 2.2;
        probeTarget = GD / 2 + 0.28;
      } else {
        mode = "go";
        probeZ = 2.2;
        probeTarget = -3.4;
      }
      if (!raf) raf = window.requestAnimationFrame(tick);
    },
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
