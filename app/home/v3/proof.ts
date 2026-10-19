import type { SceneHandle, SceneOptions } from "./types";
import { brushedTex, RoundedBoxGeometry, studio, tex, THREE, viewSize } from "./studio";

const SPANS: [string, number, number][] = [
  ["request", 0, 1840],
  ["auth.check", 10, 40],
  ["retrieve.vector", 40, 420],
  ["rerank", 420, 610],
  ["llm.generate", 610, 1520],
  ["tool.call crm.lookup", 900, 1180],
  ["guardrail.output", 1520, 1660],
  ["eval.sample", 1660, 1760],
  ["respond", 1760, 1840],
];

export async function mountProof(canvas: HTMLCanvasElement, options: SceneOptions): Promise<SceneHandle> {
  const mobile = options.mobile;
  const size = viewSize(canvas);
  let w = size.w;
  let h = size.h;
  const S = studio({
    canvas,
    w,
    h,
    mobile,
    floor: 0x26282a,
    env: 1.25,
    key: { pos: [-6, 10, 6], int: 1300, angle: 0.42 },
    softbox: 1.2,
  });
  S.setVignette(0.5);
  const { scene } = S;
  const PW = 8.2;
  const PD = 4.9;
  const PT = 0.32;
  const x0 = -1.6;
  const x1 = 3.75;
  const T = 1840;
  const rowZ = (i: number) => -PD / 2 + 0.62 + i * 0.46;
  const grain = tex(512, (i, j) => 140 + Math.sin(i * 1.7 + Math.sin(j * 0.05) * 3) * 10 + (Math.random() * 50 - 25));
  grain.repeat.set(5, 1);
  const plateMat = new THREE.MeshPhysicalMaterial({
    color: 0x2f3236,
    metalness: 0.55,
    roughness: 0.36,
    roughnessMap: grain,
    clearcoat: 0.45,
    clearcoatRoughness: 0.35,
  });
  const plate = new THREE.Mesh(new RoundedBoxGeometry(PW, PT, PD, 5, 0.07), plateMat);
  plate.castShadow = plate.receiveShadow = true;
  const g = new THREE.Group();
  g.add(plate);
  const cv = document.createElement("canvas");
  cv.width = 4096;
  cv.height = Math.round((4096 * PD) / PW);
  const c = cv.getContext("2d");
  if (c) {
    const sx = (x: number) => ((x + PW / 2) / PW) * cv.width;
    const sz = (z: number) => ((z + PD / 2) / PD) * cv.height;
    c.fillStyle = "#fff";
    c.globalAlpha = 0.55;
    c.font = '400 44px "IBM Plex Mono"';
    c.textBaseline = "middle";
    for (let t = 0; t <= 1800; t += 100) {
      const x = sx(x0 + ((x1 - x0) * t) / T);
      c.fillRect(x - 2, sz(rowZ(8) + 0.3), 4, t % 500 === 0 ? 70 : 34);
      if (t % 500 === 0) c.fillText(`${t} ms`, x - 50, sz(rowZ(8) + 0.3) + 115);
    }
    c.globalAlpha = 0.25;
    for (let i = 0; i < 9; i += 1) c.fillRect(sx(x0), sz(rowZ(i)), sx(x1) - sx(x0), 2);
    c.globalAlpha = 0.6;
    c.font = '400 40px "IBM Plex Mono"';
    c.fillText("PRIMEARC · TRACE 0417 · 1,840 MS · ILLUSTRATIVE", sx(-PW / 2 + 0.4), sz(-PD / 2 + 0.22));
  }
  const et = new THREE.CanvasTexture(cv);
  et.anisotropy = 8;
  const engr = new THREE.Mesh(
    new THREE.PlaneGeometry(PW, PD),
    new THREE.MeshPhysicalMaterial({
      color: 0xcfccc6,
      alphaMap: et,
      transparent: true,
      metalness: 0.3,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  engr.rotation.x = -Math.PI / 2;
  engr.position.y = PT / 2 + 0.002;
  g.add(engr);
  const fin = new THREE.MeshPhysicalMaterial({
    color: 0xd8d6d1,
    metalness: 0.85,
    roughness: 0.26,
    roughnessMap: brushedTex(),
    clearcoat: 0.25,
    envMapIntensity: 1.4,
  });
  const hot = new THREE.MeshPhysicalMaterial({ color: 0xd8643e, metalness: 0.5, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  let hotPos = new THREE.Vector3();
  const M = new THREE.Matrix4();
  const fg = new RoundedBoxGeometry(1, 1, 1, 2, 0.012);
  const labelPoints: THREE.Vector3[] = [];
  SPANS.forEach((span, i) => {
    const a = x0 + ((x1 - x0) * span[1]) / T;
    const b = x0 + ((x1 - x0) * span[2]) / T;
    const len = Math.max(0.07, b - a);
    const mt = span[0] === "llm.generate" ? hot : fin;
    const isReq = span[0] === "request";
    const barH = isReq ? 0.05 : 0.16 + (0.06 * ((i * 5) % 3)) / 2;
    const dz = 0.3;
    const base = new THREE.Mesh(new RoundedBoxGeometry(len, 0.05, dz, 2, 0.015), mt);
    base.position.set(a + len / 2, PT / 2 + 0.025, rowZ(i));
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    if (!isReq) {
      const pitch = 0.07;
      const n = Math.max(1, Math.round(len / pitch));
      const im = new THREE.InstancedMesh(fg, mt, n);
      im.castShadow = im.receiveShadow = true;
      for (let k = 0; k < n; k += 1) {
        M.makeScale(Math.min(0.04, len * 0.6), barH, dz * 0.94);
        M.setPosition(a + (k + 0.5) * (len / n), PT / 2 + 0.05 + barH / 2, rowZ(i));
        im.setMatrixAt(k, M);
      }
      g.add(im);
    }
    labelPoints.push(new THREE.Vector3(Math.min(a - 0.14, x0 - 0.1), PT / 2, rowZ(i)));
    if (span[0] === "llm.generate") hotPos = new THREE.Vector3(a + len * 0.5, PT / 2 + 0.05 + barH, rowZ(i));
  });
  g.position.set(mobile ? 0 : 0.95, PT / 2 + 0.02, 0);
  g.rotation.y = mobile ? 0 : -0.26;
  if (mobile) g.scale.setScalar(1.22);
  scene.add(g);
  S.spot.target.position.set(0, 0, 0);

  function frame() {
    if (mobile) S.look([-0.05, 8.6, 6.4], [0, 0, 0.05], [0, 0, 0.15]);
    else S.look([-3.6, 10.8, 16.2], [0.95, -0.3, -1.0], [0.8, 0, 0.2]);
    S.setAperture(0.0009);
    g.updateMatrixWorld();
  }
  frame();
  await S.settle(4);

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
    anchors() {
      g.updateMatrixWorld();
      const pj = (v: THREE.Vector3) => {
        const p = v.clone().applyMatrix4(g.matrixWorld).project(S.camera);
        return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
      };
      const labels = SPANS.map((span, i) => {
        const point = labelPoints[i] ?? new THREE.Vector3();
        const at = pj(point);
        const name = mobile ? span[0].replace("tool.call ", "") : span[0];
        return { id: `span-${i}`, x: at.x, y: at.y, label: name, note: `${span[2] - span[1]} ms` };
      });
      const pin = pj(hotPos);
      return [...labels, { id: "pin", x: pin.x, y: pin.y }];
    },
    dispose: () => S.dispose(),
  };
}
