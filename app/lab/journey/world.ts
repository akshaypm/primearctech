import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import * as THREE from "three";
import { createArcModel, type ArcModel } from "../../home/arc-model";
import {
  JOURNEY_SECONDS,
  STATIONS,
  cameraBlend,
  journeyMarks,
  journeyWarm,
  type JourneyMark,
  type JourneyStation,
} from "./copy";
import { buildDemo, buildEngagements, buildGauge, buildProducts, buildToolpath, buildTrace, type Piece } from "./pieces";

const ORANGE = new THREE.Color(0xd8643e);
const STEEL = new THREE.Color(0xb3b1ac);
const CHARCOAL = new THREE.Color(0x181b1e);
const BONE = new THREE.Color(0xe6dfd4);
const FLOOR_DARK = new THREE.Color(0x34373a);
const FLOOR_BONE = new THREE.Color(0xc9c2b4);
const GAP = 22;

const filmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    vig: { value: 0.93 },
    grain: { value: 0.035 },
    warm: { value: 0 },
  },
  vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time, vig, grain, warm;
    varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      vec4 color=texture2D(tDiffuse,vUv);
      vec2 d=vUv-0.5;
      d.x*=1.35;
      float v=smoothstep(0.98,0.35,length(d));
      color.rgb*=mix(vig,1.0,v);
      float luma=dot(color.rgb,vec3(0.2126,0.7152,0.0722));
      float curve=mix(0.72,1.0,smoothstep(0.1,0.45,luma));
      curve=mix(curve,1.0,warm);
      color.rgb=pow(max(color.rgb,0.0),vec3(curve));
      float g=hash(vUv*vec2(1440.0,900.0)+fract(time*0.13))-0.5;
      color.rgb+=g*grain;
      gl_FragColor=color;
    }
  `,
};

const floorShader = {
  uniforms: {
    reflection: { value: null as THREE.Texture | null },
    textureMatrix: { value: new THREE.Matrix4() },
    baseColor: { value: FLOOR_DARK.clone() },
    fogColor: { value: CHARCOAL.clone() },
    fogNear: { value: 10 },
    fogFar: { value: 46 },
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 vProj;
    varying vec3 vWorld;
    varying vec3 vNormal;
    void main(){
      vec4 world=modelMatrix*vec4(position,1.0);
      vWorld=world.xyz;
      vNormal=normalize(mat3(modelMatrix)*normal);
      vProj=textureMatrix*vec4(position,1.0);
      gl_Position=projectionMatrix*viewMatrix*world;
    }
  `,
  fragmentShader: `
    uniform sampler2D reflection;
    uniform vec3 baseColor;
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    varying vec4 vProj;
    varying vec3 vWorld;
    varying vec3 vNormal;
    void main(){
      vec2 uv=vProj.xy/vProj.w;
      vec3 refl=texture2D(reflection,uv).rgb;
      refl+=texture2D(reflection,uv+vec2(0.006,0.0)).rgb;
      refl+=texture2D(reflection,uv+vec2(-0.006,0.0)).rgb;
      refl+=texture2D(reflection,uv+vec2(0.0,0.006)).rgb;
      refl+=texture2D(reflection,uv+vec2(0.0,-0.006)).rgb;
      refl*=0.2;
      float inside=smoothstep(0.0,0.05,uv.x)*smoothstep(1.0,0.95,uv.x)*smoothstep(0.0,0.05,uv.y)*smoothstep(1.0,0.95,uv.y);
      vec3 n=normalize(vNormal);
      float ndl=clamp(dot(n,normalize(vec3(-0.25,1.0,0.35))),0.0,1.0);
      float seamX=smoothstep(0.47,0.5,abs(fract(vWorld.x*0.23)-0.5));
      float seamZ=smoothstep(0.47,0.5,abs(fract(vWorld.z*0.23)-0.5));
      vec3 base=baseColor*(0.78+ndl*0.2);
      base*=1.0-(seamX+seamZ)*0.22;
      vec3 viewDir=normalize(cameraPosition-vWorld);
      float fres=pow(1.0-clamp(dot(n,viewDir),0.0,1.0),2.2);
      vec3 color=mix(base,refl,clamp(fres*0.78*inside,0.0,0.72));
      float dist=length(cameraPosition-vWorld);
      float fogFactor=clamp((fogFar-dist)/(fogFar-fogNear),0.0,1.0);
      gl_FragColor=vec4(mix(fogColor,color,fogFactor),1.0);
    }
  `,
};

function smooth(value: number) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

type Rig = { eye: THREE.Vector3; look: THREE.Vector3; focal: number };

function rig(origin: THREE.Vector3, eye: [number, number, number], look: [number, number, number], focal: number): Rig {
  return {
    eye: origin.clone().add(new THREE.Vector3(...eye)),
    look: origin.clone().add(new THREE.Vector3(...look)),
    focal,
  };
}

function orbit(origin: THREE.Vector3, degrees: number, y: number, focal: number, radius = 13.6): Rig {
  const angle = THREE.MathUtils.degToRad(degrees);
  return {
    eye: origin.clone().add(new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius)),
    look: origin.clone().add(new THREE.Vector3(0, 1.58, 0)),
    focal,
  };
}

type Zone = { x: number; z: number; r: number; top: number };

function separate(point: THREE.Vector3, zones: Zone[]) {
  for (let pass = 0; pass < 3; pass += 1) {
    for (const zone of zones) {
      if (point.y > zone.top) continue;
      const dx = point.x - zone.x;
      const dz = point.z - zone.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= zone.r) continue;
      const scale = (zone.r + 0.7) / Math.max(distance, 0.04);
      point.x = zone.x + dx * scale;
      point.z = zone.z + dz * scale;
    }
  }
  point.y = Math.max(0.95, point.y);
}

function concreteTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#8d8f92";
  context.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1800; i += 1) {
    const shade = 90 + ((i * 17) % 50);
    context.fillStyle = `rgba(${shade},${shade},${shade},0.08)`;
    context.fillRect((i * 13) % 512, (i * 29) % 512, 2, 1);
  }
  context.strokeStyle = "rgba(20,22,24,0.18)";
  context.lineWidth = 2;
  context.strokeRect(8, 8, 496, 496);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(28, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export type JourneyWorld = {
  stations: JourneyStation[];
  seconds: number;
  marks: JourneyMark[];
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
  renderer.toneMappingExposure = 1.48;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const background = CHARCOAL.clone();
  scene.background = background;
  const fog = new THREE.Fog(CHARCOAL, 16, 86);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.08, 180);
  camera.filmGauge = 35;
  const mirror = new THREE.PerspectiveCamera(32, 1, 0.08, 180);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x1a1c1e, side: THREE.BackSide })));
  const soft = (width: number, height: number, x: number, y: number, z: number, color: number, gain: number) => {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(gain);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 2, 0);
    envScene.add(mesh);
  };
  soft(18, 3, 0, 7, 6, 0xfff4e8, 2.8);
  soft(10, 6, -8, 3, 2, 0xf1efe9, 1.5);
  soft(10, 5, 8, 3, 3, 0xd8d3ca, 1.2);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0x6a7178, 0x2a2e32, 1.45);
  const key = new THREE.DirectionalLight(0xf4f0e8, 5.1);
  key.position.set(-8, 12, 6);
  const fill = new THREE.DirectionalLight(0xc9c4ba, 1.25);
  fill.position.set(4, 6, 10);
  const endLight = new THREE.DirectionalLight(0xfff1e4, 0);
  endLight.position.set(GAP * 8 + 10, 9, 5);
  scene.add(hemi, key, fill, endLight);

  const hall = GAP * (STATIONS.length - 1);
  const origins = STATIONS.map((_, index) => new THREE.Vector3(index * GAP, 0, 0));
  const floorUniforms = floorShader.uniforms;
  const floorMat = new THREE.ShaderMaterial({
    uniforms: floorUniforms,
    vertexShader: floorShader.vertexShader,
    fragmentShader: floorShader.fragmentShader,
  });
  floorMat.toneMapped = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hall + 40, 56), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(hall / 2, 0, 0);
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3c4146, roughness: 0.62, metalness: 0.22, map: concreteTexture() });
  const wall = (width: number, height: number, x: number, y: number, z: number, rotY: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), wallMat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
  };
  wall(hall + 40, 6.6, hall / 2, 3.3, -24, 0);
  wall(hall + 40, 6.6, hall / 2, 3.3, 24, Math.PI);
  wall(48, 6.6, -18, 3.3, 0, Math.PI / 2);
  wall(48, 6.6, hall + 18, 3.3, 0, -Math.PI / 2);

  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.55, metalness: 0.3 });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(hall + 40, 50), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(hall / 2, 6.55, 0);
  scene.add(ceiling);

  const steel = new THREE.MeshStandardMaterial({ color: 0x9a9c9e, metalness: 0.82, roughness: 0.32 });
  const dummy = new THREE.Object3D();
  const ribCount = Math.ceil((hall + 24) / 4.4);
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.22, 44), steel, ribCount);
  ribs.frustumCulled = false;
  for (let index = 0; index < ribCount; index += 1) {
    dummy.position.set(-8 + index * 4.4, 6.35, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    ribs.setMatrixAt(index, dummy.matrix);
  }
  scene.add(ribs);

  const columnXs: number[] = [];
  for (let x = 11; x < hall; x += 22) columnXs.push(x);
  const columnZs = [-21, -9, 9, 21];
  const colCount = columnXs.length * columnZs.length;
  const columns = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 6.2, 0.46), steel, colCount);
  columns.frustumCulled = false;
  let column = 0;
  for (const x of columnXs) {
    for (const z of columnZs) {
      dummy.position.set(x, 3.1, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      columns.setMatrixAt(column, dummy.matrix);
      column += 1;
    }
  }
  columns.count = column;
  scene.add(columns);

  const slotMat = new THREE.MeshBasicMaterial({ color: 0xfff6ea });
  const slotAlong = Math.ceil((hall + 16) / 4.4);
  const slotRows = [-10, 0, 10];
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.07, 0.42), slotMat, slotAlong * slotRows.length);
  slots.frustumCulled = false;
  let slot = 0;
  for (const z of slotRows) {
    for (let index = 0; index < slotAlong; index += 1) {
      dummy.position.set(-6 + index * 4.4, 6.42, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      slots.setMatrixAt(slot, dummy.matrix);
      slot += 1;
    }
  }
  scene.add(slots);

  const shaftMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(0xf4efe4) }, opacity: { value: 0.08 } },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying vec2 vUv;
      void main(){
        float vertical=smoothstep(0.0,0.18,vUv.y)*smoothstep(1.0,0.2,vUv.y);
        float across=smoothstep(0.0,0.5,vUv.x)*smoothstep(1.0,0.5,vUv.x);
        float gain=vertical*across*opacity;
        gl_FragColor=vec4(color*gain,gain);
      }
    `,
  });
  const shaftCount = Math.ceil((hall + 16) / 8.8);
  const shafts = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 5.3), shaftMat, shaftCount * 2);
  shafts.frustumCulled = false;
  for (let index = 0; index < shaftCount; index += 1) {
    const x = -6 + index * 8.8;
    dummy.position.set(x, 3.45, -3.8);
    dummy.rotation.set(0, Math.PI / 2, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    shafts.setMatrixAt(index * 2, dummy.matrix);
    dummy.position.set(x, 3.45, 3.4);
    dummy.rotation.set(0, 0.18, 0);
    dummy.updateMatrix();
    shafts.setMatrixAt(index * 2 + 1, dummy.matrix);
  }
  scene.add(shafts);
  const endGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 2.2),
    new THREE.MeshBasicMaterial({ color: 0x3a342c, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  endGlow.position.set(hall - 2, 5.6, 0);
  scene.add(endGlow);

  const pools: THREE.PointLight[] = origins.map((origin) => {
    const light = new THREE.PointLight(0xf7f2ea, 8, 24, 2);
    light.position.set(origin.x, 3.6, 1.6);
    scene.add(light);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.7, 24),
      new THREE.MeshBasicMaterial({ color: 0xf1efe9, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(origin.x, 0.03, 0);
    scene.add(disc);
    return light;
  });

  const accents: { index: number; material: THREE.MeshStandardMaterial }[] = [];
  const ticks: ((timeMs: number) => void)[] = [];
  const place = (index: number, piece: Piece, lift = 0) => {
    const origin = origins[index] ?? new THREE.Vector3();
    piece.object.position.copy(origin);
    piece.object.position.y += lift;
    scene.add(piece.object);
    for (const material of piece.accents) accents.push({ index, material });
    if (piece.tick) ticks.push(piece.tick);
  };

  const [hero, partner, book] = await Promise.all([
    createArcModel({ finCount: 180 }),
    createArcModel({ finCount: 180 }),
    createArcModel({ finCount: 180 }),
  ]);
  hero.setBand(Math.round(hero.finCount * 0.66), 1);
  partner.setBand(Math.round(partner.finCount * 0.42), 1);
  book.setBand(Math.round(book.finCount * 0.62), 1);
  hero.object.position.copy(origins[0] ?? new THREE.Vector3());
  partner.object.position.copy(origins[6] ?? new THREE.Vector3());
  book.object.position.copy(origins[8] ?? new THREE.Vector3());
  book.object.rotation.y = 0.38;
  scene.add(hero.object, partner.object, book.object);
  trackArc(hero, 0, accents);
  trackArc(partner, 6, accents);
  trackArc(book, 8, accents);
  ticks.push((timeMs) => {
    hero.object.rotation.y = Math.sin(timeMs * 0.00055) * 0.03;
    partner.object.rotation.y = Math.sin(timeMs * 0.00045) * 0.025;
    book.object.rotation.y = 0.38 + Math.sin(timeMs * 0.0005) * 0.035;
  });

  place(1, buildDemo());
  place(2, buildEngagements(), 0.02);
  place(3, buildToolpath(), 0.12);
  place(4, buildTrace());
  place(5, buildProducts());
  place(7, buildGauge());

  const desktop: Rig[] = [
    rig(origins[0], [6, 1.25, 19.2], [-0.8, 1.15, 0], 56),
    rig(origins[1], [-6, 1.25, 19.2], [2.2, 1.15, 0], 36),
    rig(origins[2], [6, 1.25, 19.2], [-2.2, 1.15, 0], 44),
    rig(origins[3], [-6, 1.25, 19.2], [2.2, 1.15, 0], 52),
    rig(origins[4], [10, 5.6, 12.4], [-1.7, 0.28, 0.15], 38),
    rig(origins[5], [-6, 1.25, 19.2], [2.2, 1.15, 0], 44),
    rig(origins[6], [-6, 1.25, -19.2], [0.8, 1.15, 0], 56),
    rig(origins[7], [0, 1.22, 10], [0.85, 0.7, 0], 52),
    rig(origins[8], [6, 1.25, 19.2], [-0.8, 1.15, 0], 56),
  ];
  const portrait: Rig[] = [
    rig(origins[0], [0, 1.32, 18.6], [0, 1.0, 0], 32),
    rig(origins[1], [0, 1.55, 19], [0, 0.8, 0], 20),
    rig(origins[2], [0, 1.6, 18.4], [0, 0.9, 0], 24),
    rig(origins[3], [0, 1.35, 18.2], [0, 1.1, 0], 32),
    rig(origins[4], [0.4, 5.4, 15.5], [0, 0.25, 0], 22),
    rig(origins[5], [0, 2.3, 18], [0, 0.6, 0], 26),
    rig(origins[6], [0, 1.32, 18.6], [0, 1.0, 0], 32),
    rig(origins[7], [0, 1.65, 9.4], [0, 0.4, 0], 32),
    rig(origins[8], [0, 1.32, 18.6], [0, 1.0, 0], 32),
  ];

  const zones: Zone[] = [
    { x: origins[0]?.x ?? 0, z: 0, r: 6.3, top: 4.5 },
    { x: origins[1]?.x ?? 0, z: 0, r: 2.6, top: 2.8 },
    { x: origins[2]?.x ?? 0, z: 0, r: 3.5, top: 4.8 },
    { x: origins[3]?.x ?? 0, z: 0, r: 6.2, top: 4.5 },
    { x: origins[4]?.x ?? 0, z: 0, r: 3.8, top: 1.8 },
    { x: origins[5]?.x ?? 0, z: 0, r: 4.6, top: 2.4 },
    { x: origins[6]?.x ?? 0, z: 0, r: 8.4, top: 4.6 },
    { x: origins[7]?.x ?? 0, z: 0, r: 2.5, top: 2.3 },
    { x: origins[8]?.x ?? 0, z: 0, r: 6.5, top: 4.5 },
    ...columnXs.flatMap((x) =>
      [-21, -9, 9, 21].map((z) => ({ x, z, r: 0.7, top: 6.2 })),
    ),
  ];

  function segmentFor(list: Rig[], index: number) {
    const from = list[index];
    const to = list[index + 1];
    const next = origins[index + 1] ?? new THREE.Vector3();
    if (!from || !to) return null;
    const partnerOrigin = origins[6] ?? new THREE.Vector3();
    let points: Rig[];
    const approachesFromBehind = to.eye.z < -2;
    const leavesFromBehind = from.eye.z < -2;
    if (index === 5 && approachesFromBehind) {
      points = [
        from,
        orbit(partnerOrigin, 22, 2.05, 32, 14.6),
        orbit(partnerOrigin, 70, 1.9, 34, 14.2),
        orbit(partnerOrigin, 118, 1.75, 36, 14.2),
        orbit(partnerOrigin, 156, 1.68, 40, 13.8),
        to,
      ];
    } else if (index === 6 && leavesFromBehind) {
      points = [
        from,
        orbit(partnerOrigin, 198, 1.78, 36, 14.2),
        orbit(partnerOrigin, 248, 1.9, 34, 14.6),
        orbit(partnerOrigin, 304, 1.72, 34, 13.8),
        to,
      ];
    } else if (index === 7) {
      const beside = rig(origins[8] ?? next, [-3.4, 1.62, 16.2], [0.2, 1.55, 0], 36);
      const approach = rig(origins[8] ?? next, [-1.6, 1.48, 12.6], [-0.5, 1.6, 0], 42);
      points = [from, beside, approach, to];
    } else {
      const depart = from.eye.clone().lerp(to.eye, 0.3);
      depart.y = Math.max(1.3, Math.min(depart.y, 2.4));
      const mid = from.eye.clone().lerp(to.eye, 0.62);
      mid.y = Math.max(1.4, Math.min(2.5, mid.y + 0.15));
      mid.z = THREE.MathUtils.clamp(mid.z, 9, 17.5);
      const upcoming = next.clone().add(new THREE.Vector3(0, 1.15, 0));
      points = [
        from,
        { eye: depart, look: upcoming, focal: 36 },
        { eye: mid, look: upcoming.clone(), focal: 32 },
        to,
      ];
    }
    return {
      eye: new THREE.CatmullRomCurve3(points.map((point) => point.eye), false, "centripetal"),
      look: new THREE.CatmullRomCurve3(points.map((point) => point.look), false, "centripetal"),
      focal: points.map((point) => point.focal),
    };
  }

  const desktopSegments = desktop.slice(0, -1).map((_, index) => segmentFor(desktop, index));
  const portraitSegments = portrait.slice(0, -1).map((_, index) => segmentFor(portrait, index));

  const reflectRT = new THREE.WebGLRenderTarget(480, 300);
  floorUniforms.reflection.value = reflectRT.texture;
  const textureMatrix = new THREE.Matrix4();
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.02);
  const pointer = new THREE.Vector2();
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const behind = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const turn = new THREE.Vector3();
  const reflectedLook = new THREE.Vector3();
  let progress = 0;
  let time = 0;
  let portraitMode = false;

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
    portraitMode = camera.aspect < 0.85;
    camera.updateProjectionMatrix();
  }

  function apply() {
    const blend = cameraBlend(progress);
    const list = portraitMode ? portrait : desktop;
    const segments = portraitMode ? portraitSegments : desktopSegments;
    const from = list[blend.from];
    const to = list[blend.to] ?? from;
    if (!from || !to) return;
    let focal = from.focal;
    if (!blend.travel || blend.from === blend.to) {
      eye.copy(from.eye);
      look.copy(from.look);
      focal = from.focal;
    } else {
      const segment = segments[blend.from];
      if (!segment) return;
      segment.eye.getPoint(blend.t, eye);
      segment.look.getPoint(blend.t, look);
      focal = focalAt(segment.focal, blend.t);
      const wide = portraitMode ? 26 : 30;
      focal = THREE.MathUtils.lerp(focal, wide, Math.sin(blend.t * Math.PI) * 0.7);
      segment.eye.getTangent(Math.min(0.98, blend.t + 0.04), ahead);
      segment.eye.getTangent(Math.max(0.02, blend.t - 0.04), behind);
      turn.crossVectors(behind, ahead);
    }
    separate(eye, zones);
    const bank = blend.travel ? THREE.MathUtils.clamp(-turn.y * 2.4, -0.16, 0.16) : 0;
    forward.subVectors(look, eye);
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() > 1e-4) {
      right.normalize();
      eye.addScaledVector(right, pointer.x * 0.18);
      look.addScaledVector(right, pointer.x * 0.05);
    }
    eye.y += pointer.y * -0.08;
    separate(eye, zones);
    camera.up.set(Math.sin(bank), Math.cos(bank), 0);
    camera.position.copy(eye);
    camera.lookAt(look);
    camera.setFocalLength(focal);

    const warm = journeyWarm(progress);
    background.copy(CHARCOAL).lerp(BONE, warm);
    fog.color.copy(background);
    fog.near = THREE.MathUtils.lerp(16, 22, warm);
    fog.far = THREE.MathUtils.lerp(86, 98, warm);
    hemi.color.set(0x6a7178).lerp(new THREE.Color(0xefe6d8), warm);
    hemi.groundColor.set(0x2a2e32).lerp(new THREE.Color(0xc4bbae), warm);
    hemi.intensity = THREE.MathUtils.lerp(1.45, 0.85, warm);
    key.intensity = THREE.MathUtils.lerp(4.6, 1.35, warm);
    endLight.intensity = warm * 1.15;
    endLight.color.set(0xfff3e6);
    floorUniforms.baseColor.value.copy(FLOOR_DARK).lerp(FLOOR_BONE, warm);
    floorUniforms.fogColor.value.copy(background);
    floorUniforms.fogNear.value = fog.near;
    floorUniforms.fogFar.value = fog.far;
    wallMat.color.set(0x3c4146).lerp(new THREE.Color(0xddd6cb), warm);
    ceilingMat.color.set(0x2a2e32).lerp(new THREE.Color(0xd8d0c4), warm);
    shaftMat.uniforms.opacity.value = 0.07 + warm * 0.02;
    (endGlow.material as THREE.MeshBasicMaterial).opacity = 0.04 + warm * 0.16;
    (endGlow.material as THREE.MeshBasicMaterial).color.set(0x6a5344).lerp(new THREE.Color(0xf0e6d4), warm);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.32, 0.9, warm);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.9, 0.62, warm);
    grade.uniforms.warm.value = warm;

    const along = blend.travel ? blend.from + blend.t : blend.from;
    pools.forEach((light, index) => {
      const distance = Math.abs(index - along);
      light.intensity = 5 + (1 - smooth(Math.min(1, distance / 1.15))) * 12;
      if (index === STATIONS.length - 1) light.intensity += warm * 6;
    });
    for (const item of accents) {
      const distance = Math.abs(along - item.index);
      const on = distance >= 0.42 ? 0 : 1 - smooth(Math.max(0, distance - 0.12) / 0.3);
      item.material.color.copy(STEEL).lerp(ORANGE, on);
    }
    for (const tick of ticks) tick(time);
    grade.uniforms.time.value = time / 1000;
  }

  function reflect() {
    floor.visible = false;
    shafts.visible = false;
    endGlow.visible = false;
    mirror.position.copy(camera.position);
    mirror.position.y *= -1;
    mirror.up.set(camera.up.x, -camera.up.y, camera.up.z);
    reflectedLook.copy(look);
    reflectedLook.y *= -1;
    mirror.lookAt(reflectedLook);
    mirror.aspect = camera.aspect;
    mirror.fov = camera.fov;
    mirror.updateProjectionMatrix();
    mirror.updateMatrixWorld();
    const previous = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.clippingPlanes = [clipPlane];
    renderer.setRenderTarget(reflectRT);
    renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(null);
    renderer.clippingPlanes = [];
    renderer.toneMapping = previous;
    floor.visible = true;
    shafts.visible = true;
    endGlow.visible = true;
    floor.updateMatrixWorld(true);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(mirror.projectionMatrix);
    textureMatrix.multiply(mirror.matrixWorldInverse);
    textureMatrix.multiply(floor.matrixWorld);
    floorUniforms.textureMatrix.value.copy(textureMatrix);
  }

  function render() {
    apply();
    reflect();
    composer.render();
  }

  function resizeAll() {
    resize();
  }

  resizeAll();
  render();

  return {
    stations: STATIONS,
    seconds: JOURNEY_SECONDS,
    marks: journeyMarks(),
    setProgress(value) {
      progress = Math.min(1, Math.max(0, value));
    },
    setTime(ms) {
      time = ms;
    },
    setPointer(x, y) {
      pointer.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
    },
    render,
    resize: resizeAll,
    dispose() {
      reflectRT.dispose();
      composer.dispose();
      renderer.dispose();
      hero.dispose();
      partner.dispose();
      book.dispose();
      scene.environment?.dispose();
    },
  };
}
