import type { SceneHandle, SceneOptions } from "./types";
import { createArcModel } from "../arc-model";
import { studio, THREE, viewSize } from "./studio";

const BONE = 0xf1efe9;

function contactShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(128, 128, 16, 128, 128, 120);
  gradient.addColorStop(0, "rgba(42, 38, 32, 0.34)");
  gradient.addColorStop(0.5, "rgba(42, 38, 32, 0.14)");
  gradient.addColorStop(1, "rgba(42, 38, 32, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(7.2, 2.4),
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
    key: { pos: [-3.2, 9.5, 8.5], int: 48, angle: 0.7 },
    tone: 1,
    light: true,
  });
  S.setVignette(1);
  S.setGrain(0);
  S.spot.color.set(0xffe6cc);
  S.spot.penumbra = 0.85;
  S.spot.shadow.radius = 10;
  S.spot.shadow.bias = -0.0002;
  S.spot.shadow.normalBias = 0.04;
  S.rim.intensity = 0.22;
  S.rim.color.set(0xfff0e0);
  S.rim.position.set(6, 4.5, -6);
  const { scene, renderer } = S;
  S.setGrade(THREE.NoToneMapping, 1);
  scene.background = new THREE.Color(BONE);
  scene.fog = null;
  const hemi = scene.children.find((child): child is THREE.HemisphereLight => child instanceof THREE.HemisphereLight);
  if (hemi) {
    hemi.color.set(0xf6f1e8);
    hemi.groundColor.set(0xd5cfc4);
    hemi.intensity = 0.55;
  }
  const fill = new THREE.DirectionalLight(0xf3efe6, 0.45);
  fill.position.set(8, 6, 10);
  scene.add(fill);
  const ground = scene.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  if (ground) ground.visible = false;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(28, 16, 28), new THREE.MeshBasicMaterial({ color: 0xc4c0b8, side: THREE.BackSide })));
  const panel = (pw: number, ph: number, x: number, y: number, z: number, color: number, gain: number) => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(gain);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 1.4, 0);
    env.add(mesh);
  };
  panel(20, 12, -2, 7.5, 8, 0xfff4e8, 2.4);
  panel(14, 9, 7, 4, 6, 0xe7e4dc, 1.35);
  panel(16, 8, 0, -5.5, 1, 0x9a958c, 1);
  const envTarget = pmrem.fromScene(env, 0.16);
  pmrem.dispose();
  scene.environment?.dispose();
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1.05;

  const model = await createArcModel({ finCount: mobile ? 150 : 260 });
  model.setBand(Math.round(model.finCount * 0.62), 1);
  model.object.position.y = 0.18;
  model.object.rotation.y = 0.42;
  const shadow = contactShadow();
  if (shadow) model.object.add(shadow);
  scene.add(model.object);

  S.spot.target.position.set(0.2, 1.5, 0);
  const restYaw = model.object.rotation.y;

  function frame() {
    if (mobile) S.look([-8.6, 2.5, 15.4], [-0.2, 1.7, 0], [0, 1.6, 0]);
    else S.look([-8.8, 2.35, 15.8], [-3.2, 2.15, 0], [0, 1.8, 0]);
    S.setAperture(0.00018);
  }
  frame();
  await S.settle(4);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  S.setFrame((time) => {
    if (!reduced) model.object.rotation.y = restYaw + Math.sin(time * 0.00105) * 0.16;
  });

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
      model.dispose();
      S.dispose();
    },
  };
}
