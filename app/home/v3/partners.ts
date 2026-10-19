import type { SceneHandle, SceneOptions } from "./types";
import { RoundedBoxGeometry, studio, THREE, viewSize } from "./studio";

const WAYS = [0xefede7, 0xd7d2c8, 0xc5c9cc];

export async function mountPartners(canvas: HTMLCanvasElement, options: SceneOptions): Promise<SceneHandle> {
  const mobile = options.mobile;
  const size = viewSize(canvas);
  let w = size.w;
  let h = size.h;
  const S = studio({
    canvas,
    w,
    h,
    mobile,
    bg: 0x56585a,
    floor: 0x8e9092,
    fog: [22, 48],
    env: 0.55,
    key: { pos: [-9, 12, 9], int: 1200, angle: 0.45 },
    light: true,
  });
  S.setVignette(0.8);
  const { scene } = S;
  const R = 3.1;
  const N = mobile ? 180 : 260;
  const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);
  const coat = new THREE.MeshPhysicalMaterial({ color: WAYS[0], metalness: 0, roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.6, sheen: 0.2 });
  const fins = new THREE.InstancedMesh(geo, coat, N);
  fins.castShadow = fins.receiveShadow = true;
  const M = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
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
    fins.setMatrixAt(k, M);
  }
  const arc = new THREE.Group();
  arc.add(fins);
  const footMat = new THREE.MeshPhysicalMaterial({ color: 0xdcdad4, roughness: 0.6 });
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.18, 1.05, 3, 0.03), footMat);
    f.position.set(sx * (R + 0.42), 0.09, 0);
    f.castShadow = f.receiveShadow = true;
    arc.add(f);
  }
  const plate = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.012, 0.34, 2, 0.004), new THREE.MeshPhysicalMaterial({ color: 0xf5f3ee, roughness: 0.35 }));
  plate.position.set(R + 0.42, 0.19, 0.18);
  arc.add(plate);
  arc.position.set(-0.3, 0.18, 0);
  arc.rotation.y = -0.5;
  scene.add(arc);
  S.spot.target.position.set(0, 0, 0);
  const color = new THREE.Color(WAYS[0]);

  function frame() {
    if (mobile) S.look([5.2, 2.2, 19.5], [0.5, 2.4, 0], [0, 2, 0]);
    else S.look([6.8, 1.9, 14.5], [2.9, 2.7, 0], [0, 2, 0]);
    S.setAperture(0.0009);
    arc.updateMatrixWorld();
  }
  frame();
  await S.settle(4);

  return {
    setProgress(value) {
      const pNow = mobile ? 0.5 : Math.min(1, Math.max(0, value));
      const shifted = (pNow - 0.5) * 2;
      const index = shifted < 0 ? 1 : 2;
      const mix = Math.abs(shifted);
      color.set(WAYS[0]).lerp(new THREE.Color(WAYS[index] ?? WAYS[0]), mix);
      coat.color.copy(color);
      S.render();
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
      const v = new THREE.Vector3(R + 0.42, 0.2, 0.18).applyMatrix4(arc.matrixWorld);
      const pr = v.project(S.camera);
      return [{ id: "plate", x: ((pr.x + 1) / 2) * w, y: ((1 - pr.y) / 2) * h }];
    },
    dispose: () => S.dispose(),
  };
}
