import type { SceneHandle, SceneOptions } from "./types";
import { brushedTex, project, reseed, rnd, RoundedBoxGeometry, studio, THREE, viewSize } from "./studio";

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export async function mountDemo(canvas: HTMLCanvasElement, options: SceneOptions): Promise<SceneHandle> {
  const mobile = options.mobile;
  const size = viewSize(canvas);
  let w = size.w;
  let h = size.h;
  const S = studio({
    canvas,
    w,
    h,
    mobile,
    bg: 0xe7e4dd,
    floor: 0xc4c0b8,
    fog: [20, 46],
    env: 0.42,
    key: { pos: [-13, 8, 3], int: 1100, angle: 0.55 },
    tone: 1,
    light: true,
  });
  S.setVignette(0.86);
  S.spot.shadow.normalBias = 0.045;
  const { scene } = S;
  const N = mobile ? 150 : 210;
  const L = 12.5;
  const geo = new RoundedBoxGeometry(1, 1, 1, 3, 0.05);
  const brush = brushedTex(4, 12);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x9fa2a5,
    metalness: 0.8,
    roughness: 0.46,
    roughnessMap: brush,
    clearcoat: 0.15,
    clearcoatRoughness: 0.55,
    envMapIntensity: 1.35,
  });
  const geoL = new RoundedBoxGeometry(0.05, 1, 0.6, 3, 0.016);
  const looseBrush = brushedTex(3, 14);
  const rough = new THREE.MeshPhysicalMaterial({
    color: 0xb9babb,
    metalness: 0.78,
    roughness: 0.55,
    roughnessMap: looseBrush,
    anisotropy: 0.25,
    anisotropyRotation: Math.PI / 2,
    envMapIntensity: 1.5,
  });
  const hot = new THREE.MeshPhysicalMaterial({ color: 0xd8643e, metalness: 0.4, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const fins = new THREE.InstancedMesh(geo, mat, N);
  fins.castShadow = fins.receiveShadow = true;
  scene.add(fins);
  const loose = new THREE.InstancedMesh(geoL, rough, N);
  loose.castShadow = loose.receiveShadow = true;
  scene.add(loose);
  const hotM = new THREE.Mesh(geo, hot);
  hotM.castShadow = true;
  scene.add(hotM);
  const rail = new THREE.Mesh(
    new RoundedBoxGeometry(L + 0.6, 0.16, 0.95, 3, 0.04),
    new THREE.MeshPhysicalMaterial({ color: 0x2a2c2e, metalness: 0.8, roughness: 0.4 }),
  );
  rail.position.set(0, 0.08, 0);
  rail.castShadow = rail.receiveShadow = true;
  scene.add(rail);
  const gm = new THREE.MeshPhysicalMaterial({ color: 0x3a3d40, metalness: 0.7, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const am = new THREE.MeshPhysicalMaterial({ color: 0xc9c8c4, metalness: 0.9, roughness: 0.22 });
  const car = new THREE.Group();
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.18, 1.7, 3, 0.05), gm);
  top.position.y = 2.42;
  car.add(top);
  const nose = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.5, 0.12, 2, 0.03), am);
  nose.position.y = 2.12;
  car.add(nose);
  for (const z of [-0.76, 0.76]) {
    const leg = new THREE.Mesh(new RoundedBoxGeometry(0.22, 2.3, 0.1, 3, 0.03), am);
    leg.position.set(0, 1.27, z);
    car.add(leg);
  }
  const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.12, 1.7, 3, 0.03), gm);
  shoe.position.y = 0.19;
  car.add(shoe);
  car.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true;
  });
  scene.add(car);

  reseed(3);
  const HOT = Math.round(N * 0.78);
  const FW = 0.09;
  const fin = Array.from({ length: N }, (_, k) => ({
    u: k / (N - 1),
    fallen: rnd() < 0.14,
    r: [rnd(), rnd(), rnd(), rnd(), rnd()],
  }));
  const m = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const Z = new THREE.Matrix4().makeScale(0, 0, 0);
  let progress = mobile ? 1 : 0.5;

  function pose(P: number) {
    const front = 1 - P * (1 + FW * 2) + FW;
    car.position.set(-L / 2 + Math.min(1, Math.max(0, front)) * L, 0, 0);
    car.visible = P > 0.02 && P < 0.98;
    fin.forEach((item, k) => {
      const { u, fallen, r } = item;
      const lock = smooth((u - front) / FW + 0.5);
      const hx = -L / 2 + u * L;
      const hh = 1.7 + 0.35 * Math.sin(u * Math.PI * 2.2 + 0.4) + 0.06 * Math.sin(u * Math.PI * 9);
      const prod = { x: hx, y: 0.16 + hh / 2, z: 0, rx: 0, ry: 0, rz: 0, h: hh };
      const demo = fallen
        ? { x: hx + (r[0] - 0.5) * 0.9, y: 0.03, z: 1 + r[1] * 1.8, rx: -Math.PI / 2 + (r[2] - 0.5) * 0.2, ry: (r[3] - 0.5) * 1.6, rz: 0, h: 0.6 + r[4] * 0.9 }
        : { x: hx + (r[0] - 0.5) * 0.45, y: 0.16 + (0.7 + r[4] * 1.4) / 2 + r[1] * 0.3, z: (r[1] - 0.5) * 1.1, rx: (r[2] - 0.5) * 0.6, ry: (r[3] - 0.5) * 1.7, rz: (r[4] - 0.5) * 0.8, h: 0.7 + r[4] * 1.4 };
      const mix = (a: number, b: number) => a + (b - a) * lock;
      p.set(mix(demo.x, prod.x), mix(demo.y, prod.y), mix(demo.z, prod.z));
      e.set(mix(demo.rx, prod.rx), mix(demo.ry, prod.ry), mix(demo.rz, prod.rz));
      q4.setFromEuler(e);
      s.set(mix(0.05, 0.03), mix(demo.h, prod.h), mix(0.6, 0.75));
      m.compose(p, q4, s);
      if (k === HOT) {
        hotM.position.copy(p);
        hotM.quaternion.copy(q4);
        hotM.scale.copy(s);
        fins.setMatrixAt(k, Z);
        loose.setMatrixAt(k, Z);
        return;
      }
      if (lock > 0.5) {
        fins.setMatrixAt(k, m);
        loose.setMatrixAt(k, Z);
      } else {
        s.set(mix(1, 0.6), mix(demo.h, prod.h), mix(1, 1.25));
        m.compose(p, q4, s);
        loose.setMatrixAt(k, m);
        fins.setMatrixAt(k, Z);
      }
    });
    fins.instanceMatrix.needsUpdate = loose.instanceMatrix.needsUpdate = true;
  }

  function frame() {
    if (mobile) S.look([-11, 4.2, 11.5], [1.2, 1.3, 0], [-0.5, 1, 0]);
    else S.look([-7.5, 4.2, 21], [1.4, 2.0, 0], [0.4, 0.6, 0]);
    S.spot.target.position.set(0, 0, 0);
    S.setAperture(0.0007);
  }

  pose(progress);
  frame();
  await S.settle(4);

  return {
    setProgress(value) {
      progress = mobile ? 1 : Math.min(1, Math.max(0, value));
      pose(progress);
      S.render();
    },
    resize() {
      const next = viewSize(canvas);
      w = next.w;
      h = next.h;
      S.resize(w, h);
      frame();
      pose(progress);
      S.render();
    },
    anchors() {
      const left = mobile ? [-L / 2 + 4.6, -0.1, 3.6] : [-L / 2 + 1.6, -0.1, 2.1];
      const right = mobile ? [L / 2 - 3.5, 2.6, 0] : [L / 2 - 1.8, -0.1, 1.4];
      const a = project(S.camera, new THREE.Vector3(left[0], left[1], left[2]), w, h);
      const b = project(S.camera, new THREE.Vector3(right[0], right[1], right[2]), w, h);
      return [
        { id: "t0", x: a.x, y: a.y },
        { id: "t1", x: b.x, y: b.y },
      ];
    },
    dispose: () => S.dispose(),
  };
}
