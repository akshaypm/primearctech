import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { SceneHandle, SceneOptions } from "./types";
import { viewSize } from "./studio";
import { registerLayer, sharedRenderer, unregisterLayer } from "./gl-host";

export async function mountHow(canvas: HTMLCanvasElement, options: SceneOptions): Promise<SceneHandle> {
  const mobile = options.mobile;
  const size = viewSize(canvas);
  let w = size.w;
  let h = size.h;
  const renderer = sharedRenderer();
  const target = new THREE.WebGLRenderTarget(2, 2);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf1efe9);
  const camera = new THREE.PerspectiveCamera(18, w / Math.max(1, h), 0.1, 100);
  const R = 3.1;
  const N = 150;
  const arc = new THREE.Group();
  scene.add(arc);
  const occ = new THREE.MeshBasicMaterial({ color: 0xf1efe9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const solidMat = new THREE.LineBasicMaterial({ color: 0x2c3033 });
  const dashMat = new THREE.LineDashedMaterial({ color: 0xa7adb2, dashSize: 0.03, gapSize: 0.035 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(box);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const qq = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  const prof: { a: number; w: number; d: number }[] = [];
  const occG: THREE.BufferGeometry[] = [];
  const solid: THREE.LineSegments[] = [];
  const dashed: THREE.LineSegments[] = [];
  const pathPts: number[] = [];
  for (let k = 0; k < N; k += 1) {
    const u = k / (N - 1);
    const a = Math.PI * (1 - u);
    const width = 0.5 + 0.13 * Math.sin(u * Math.PI * 3 + 0.6) + 0.035 * Math.sin(u * Math.PI * 11 + 1.3);
    const depth = 0.62 + 0.1 * Math.cos(u * Math.PI * 2);
    const rr = R + width / 2;
    p.set(Math.cos(a) * rr, Math.sin(a) * rr, 0);
    qq.setFromAxisAngle(Z, a);
    s.set(width, 0.026, depth);
    m.compose(p, qq, s);
    prof.push({ a, w: width, d: depth });
    occG.push(box.clone().applyMatrix4(m));
    const edge = edges.clone().applyMatrix4(m);
    const cutLine = new THREE.LineSegments(edge, solidMat);
    const rawLine = new THREE.LineSegments(edge.clone(), dashMat);
    rawLine.computeLineDistances();
    arc.add(cutLine, rawLine);
    solid.push(cutLine);
    dashed.push(rawLine);
    const z = depth / 2 + 0.02;
    const ro = R + width + 0.05;
    const rg = R + width + 0.015;
    const da = (Math.PI / (N - 1)) * 0.5;
    pathPts.push(Math.cos(a + da * 0.3) * ro, Math.sin(a + da * 0.3) * ro, z, Math.cos(a - da * 0.3) * ro, Math.sin(a - da * 0.3) * ro, z, Math.cos(a - da) * rg, Math.sin(a - da) * rg, z);
  }
  arc.add(new THREE.Mesh(mergeGeometries(occG), occ));
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(1.15, 0.18, 1.05);
    const f = new THREE.Mesh(g, occ);
    f.position.set(sx * (R + 0.42), -0.09, 0);
    arc.add(f);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), solidMat);
    e.position.copy(f.position);
    arc.add(e);
  }
  const fl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(14, 3.4)), new THREE.LineDashedMaterial({ color: 0xc9c6bf, dashSize: 0.06, gapSize: 0.08 }));
  fl.rotation.x = -Math.PI / 2;
  fl.position.y = -0.18;
  fl.computeLineDistances();
  arc.add(fl);
  const lineGeo = new LineGeometry();
  const lineMat = new LineMaterial({ color: 0xd8643e, linewidth: 1.2, worldUnits: false });
  lineMat.resolution.set(w, h);
  const path = new Line2(lineGeo, lineMat);
  arc.add(path);
  const tool = new THREE.Group();
  const dark = new THREE.LineBasicMaterial({ color: 0x2c3033 });
  const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 24, 1, true), occ);
  a1.position.y = 0.38 / 2 + 0.55;
  tool.add(a1);
  const e1 = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 24)), dark);
  e1.position.copy(a1.position);
  tool.add(e1);
  const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.38, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x2c3033 }));
  a2.position.y = 0.19;
  tool.add(a2);
  const flute: number[] = [];
  for (let i = 0; i < 6; i += 1) flute.push(-0.05, 0.03 + i * 0.06, 0.051, 0.05, 0.06 + i * 0.06, 0.051);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(flute, 3));
  tool.add(new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: 0xf1efe9 })));
  arc.add(tool);
  arc.rotation.y = mobile ? -0.2 : -0.28;
  arc.position.y = 0.18;
  let progress = mobile ? 0.62 : 0.62;
  let built = -1;

  function apply(value: number) {
    const cut = Math.max(0, Math.min(N, Math.floor(value * N)));
    if (cut === built) return;
    built = cut;
    for (let k = 0; k < N; k += 1) {
      solid[k].visible = k < cut;
      dashed[k].visible = k >= cut;
    }
    const count = Math.max(2, cut);
    path.visible = cut > 1;
    if (cut > 1) lineGeo.setPositions(pathPts.slice(0, count * 9));
    const fin = prof[Math.min(cut, N - 1)] ?? prof[0];
    const ro = R + fin.w + 0.06;
    tool.position.set(Math.cos(fin.a) * ro, Math.sin(fin.a) * ro, fin.d / 2 + 0.02);
    tool.rotation.z = fin.a - Math.PI / 2;
  }

  function frame(time = performance.now()) {
    if (mobile) {
      camera.position.set(1.2, 2.6, 26);
      camera.lookAt(0, 1.9, 0);
    } else {
      camera.position.set(1.6, 3.2, 21.5);
      camera.lookAt(0.2, 1.8, 0);
    }
    if (!options.reducedMotion) arc.rotation.z = Math.sin(time * 0.0011) * 0.12;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    lineMat.resolution.set(target.width, target.height);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0xf1efe9, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  }

  registerLayer("how", {
    element: canvas.parentElement ?? canvas,
    resize(width, height) {
      const cap = 640;
      const scale = Math.min(1, cap / Math.max(1, width), cap / Math.max(1, height));
      const rw = Math.max(2, Math.round(width * scale));
      const rh = Math.max(2, Math.round(height * scale));
      target.setSize(rw, rh);
      w = width;
      h = height;
    },
    tick: (time) => frame(time),
    texture: () => target.texture,
  });

  apply(progress);
  frame();

  return {
    setProgress(value) {
      progress = mobile ? 0.62 : Math.min(1, Math.max(0, value));
      apply(progress);
      frame();
    },
    resize() {
      const next = viewSize(canvas);
      w = next.w;
      h = next.h;
      built = -1;
      apply(progress);
      frame();
    },
    anchors: () => [],
    dispose() {
      unregisterLayer("how");
      target.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
      });
      solidMat.dispose();
      dashMat.dispose();
      occ.dispose();
      lineMat.dispose();
      lineGeo.dispose();
    },
  };
}
