import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import * as THREE from "three";
import { createArcModel, type ArcModel } from "../../home/arc-model";
import { STATIONS, journeyWarm, type JourneyStation } from "./copy";
import { buildDemo, buildEngagements, buildGauge, buildProducts, buildToolpath, buildTrace, type Piece } from "./pieces";

const ORANGE = new THREE.Color(0xd8643e);
const STEEL = new THREE.Color(0xb3b1ac);
const DARK = new THREE.Color(0x111315);
const BONE = new THREE.Color(0xf1efe9);
const HALL = new THREE.Color(0x181b1e);
const FLOOR_DARK = new THREE.Color(0x17191b);
const FLOOR_BONE = new THREE.Color(0xddd8ce);
const WALL_BONE = new THREE.Color(0xe6e1d7);
const GAP = 34;

const filmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    vig: { value: 0.78 },
    grain: { value: 0.042 },
  },
  vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time, vig, grain;
    varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      vec4 color=texture2D(tDiffuse,vUv);
      vec2 d=vUv-0.5;
      d.x*=1.45;
      float v=smoothstep(0.95,0.32,length(d));
      color.rgb*=mix(vig,1.0,v);
      float g=hash(vUv*vec2(1440.0,900.0)+fract(time*0.17))-0.5;
      color.rgb+=g*grain;
      gl_FragColor=color;
    }
  `,
};

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

type Shot = { eye: THREE.Vector3; look: THREE.Vector3; focal: number };

function shot(origin: THREE.Vector3, eye: [number, number, number], look: [number, number, number], focal: number): Shot {
  return {
    eye: origin.clone().add(new THREE.Vector3(...eye)),
    look: origin.clone().add(new THREE.Vector3(...look)),
    focal,
  };
}

function autoMid(a: Shot, b: Shot): Shot {
  return {
    eye: a.eye.clone().lerp(b.eye, 0.5).add(new THREE.Vector3(0, 1.15, 1.8)),
    look: a.look.clone().lerp(b.look, 0.5),
    focal: (a.focal + b.focal) / 2,
  };
}

function plateTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#c8c5be";
  context.fillRect(0, 0, 1024, 512);
  context.strokeStyle = "rgba(28,30,32,0.22)";
  context.lineWidth = 2;
  for (let x = 0; x <= 1024; x += 256) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 512);
    context.stroke();
  }
  for (let y = 0; y <= 512; y += 256) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(1024, y);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 3);
  return texture;
}

function contact(radius: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.9 });
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 16, 128, 128, 120);
    gradient.addColorStop(0, "rgba(0,0,0,0.42)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    material.map = texture;
  }
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.025;
  return mesh;
}

export type JourneyWorld = {
  stations: JourneyStation[];
  setProgress: (value: number) => void;
  setTime: (ms: number) => void;
  setPointer: (x: number, y: number) => void;
  render: () => void;
  resize: () => void;
  dispose: () => void;
};

function trackArc(model: ArcModel, index: number, accents: { index: number; material: THREE.MeshStandardMaterial }[]) {
  const seen = new Set<THREE.Material>();
  model.object.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      const colored = material as THREE.MeshStandardMaterial | undefined;
      if (!colored?.color || seen.has(colored) || colored.color.getHex() !== 0xd8643e) continue;
      seen.add(colored);
      accents.push({ index, material: colored });
    }
  });
}

export async function mountJourney(canvas: HTMLCanvasElement): Promise<JourneyWorld> {
  if (document.fonts?.ready) await document.fonts.ready;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const background = DARK.clone();
  scene.background = background;
  const fog = new THREE.Fog(HALL, 16, 78);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.12, 220);
  camera.filmGauge = 35;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24), new THREE.MeshBasicMaterial({ color: 0x1a1c1e, side: THREE.BackSide })));
  const panel = (width: number, height: number, x: number, y: number, z: number, color: number, gain: number) => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(gain);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 1.4, 0);
    envScene.add(mesh);
  };
  panel(16, 4, 0, 6.5, 8, 0xfff4e8, 3.1);
  panel(8, 6, -8, 3, 3, 0xf1efe9, 1.7);
  panel(8, 5, 8, 2.6, 4, 0xd8d3ca, 1.35);
  scene.environment = pmrem.fromScene(envScene, 0.05).texture;
  scene.environmentIntensity = 1.12;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0x2a2f34, 0x0c0d0e, 0.55);
  const key = new THREE.DirectionalLight(0xf3f0e8, 3.6);
  key.position.set(-6, 11, 9);
  const rim = new THREE.DirectionalLight(0xfff4e8, 1.7);
  rim.position.set(7, 5, -5);
  const fill = new THREE.DirectionalLight(0xc9c4ba, 0.35);
  fill.position.set(2, 3, 12);
  scene.add(hemi, key, rim, fill);

  const hall = GAP * (STATIONS.length - 1);
  const floorMat = new THREE.MeshStandardMaterial({
    color: FLOOR_DARK,
    map: plateTexture(),
    roughness: 0.62,
    metalness: 0.35,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hall + 48, 42), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(hall / 2, 0, 0);
  const wallMat = new THREE.MeshStandardMaterial({ color: HALL, map: plateTexture(), roughness: 0.78, metalness: 0.2 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(hall + 48, 9), wallMat);
  wall.position.set(hall / 2, 4.2, -16);
  scene.add(floor, wall);

  const accents: { index: number; material: THREE.MeshStandardMaterial }[] = [];
  const ticks: ((timeMs: number) => void)[] = [];
  const origins = STATIONS.map((_, index) => new THREE.Vector3(index * GAP, 0, 0));

  const place = (index: number, piece: Piece, lift = 0) => {
    piece.object.position.copy(origins[index] ?? new THREE.Vector3());
    piece.object.position.y += lift;
    scene.add(piece.object, contact(index === 4 ? 5.2 : 4.2));
    scene.children[scene.children.length - 1].position.x = piece.object.position.x;
    scene.children[scene.children.length - 1].position.z = piece.object.position.z;
    for (const material of piece.accents) accents.push({ index, material });
    if (piece.tick) ticks.push(piece.tick);
  };

  const [hero, partner, book] = await Promise.all([
    createArcModel({ finCount: 200 }),
    createArcModel({ finCount: 200 }),
    createArcModel({ finCount: 200 }),
  ]);
  hero.setBand(Math.round(hero.finCount * 0.66), 1);
  partner.setBand(Math.round(partner.finCount * 0.4), 1);
  book.setBand(Math.round(book.finCount * 0.62), 1);
  hero.object.position.copy(origins[0] ?? new THREE.Vector3());
  partner.object.position.copy(origins[6] ?? new THREE.Vector3());
  book.object.position.copy(origins[8] ?? new THREE.Vector3());
  book.object.rotation.y = 0.42;
  scene.add(hero.object, partner.object, book.object);
  trackArc(hero, 0, accents);
  trackArc(partner, 6, accents);
  trackArc(book, 8, accents);
  for (const origin of [origins[0], origins[6], origins[8]]) {
    const disc = contact(4.6);
    disc.position.x = origin?.x ?? 0;
    scene.add(disc);
  }
  ticks.push((timeMs) => {
    hero.object.rotation.y = Math.sin(timeMs * 0.00075) * 0.05;
    partner.object.rotation.y = Math.sin(timeMs * 0.00062) * 0.045;
    book.object.rotation.y = 0.42 + Math.sin(timeMs * 0.0007) * 0.07;
  });

  place(1, buildDemo());
  place(2, buildEngagements(), 0.04);
  place(3, buildToolpath(), 0.16);
  place(4, buildTrace());
  place(5, buildProducts());
  place(7, buildGauge());

  const shots: Shot[] = [
    shot(origins[0], [-0.7, 1.72, 8.9], [0.15, 1.62, 0], 50),
    shot(origins[1], [0.2, 2.35, 14.2], [0.05, 1.05, 0], 34),
    shot(origins[2], [-0.15, 2.7, 13.4], [-0.35, 1.05, 0], 36),
    shot(origins[3], [-0.3, 2.7, 11.6], [0.05, 1.45, 0], 42),
    shot(origins[4], [-1.4, 6.6, 8.4], [0.2, 0.25, -0.2], 36),
    shot(origins[5], [0.15, 3.05, 8.6], [0.1, 0.95, 0], 30),
    shot(origins[6], [1.1, 3.35, -12.8], [0.15, 1.45, 0], 44),
    shot(origins[7], [0.7, 2.15, 6.5], [0, 0.78, 0], 42),
    shot(origins[8], [3.2, 3.15, 12.4], [0.15, 1.5, 0], 46),
  ];
  const partnerOrigin = origins[6] ?? new THREE.Vector3();
  const fitOrigin = origins[7] ?? new THREE.Vector3();
  const bridges: Shot[][] = STATIONS.map(() => []);
  bridges[5] = [
    {
      eye: partnerOrigin.clone().add(new THREE.Vector3(-11, 2.75, 10.2)),
      look: partnerOrigin.clone().add(new THREE.Vector3(0, 1.6, 0)),
      focal: 40,
    },
    {
      eye: partnerOrigin.clone().add(new THREE.Vector3(-10.4, 2.25, 0.2)),
      look: partnerOrigin.clone().add(new THREE.Vector3(0, 1.7, 0)),
      focal: 44,
    },
  ];
  bridges[6] = [
    {
      eye: partnerOrigin.clone().add(new THREE.Vector3(10.4, 2.3, -0.4)),
      look: partnerOrigin.clone().add(new THREE.Vector3(0, 1.65, 0)),
      focal: 44,
    },
    {
      eye: partnerOrigin.clone().add(new THREE.Vector3(16, 2.55, 9.2)),
      look: fitOrigin.clone().add(new THREE.Vector3(0, 0.8, 0)),
      focal: 38,
    },
  ];

  const segments = shots.slice(0, -1).map((from, index) => {
    const to = shots[index + 1];
    if (!to) return null;
    const extra = bridges[index] ?? [];
    const points = extra.length > 0 ? [from, ...extra, to] : [from, autoMid(from, to), to];
    return {
      eye: new THREE.CatmullRomCurve3(points.map((point) => point.eye), false, "centripetal"),
      look: new THREE.CatmullRomCurve3(points.map((point) => point.look), false, "centripetal"),
      focal: points.map((point) => point.focal),
    };
  });

  const pointer = new THREE.Vector2();
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const behind = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const turn = new THREE.Vector3();
  let progress = 0;
  let time = 0;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const grade = new ShaderPass(filmShader);
  composer.addPass(grade);

  function focalAt(values: number[], t: number) {
    const x = t * (values.length - 1);
    const index = Math.min(values.length - 2, Math.max(0, Math.floor(x)));
    return THREE.MathUtils.lerp(values[index] ?? 40, values[index + 1] ?? values[index] ?? 40, x - index);
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function apply() {
    const count = STATIONS.length;
    const along = Math.min(count - 1, Math.max(0, progress * count - 0.5));
    const index = along >= count - 1 - 1e-4 ? count - 2 : Math.floor(along);
    const segment = segments[index];
    if (!segment) return;
    const local = along >= count - 1 - 1e-4 ? 1 : smooth(along - index);
    segment.eye.getPoint(local, eye);
    segment.look.getPoint(local, look);
    eye.y = Math.max(1.05, eye.y);
    segment.eye.getTangent(Math.min(0.999, local + 0.05), ahead);
    segment.eye.getTangent(Math.max(0.001, local - 0.05), behind);
    turn.crossVectors(behind, ahead);
    const bank = THREE.MathUtils.clamp(-turn.y * 3.2, -0.22, 0.22);
    forward.subVectors(look, eye).normalize();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    eye.addScaledVector(right, pointer.x * 0.32);
    look.addScaledVector(right, pointer.x * 0.1);
    eye.y += pointer.y * -0.16;
    camera.up.set(Math.sin(bank), Math.cos(bank), 0);
    camera.position.copy(eye);
    camera.lookAt(look);
    camera.setFocalLength(focalAt(segment.focal, local));

    const warm = journeyWarm(progress);
    background.copy(DARK).lerp(BONE, warm);
    fog.color.copy(background);
    hemi.color.set(0x2a2f34).lerp(new THREE.Color(0xf4efe6), warm);
    hemi.groundColor.set(0x0c0d0e).lerp(new THREE.Color(0xcfc8bc), warm);
    hemi.intensity = THREE.MathUtils.lerp(0.5, 0.85, warm);
    key.color.set(0xe8e4dc).lerp(new THREE.Color(0xfff3e4), warm);
    key.intensity = THREE.MathUtils.lerp(3.6, 2.15, warm);
    rim.intensity = THREE.MathUtils.lerp(1.7, 0.85, warm);
    fill.intensity = THREE.MathUtils.lerp(0.28, 0.7, warm);
    floorMat.color.copy(FLOOR_DARK).lerp(FLOOR_BONE, warm);
    wallMat.color.copy(HALL).lerp(WALL_BONE, warm);
    scene.environmentIntensity = THREE.MathUtils.lerp(1.12, 0.82, warm);

    for (const item of accents) {
      const distance = Math.abs(along - item.index);
      const on = distance >= 0.48 ? 0 : 1 - smooth(Math.max(0, distance - 0.22) / 0.26);
      item.material.color.copy(STEEL).lerp(ORANGE, on);
    }
    for (const tick of ticks) tick(time);
    grade.uniforms.time.value = time / 1000;
  }

  function render() {
    apply();
    composer.render();
  }

  resize();
  render();

  return {
    stations: STATIONS,
    setProgress(value) {
      progress = Math.min(1, Math.max(0, value));
    },
    setTime(ms) {
      time = ms;
    },
    setPointer(x, y) {
      pointer.set(x, y);
    },
    render,
    resize,
    dispose() {
      composer.dispose();
      renderer.dispose();
      hero.dispose();
      partner.dispose();
      book.dispose();
      scene.environment?.dispose();
    },
  };
}
