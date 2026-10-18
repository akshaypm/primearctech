import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as THREE from "three";
import { createArcModel } from "../../home/arc-model";

export type JourneyStation = {
  id: string;
  kicker: string;
  lines: string[];
};

const STATIONS: JourneyStation[] = [
  { id: "hero", kicker: "01 — Hero", lines: ["AI features,", "from demo to production."] },
  { id: "demo", kicker: "02 — Demo to production", lines: ["The demo worked.", "Production is a different machine."] },
  { id: "engagements", kicker: "03 — Engagements", lines: ["Three ways in.", "One standard of finish."] },
  { id: "how", kicker: "04 — How we work", lines: ["Engineers on the call.", "Engineers on the code."] },
  { id: "proof", kicker: "05 — Engineering depth", lines: ["Engineering you", "can inspect."] },
  { id: "products", kicker: "06 — Products", lines: ["When the same problem", "shows up three times."] },
  { id: "partners", kicker: "07 — Partners", lines: ["Built under", "your name."] },
  { id: "fit", kicker: "09 — Fit", lines: ["We work to a tolerance.", "So should a client list."] },
  { id: "book", kicker: "10 — Book a call", lines: ["Talk to an engineer,", "not a salesperson."] },
];

const ORANGE = new THREE.Color(0xd8643e);
const STEEL = new THREE.Color(0xb3b1ac);
const DARK = new THREE.Color(0x111315);
const BONE = new THREE.Color(0xf1efe9);

const filmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    vig: { value: 0.62 },
    grain: { value: 0.04 },
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
      d.x*=1.55;
      float v=smoothstep(0.92,0.28,length(d));
      color.rgb*=mix(vig,1.0,v);
      float g=hash(floor(vUv*vec2(1440.0,900.0))+time)-0.5;
      color.rgb+=g*grain;
      gl_FragColor=color;
    }
  `,
};

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function metal(color: number, roughness = 0.32) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.86, roughness });
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

export async function mountJourney(canvas: HTMLCanvasElement): Promise<JourneyWorld> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = DARK.clone();
  scene.fog = new THREE.Fog(0x181b1e, 28, 70);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 120);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.BoxGeometry(18, 10, 18), new THREE.MeshBasicMaterial({ color: 0x1c1e20, side: THREE.BackSide })));
  const panel = (width: number, height: number, x: number, y: number, z: number, color: number, gain: number) => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(gain);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 1.2, 0);
    envScene.add(mesh);
  };
  panel(14, 5, 0, 6, 7, 0xfff4e8, 3.2);
  panel(8, 6, -7, 3, 3, 0xf1efe9, 1.8);
  panel(8, 5, 7, 2.5, 4, 0xd8d3ca, 1.4);
  scene.environment = pmrem.fromScene(envScene, 0.06).texture;
  scene.environmentIntensity = 1.15;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0x3a4046, 0x121416, 0.9);
  const key = new THREE.DirectionalLight(0xf7f4ee, 4.2);
  key.position.set(-4, 10, 12);
  const rim = new THREE.DirectionalLight(0xfff6ea, 2.1);
  rim.position.set(7, 5, -4);
  scene.add(hemi, key, rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 48), metal(0x1a1c1e, 0.62));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(240, 18), metal(0x181b1e, 0.78));
  wall.position.set(0, 8, -10);
  scene.add(wall);

  const accents: { index: number; material: THREE.MeshStandardMaterial }[] = [];
  const eyes: THREE.Vector3[] = [];
  const looks: THREE.Vector3[] = [];
  const fovs: number[] = [];

  function station(index: number, eye: [number, number, number], look: [number, number, number], fov: number) {
    const origin = new THREE.Vector3(index * 24, 0, 0);
    eyes.push(origin.clone().add(new THREE.Vector3(...eye)));
    looks.push(origin.clone().add(new THREE.Vector3(...look)));
    fovs.push(fov);
    return origin;
  }

  function accent(index: number) {
    const material = metal(0xb3b1ac, 0.34);
    accents.push({ index, material });
    return material;
  }

  function collectArcAccent(root: THREE.Object3D, index: number) {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        const colored = material as THREE.MeshStandardMaterial | undefined;
        if (colored?.color?.getHex() === 0xd8643e) accents.push({ index, material: colored });
      }
    });
  }

  const heroOrigin = station(0, [0, 2.15, 7.4], [0, 2.15, 0], 30);
  const hero = await createArcModel({ finCount: 96 });
  hero.setBand(Math.round(96 * 0.66), 1);
  hero.object.position.copy(heroOrigin);
  hero.object.position.y = 0;
  scene.add(hero.object);
  collectArcAccent(hero.object, 0);

  const demoOrigin = station(1, [0.2, 1.7, 6.2], [0, 1.05, 0], 32);
  scene.add(buildDemo(demoOrigin, accent(1)));

  const ringOrigin = station(2, [0.3, 1.7, 5.8], [0, 1.5, 0], 30);
  scene.add(buildRings(ringOrigin, accent(2)));

  const howOrigin = station(3, [0, 2.1, 6.6], [0, 1.7, 0], 30);
  scene.add(buildToolpath(howOrigin, accent(3)));

  const proofOrigin = station(4, [0, 2.1, 5.4], [0, 1.05, 0], 28);
  scene.add(buildTrace(proofOrigin, accent(4)));

  const productOrigin = station(5, [0.2, 2.05, 6.2], [0, 0.95, 0], 28);
  scene.add(buildTable(productOrigin, accent(5)));

  const partnerOrigin = station(6, [0, 2.15, -7.2], [0, 2.15, 0], 30);
  const partner = await createArcModel({ finCount: 96 });
  partner.setBand(Math.round(96 * 0.4), 1);
  partner.object.position.copy(partnerOrigin);
  partner.object.rotation.y = Math.PI;
  scene.add(partner.object);
  collectArcAccent(partner.object, 6);

  const fitOrigin = station(7, [0.2, 1.55, 5.2], [0, 0.7, 0], 30);
  scene.add(buildGauge(fitOrigin, accent(7)));

  const bookOrigin = station(8, [0.2, 2.05, 7.2], [0, 2.05, 0], 30);
  const book = await createArcModel({ finCount: 96 });
  book.setBand(Math.round(96 * 0.62), 1);
  book.object.position.copy(bookOrigin);
  book.object.rotation.y = 0.42;
  scene.add(book.object);
  collectArcAccent(book.object, 8);

  const curve = new THREE.CatmullRomCurve3(eyes, false, "catmullrom", 0.22);
  const lookCurve = new THREE.CatmullRomCurve3(looks, false, "catmullrom", 0.22);
  const pointer = new THREE.Vector2();
  let progress = 0;
  let time = 0;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const grade = new ShaderPass(filmShader);
  composer.addPass(grade);

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function apply() {
    const count = STATIONS.length - 1;
    const scaled = Math.min(count - 0.0001, progress * count);
    const index = Math.floor(scaled);
    const local = scaled - index;
    const eased = index + smooth(local);
    const u = eased / count;
    const position = curve.getPointAt(u);
    const look = lookCurve.getPointAt(u);
    const tangent = curve.getTangentAt(u);
    const previous = curve.getTangentAt(Math.max(0, u - 0.015));
    const turn = THREE.MathUtils.clamp((tangent.x - previous.x) * 3.5, -0.16, 0.16);
    position.x += pointer.x * 0.35;
    position.y += pointer.y * -0.18;
    look.x += pointer.x * 0.12;
    camera.up.set(Math.sin(turn), Math.cos(turn), 0);
    camera.position.copy(position);
    camera.lookAt(look);
    camera.fov = THREE.MathUtils.lerp(fovs[index] ?? 28, fovs[index + 1] ?? fovs[index] ?? 28, smooth(local));
    camera.updateProjectionMatrix();

    const warm = smooth((progress - 0.72) / 0.24);
    scene.background = DARK.clone().lerp(BONE, warm);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background);
    hemi.color.set(0x2a2f34).lerp(new THREE.Color(0xf6f1e8), warm);
    hemi.groundColor.set(0x0b0c0d).lerp(new THREE.Color(0xcfc8bc), warm);
    hemi.intensity = THREE.MathUtils.lerp(0.45, 0.85, warm);
    key.color.set(0xe7e4dc).lerp(new THREE.Color(0xfff3e4), warm);
    key.intensity = THREE.MathUtils.lerp(4.2, 2.4, warm);
    rim.intensity = THREE.MathUtils.lerp(2.1, 1.1, warm);
    floor.material = floor.material as THREE.MeshStandardMaterial;
    (floor.material as THREE.MeshStandardMaterial).color.set(0x1a1c1e).lerp(new THREE.Color(0xd9d4cb), warm);
    (wall.material as THREE.MeshStandardMaterial).color.set(0x181b1e).lerp(new THREE.Color(0xe4dfd6), warm);

    accents.forEach(({ index, material }) => {
      const distance = Math.abs(scaled - index);
      const on = 1 - smooth(Math.min(1, Math.max(0, (distance - 0.2) / 0.45)));
      material.color.copy(STEEL).lerp(ORANGE, on);
    });
    grade.uniforms.time.value = Math.floor(time / 33);
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
    },
  };
}

function buildDemo(origin: THREE.Vector3, hot: THREE.MeshStandardMaterial) {
  const group = new THREE.Group();
  group.position.copy(origin);
  const rail = new THREE.Mesh(new RoundedBoxGeometry(8.2, 0.16, 0.7, 2, 0.03), metal(0x2a2c2e, 0.4));
  rail.position.y = 0.08;
  group.add(rail);
  const fin = new RoundedBoxGeometry(0.08, 0.7, 0.28, 2, 0.01);
  const field = new THREE.InstancedMesh(fin, metal(0x9fa2a5, 0.42), 70);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let index = 0; index < 70; index += 1) {
    const u = index / 69;
    const height = 0.45 + Math.sin(u * Math.PI * 3) * 0.55;
    position.set(-3.4 + u * 6.8, 0.2 + height / 2, (index % 2 === 0 ? -0.12 : 0.12));
    matrix.compose(position, quaternion, scale.set(1, height, 1));
    field.setMatrixAt(index, matrix);
  }
  group.add(field);
  const carriage = new THREE.Group();
  carriage.position.set(-0.4, 0, 0);
  const beam = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.16, 1.4, 2, 0.03), metal(0x3a3d40, 0.3));
  beam.position.y = 1.7;
  carriage.add(beam);
  for (const z of [-0.55, 0.55]) {
    const leg = new THREE.Mesh(new RoundedBoxGeometry(0.08, 1.5, 0.08, 2, 0.02), metal(0xc9c8c4, 0.22));
    leg.position.set(0, 0.9, z);
    carriage.add(leg);
  }
  const tooth = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.42, 0.08, 1, 0.01), hot);
  tooth.position.set(0, 1.15, 0);
  carriage.add(tooth);
  group.add(carriage);
  return group;
}

function buildRings(origin: THREE.Vector3, hot: THREE.MeshStandardMaterial) {
  const group = new THREE.Group();
  group.position.copy(origin);
  [1.7, 1.25, 0.82].forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.055, 12, 80),
      index === 1 ? hot : metal(0xc4c2bc, 0.28),
    );
    ring.position.y = 1.55;
    ring.rotation.y = 0.4;
    group.add(ring);
  });
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.16, 1.1, 2, 0.03), metal(0x2a2c2e, 0.45));
  plinth.position.y = 0.08;
  group.add(plinth);
  return group;
}

function buildToolpath(origin: THREE.Vector3, hot: THREE.MeshStandardMaterial) {
  const group = new THREE.Group();
  group.position.copy(origin);
  const box = new RoundedBoxGeometry(0.42, 0.03, 0.2, 1, 0.004);
  const fins = new THREE.InstancedMesh(box, metal(0x2c3033, 0.5), 48);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const axis = new THREE.Vector3(0, 0, 1);
  for (let index = 0; index < 48; index += 1) {
    const u = index / 47;
    const angle = Math.PI * (1 - u);
    position.set(Math.cos(angle) * 2.4, 0.2 + Math.sin(angle) * 2.4, 0);
    quaternion.setFromAxisAngle(axis, angle);
    matrix.compose(position, quaternion, scale);
    fins.setMatrixAt(index, matrix);
  }
  group.add(fins);
  const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), hot);
  tool.position.set(0, 2.7, 0);
  tool.rotation.z = 0.3;
  group.add(tool);
  return group;
}

function buildTrace(origin: THREE.Vector3, hot: THREE.MeshStandardMaterial) {
  const group = new THREE.Group();
  group.position.copy(origin);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(4.6, 0.12, 2.6, 2, 0.03), metal(0x26282a, 0.48));
  plate.position.y = 0.9;
  group.add(plate);
  const spans = [0.35, 0.55, 0.2, 0.8, 0.45, 0.62];
  spans.forEach((span, index) => {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(span * 3.4, 0.05, 0.12),
      index === 3 ? hot : metal(0xd5d2cb, 0.4),
    );
    bar.position.set(-1.4 + span * 1.5, 1.02, -0.9 + index * 0.32);
    group.add(bar);
  });
  return group;
}

function buildTable(origin: THREE.Vector3, hot: THREE.MeshStandardMaterial) {
  const group = new THREE.Group();
  group.position.copy(origin);
  const top = new THREE.Mesh(new RoundedBoxGeometry(6.4, 0.14, 2.2, 2, 0.03), metal(0x3a3c3e, 0.42));
  top.position.y = 0.7;
  group.add(top);
  const relay = new THREE.Group();
  relay.position.set(-1.8, 0.78, 0);
  relay.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.28, 24), metal(0x8d8c89, 0.3)));
  const fins = new THREE.InstancedMesh(new RoundedBoxGeometry(0.16, 0.22, 0.03, 1, 0.004), metal(0xc9c8c4, 0.24), 18);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 18; index += 1) {
    const angle = (index / 18) * Math.PI * 2;
    matrix.makeRotationY(angle);
    matrix.setPosition(Math.cos(angle) * 0.48, 0.24, Math.sin(angle) * 0.48);
    fins.setMatrixAt(index, matrix);
  }
  relay.add(fins);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.02, 8, 32), hot);
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.16;
  relay.add(band);
  group.add(relay);

  const counter = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.55, 0.7, 3, 0.04), metal(0xb7b5b0, 0.28));
  counter.position.set(0.15, 1.05, 0.1);
  group.add(counter);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20), metal(0x2a2c2e, 0.35));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.15, 1.05, 0.46);
  group.add(dial);

  const roster = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.28, 2, 0.03), metal(0xd7d2c8, 0.4));
  roster.position.set(1.8, 1.2, 0);
  roster.rotation.y = -0.4;
  group.add(roster);
  return group;
}

function buildGauge(origin: THREE.Vector3, hot: THREE.MeshStandardMaterial) {
  const group = new THREE.Group();
  group.position.copy(origin);
  const base = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.14, 1.1, 2, 0.03), metal(0x8a8c8e, 0.4));
  base.position.y = 0.08;
  group.add(base);
  for (const side of [-1, 1]) {
    const block = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.7, 0.7, 3, 0.04), metal(side < 0 ? 0xc8c6c1 : 0x6e7276, 0.34));
    block.position.set(side * 0.58, 0.5, 0);
    group.add(block);
  }
  const fin = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.85, 0.16, 1, 0.01), hot);
  fin.position.set(0, 0.7, 0.15);
  group.add(fin);
  return group;
}
