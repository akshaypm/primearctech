import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { createAnim, type AnimApi, type AnimPack } from "./anim";
import { smootherstep } from "./animatic";
import { applyCamera, sampleCamera, type CamSample, type ExplodeFile, type StackParams } from "./camera";
import { fragmentShader, fragmentShaderMobile, skyFragmentShader, skyVertexShader, vertexShader } from "./shader";

const SPEC: Record<string, [number, number]> = {
  clay: [0.0176, 0.1],
  misc: [0.0176, 0.1],
  glaze: [0.02, 0.15],
  stone: [0.02, 0.12],
  sand: [0.0064, 0.0064],
  loss: [0.0064, 0.0064],
};
const SPECK: Record<string, number> = { clay: 1.3, misc: 1.3, glaze: 0.5, stone: 0.8, sand: 0.6, loss: 0.6 };
const NSTR: Record<string, number> = { clay: 2, misc: 2, glaze: 1, stone: 1, sand: 1, loss: 1 };
const ROUGHK: Record<string, number> = { clay: 4, misc: 4 };
const SUN = new THREE.Vector3(-0.07785, 0.7785, 0.6228).normalize();
const SCENES = ["loader", "hero", "input", "layers", "attn", "loss", "emb"] as const;
/** Story order ±1. A scene stays resident while it is current or a neighbour. */
const WINDOWS: Record<string, [number, number][]> = {
  loader: [[0, 12]],
  hero: [[0, 22], [46, 62.6]],
  input: [[3, 32]],
  layers: [[10, 42]],
  attn: [[18, 50]],
  loss: [[30, 58]],
  emb: [[40, 62.6]],
};

type TexRef = { index: number; LMAX?: number };
type LossExtra = {
  clayAlbedo: number;
  clayNormal: number;
  clayOrm: number;
  clayUvScale: number;
  grooveStep_m: number;
  grooveHalfWidth: number;
  grooveBump: number;
  grooveColor_linear: number[];
};
type MatExtra = {
  kind?: string;
  dynamic?: boolean;
  loss?: LossExtra;
  lightMap?: TexRef;
  lightMapAux?: TexRef;
  aoMap?: TexRef;
  ambient?: number[];
  ambientUp?: number[];
  ambientDown?: number[];
  ambientDir?: { a: number[]; x: number[]; y: number[]; z: number[] };
  colorFactor?: number[];
};
type MatDef = {
  name?: string;
  extras?: MatExtra;
  pbrMetallicRoughness?: { baseColorTexture?: { index: number }; metallicRoughnessTexture?: { index: number } };
  normalTexture?: { index: number };
};
type GroundOv = { object: string; lightMap: number; lightMapAux: number };
type Parser = {
  json: {
    materials: MatDef[];
    textures: { source?: number; extensions?: { EXT_texture_webp?: { source: number }; KHR_texture_basisu?: { source: number } } }[];
    images: { bufferView?: number; uri?: string }[];
    bufferViews?: { byteOffset?: number; byteLength: number }[];
    extras?: { groundOverride?: GroundOv; groundOverrides?: GroundOv[] };
    scenes: { extras?: { groundOverride?: GroundOv; groundOverrides?: GroundOv[] } }[];
  };
  getDependency: (type: string, index: number) => Promise<THREE.Texture>;
};
type Named = { o: THREE.Object3D; scene: string };
type GltfWithParser = { scene: THREE.Group; parser: Parser };

export type PoseOptions = {
  mobile: boolean;
  smoothCamera: boolean;
  loaderMix: number;
  dive: { node: string; u: number } | null;
  fullResidency: boolean;
};

export type MemoryReport = {
  rgbaBefore: number;
  rgbaUnique: number;
  gpuResident: number;
  textures: number;
  evicted: number;
};

export type ScreenPoint = { x: number; y: number; visible: boolean };
export type ScreenRect = { x0: number; y0: number; x1: number; y1: number };
export type Obstacle = ScreenRect & { name: string };

const HERO_BOOT = [
  "2d09530f296c3c4b",
  "790e6688a4e512a5",
  "2ae72f1e80fbfe1f",
  "d4656313769030f1",
  "870b703fa0ab1f32",
  "419522e4ec2f0b6f",
  "dbd15f2da7f154d3",
  "5aff43b117889ac5",
  "ba0acc59bd0974c0",
  "9be4acf44ecf1e0c",
  "eab03195b9cff1ff",
  "2903df03f4a93132",
  "f623b12969dff916",
  "9d40a4a7d2e5ee34",
  "d9a46f4e366bd09c",
  "87b1a7ed509d0d8a",
  "70e4d8d07018853a",
  "c79af46b834dfc2e",
];

function retargetGlb(buf: ArrayBuffer, from: string, to: string) {
  const view = new DataView(buf);
  const jsonLen = view.getUint32(12, true);
  const text = new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen));
  const payload = new TextEncoder().encode(text.replaceAll(from, to));
  const paddedLen = Math.ceil(payload.length / 4) * 4;
  const bin = new Uint8Array(buf, 20 + jsonLen);
  const out = new Uint8Array(12 + 8 + paddedLen + bin.length);
  out.set(new Uint8Array(buf, 0, 12), 0);
  const header = new DataView(out.buffer);
  header.setUint32(8, out.length, true);
  header.setUint32(12, paddedLen, true);
  header.setUint32(16, 0x4e4f534a, true);
  out.set(payload, 20);
  for (let i = payload.length; i < paddedLen; i += 1) out[20 + i] = 0x20;
  out.set(bin, 20 + paddedLen);
  return out.buffer;
}

export type NetworkWorld = {
  pose: (t: number, opts: PoseOptions) => void;
  render: () => void;
  resize: (cssW: number, cssH: number, dpr: number) => void;
  project: (name: string) => ScreenPoint | null;
  memory: () => MemoryReport;
  readonly threadCount: number;
  readonly threadWarnings: string[];
  readonly camera: THREE.PerspectiveCamera;
  readonly loaded: Promise<void>;
  readonly animReady: Promise<void>;
  sceneReady: (name: string) => Promise<void>;
  resident: () => string[];
  hasScene: (name: string) => boolean;
  projectBox: (name: string) => ScreenRect | null;
  /** Screen x of the nearer face's right edge, so a leader meets the clay rather than the far corner. */
  projectEdge: (name: string) => { x: number; y: number } | null;
  obstacles: (scenes: string[]) => Obstacle[];
  prefetch: (name: string) => void;
  startQueue: () => void;
  upgrade: () => void;
  dispose: () => void;
};

function nodeName(o: THREE.Object3D): string {
  const named = o.userData.name;
  return (typeof named === "string" && named) || o.name || "";
}

function sceneOf(o: THREE.Object3D): string {
  let x: THREE.Object3D | null = o;
  while (x) {
    const s = x.userData.sceneName;
    if (typeof s === "string" && s) return s;
    x = x.parent;
  }
  return "";
}

function isGroundName(name: string) {
  return name.startsWith("ground");
}

function v3(src: number[] | undefined, fallback: number[]) {
  return new THREE.Vector3().fromArray(src && src.length === 3 ? src : fallback);
}

function solid(value: number, srgb: boolean) {
  const data = new Uint8Array([value, value, value, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function textureBytes(tex: THREE.Texture): number {
  const compressed = tex as THREE.CompressedTexture;
  if (compressed.isCompressedTexture && compressed.mipmaps?.length) {
    return compressed.mipmaps.reduce((sum, mip) => sum + (mip.data?.byteLength || 0), 0);
  }
  const image = tex.image as { width?: number; height?: number } | null;
  const w = image?.width || 0;
  const h = image?.height || 0;
  if (!w || !h) return 0;
  const mipped = tex.generateMipmaps && tex.minFilter !== THREE.LinearFilter && tex.minFilter !== THREE.NearestFilter;
  return Math.round(w * h * 4 * (mipped ? 4 / 3 : 1));
}

function rgbaOf(tex: THREE.Texture): number {
  const image = tex.image as { width?: number; height?: number } | null;
  if (!image) return 0;
  const w = image.width || 0;
  const h = image.height || 0;
  return w && h ? w * h * 4 : 0;
}

async function sha256(data: BufferSource) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function imageKeys(buffer: ArrayBuffer, json: Parser["json"]) {
  const view = new DataView(buffer);
  const jsonLen = view.getUint32(12, true);
  const offset = 20 + jsonLen;
  const binStart = offset + 8;
  const keys = new Map<number, string>();
  for (let i = 0; i < json.images.length; i += 1) {
    const image = json.images[i];
    if (image.uri) {
      keys.set(i, `uri:${image.uri}`);
      continue;
    }
    const bv = json.bufferViews?.[image.bufferView ?? -1];
    if (!bv) continue;
    const start = binStart + (bv.byteOffset || 0);
    keys.set(i, await sha256(buffer.slice(start, start + bv.byteLength)));
  }
  return keys;
}

function imageIndex(json: Parser["json"], textureIndex: number) {
  const tex = json.textures[textureIndex];
  if (!tex) return -1;
  return tex.extensions?.KHR_texture_basisu?.source ?? tex.extensions?.EXT_texture_webp?.source ?? tex.source ?? -1;
}

type TexRec = { tex: THREE.Texture; scenes: Set<string>; ground: boolean; evicted: boolean; image: unknown; bytes: number };

export async function loadWorld(
  renderer: THREE.WebGLRenderer,
  mobileShader: boolean,
  source: "ktx" | "original",
  onProgress: (ratio: number, label: string) => void,
  quality: "boot" | "full" = "full",
): Promise<NetworkWorld> {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#EFE6D6");
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 3000);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: { hz: { value: new THREE.Color("#EFE6D6") }, sk: { value: new THREE.Color("#E4D8C4") } },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
    }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);

  const draco = new DRACOLoader();
  draco.setDecoderPath("/network/draco/");
  const hooked = draco as DRACOLoader & {
    workerSourceURL: string;
    decoderPending: Promise<void> | null;
    _initDecoder: () => Promise<void>;
  };
  hooked._initDecoder = function initSameOrigin() {
    this.workerSourceURL = "/network/draco/draco-worker.js";
    this.decoderPending = Promise.resolve();
    return this.decoderPending;
  };
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath("/network/basis/");
  ktx2.detectSupport(renderer);
  const textureFetches = new Map<string, Promise<ArrayBuffer>>();
  const textureKey = (url: string) => {
    try {
      return new URL(url, "http://localhost").pathname;
    } catch {
      return url.split("?")[0];
    }
  };
  const fetchTexture = (url: string) => {
    const key = textureKey(url);
    let pending = textureFetches.get(key);
    if (!pending) {
      pending = fetch(key, { priority: "high" } as RequestInit).then((response) => {
        if (!response.ok) throw new Error(`missing ${key} (${response.status})`);
        return response.arrayBuffer();
      });
      textureFetches.set(key, pending);
    }
    return pending;
  };
  ktx2.load = (url, onLoad, _onProgress, onError) => {
    fetchTexture(url).then(
      (buffer) => {
        ktx2.parse(buffer, onLoad, onError);
      },
      (error: unknown) => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      },
    );
  };
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(ktx2);

  const anim = createAnim();
  const packLoaded = new Map<string, Promise<void>>();
  const high = { priority: "high" } as RequestInit;
  if (quality === "boot") {
    for (const id of HERO_BOOT) void fetchTexture(`/network/boot/${id}.ktx2`);
  }
  void fetch("/network/anim/scenes/hero.json", high);
  void fetch("/network/anim/scenes/hero.bin", high);
  const loadPack = (scene: string) => {
    const file = scene === "loader" ? "hero" : scene;
    let pending = packLoaded.get(file);
    if (!pending) {
      pending = (async () => {
        const pack = (await fetch(`/network/anim/scenes/${file}.json`).then((r) => {
          if (!r.ok) throw new Error(`missing ${file} anim (${r.status})`);
          return r.json();
        })) as AnimPack;
        const bin = await fetch(`/network/anim/scenes/${pack.bin}`).then((r) => {
          if (!r.ok) throw new Error(`missing ${pack.bin} (${r.status})`);
          return r.arrayBuffer();
        });
        anim.addPack(pack, bin);
      })();
      packLoaded.set(file, pending);
    }
    return pending;
  };
  const animReady = loadPack("hero");
  const heroBufP = fetch(`/network/${source}/hero-baked.glb`, high).then((r) => {
    if (!r.ok) throw new Error(`missing hero glb (${r.status})`);
    return r.arrayBuffer();
  });
  const [world, samples, exj, params, heroBuf] = await Promise.all([
    fetch("/network/world.json").then((r) => r.json() as Promise<{ scenes: string[] }>),
    fetch("/network/camera-path-stack.json").then((r) => r.json() as Promise<{ samples: CamSample[] }>),
    fetch("/network/stack-explode.json").then((r) => r.json() as Promise<ExplodeFile>),
    fetch("/network/stack_v7_params.json").then((r) => r.json() as Promise<StackParams>),
    heroBufP,
    animReady,
  ]);
  onProgress(0.08, "hero");

  const white = solid(255, true);
  const linearWhite = solid(255, false);
  const fogCol = new THREE.Vector3(new THREE.Color("#EFE6D6").r, new THREE.Color("#EFE6D6").g, new THREE.Color("#EFE6D6").b);
  const fragment = mobileShader ? fragmentShaderMobile : fragmentShader;
  const nodeObj: Record<string, Named[]> = {};
  const roots = new Map<string, THREE.Object3D>();
  const materials: THREE.ShaderMaterial[] = [];
  const canon = new Map<string, THREE.Texture>();
  const records = new Map<THREE.Texture, TexRec>();
  const dupes: THREE.Texture[] = [];
  let rgbaBefore = 0;
  let rgbaUnique = 0;

  function adopt(tex: THREE.Texture, key: string, srgb: boolean, light: boolean) {
    rgbaBefore += rgbaOf(tex);
    const id = `${key}:${srgb ? "s" : "l"}:${light ? "lm" : "map"}`;
    const hit = canon.get(id);
    if (!hit) {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.flipY = false;
      if (light) {
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
      }
      canon.set(id, tex);
      rgbaUnique += rgbaOf(tex);
      records.set(tex, { tex, scenes: new Set(), ground: false, evicted: false, image: tex.image, bytes: textureBytes(tex) });
      return tex;
    }
    if (hit !== tex) dupes.push(tex);
    return hit;
  }

  function tag(tex: THREE.Texture | null, sceneName: string, ground: boolean) {
    if (!tex) return;
    const rec = records.get(tex);
    if (!rec) return;
    rec.scenes.add(sceneName);
    if (ground) rec.ground = true;
  }

  const fs = fragment;
  function makeMaterial(uniforms: Record<string, { value: unknown }>, hasColor: boolean) {
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader: fs,
      defines: hasColor ? { HAS_COLOR: 1 } : {},
    });
    material.toneMapped = false;
    materials.push(material);
    return material;
  }

  let groundOverride: { lm: THREE.Texture; aux: THREE.Texture; object: string } | null = null;
  const layersGround: { lm: THREE.Texture; aux: THREE.Texture; object: string }[] = [];
  const order = SCENES.filter((name) => world.scenes.includes(name));
  const upgrades: { tex: THREE.Texture; url: string }[] = [];
  let loadedCount = 0;
  const restWorld = new Map<THREE.Object3D, THREE.Matrix4>();
  const lossScale = new Map<THREE.Object3D, number>();
  const byName: Record<string, THREE.Object3D[]> = {};
  const rotorRest = new Map<THREE.Object3D, THREE.Quaternion>();
  let threadCount = 0;
  let threadsStarted = false;
  let lastLive: string[] = [];
  const readyResolve = new Map<string, () => void>();
  const readyPromise = new Map<string, Promise<void>>(
    order.map((name) => [name, new Promise<void>((resolve) => readyResolve.set(name, resolve))]),
  );

  async function loadScene(name: string, preset?: ArrayBuffer) {
    await loadPack(name);
    let buf = preset ?? await fetch(`/network/${source}/${name}-baked.glb`).then((r) => {
      if (!r.ok) throw new Error(`missing ${name} glb (${r.status})`);
      return r.arrayBuffer();
    });
    if (name === "hero" && quality === "boot" && source === "ktx") buf = retargetGlb(buf, "../tex/", "../boot/");
    const header = new DataView(buf);
    const jsonLen = header.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as Parser["json"];
    const keys = await imageKeys(buf, json);
    const gltf = (await loader.parseAsync(buf, `/network/${source}/`)) as GltfWithParser;
    const parser = gltf.parser;
    parser.json = json;
    const texCache = new Map<string, THREE.Texture>();
    async function take(index: number, srgb: boolean, repeat = false, light = false) {
      const cacheKey = `${index}:${srgb ? 1 : 0}:${repeat ? 1 : 0}:${light ? 1 : 0}`;
      const cached = texCache.get(cacheKey);
      if (cached) return cached;
      const raw = await parser.getDependency("texture", index);
      const image = imageIndex(json, index);
      const key = keys.get(image) || `tex:${name}:${index}`;
      const canonical = key.startsWith("uri:../boot/") ? `uri:../tex/${key.slice("uri:../boot/".length)}` : key;
      const tex = adopt(raw, canonical, srgb, light);
      if (key.startsWith("uri:../boot/")) upgrades.push({ tex, url: `/network/tex/${key.slice("uri:../boot/".length)}` });
      if (repeat) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
      }
      texCache.set(cacheKey, tex);
      return tex;
    }
    const extras = json.extras || json.scenes[0]?.extras || {};
    const overrides = extras.groundOverrides || (extras.groundOverride ? [extras.groundOverride] : []);
    if (name === "layers") {
      for (const g of overrides) {
        const lm = await take(g.lightMap, true, false, true);
        const aux = await take(g.lightMapAux, false, false, true);
        tag(lm, "layers", true);
        tag(aux, "layers", true);
        layersGround.push({ lm, aux, object: g.object });
      }
    }
    if (name === "loader" && extras.groundOverride) {
      const g = extras.groundOverride;
      const lm = await take(g.lightMap, true, false, true);
      const aux = await take(g.lightMapAux, false, false, true);
      tag(lm, "loader", true);
      tag(aux, "loader", true);
      groundOverride = { lm, aux, object: g.object };
    }
    const matByName = new Map<string, MatDef>();
    for (const def of json.materials) if (def.name) matByName.set(def.name, def);
    const built = new Map<string, THREE.ShaderMaterial>();
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
    for (const mesh of meshes) {
      const sourceMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const def = matByName.get(sourceMat?.name || "");
      if (!def) throw new Error(`${name}: no material extras for ${nodeName(mesh)} (${sourceMat?.name || "unnamed"})`);
      const ex = def.extras || {};
      const kind = ex.kind || "clay";
      const hasColor = Boolean(mesh.geometry.attributes.color);
      const key = `${def.name || kind}${hasColor ? ":c" : ""}`;
      let material = built.get(key);
      if (!material) {
        const dyn = Boolean(ex.dynamic);
        const loss = ex.loss;
        const pbr = def.pbrMetallicRoughness || {};
        if (!mesh.geometry.attributes.uv1 && mesh.geometry.attributes.uv) mesh.geometry.setAttribute("uv1", mesh.geometry.attributes.uv);
        const uniforms = {
          map: { value: pbr.baseColorTexture ? await take(pbr.baseColorTexture.index, true) : white },
          normalMap: { value: def.normalTexture ? await take(def.normalTexture.index, false) : linearWhite },
          ormMap: { value: pbr.metallicRoughnessTexture ? await take(pbr.metallicRoughnessTexture.index, false) : linearWhite },
          lightMap: { value: ex.lightMap ? await take(ex.lightMap.index, true, false, true) : white },
          lmAux: { value: ex.lightMapAux ? await take(ex.lightMapAux.index, false, false, true) : ex.aoMap ? await take(ex.aoMap.index, false, false, true) : linearWhite },
          hasLm: { value: ex.lightMap ? 1 : 0 },
          hasAo: { value: ex.aoMap ? 1 : 0 },
          lmMax: { value: ex.lightMap?.LMAX ?? 2 },
          nStr: { value: NSTR[kind] ?? 1 },
          detail: { value: 1 },
          specK: { value: SPECK[kind] ?? 1 },
          roughK: { value: ROUGHK[kind] || 0 },
          dynamicMat: { value: dyn ? 1 : 0 },
          dbg: { value: 0 },
          ambient: { value: v3(ex.ambient, [0.3, 0.3, 0.3]) },
          hemiOn: { value: ex.ambientUp ? 1 : 0 },
          adOn: { value: ex.ambientDir ? 1 : 0 },
          adA: { value: v3(ex.ambientDir?.a, [0, 0, 0]) },
          adX: { value: v3(ex.ambientDir?.x, [0, 0, 0]) },
          adY: { value: v3(ex.ambientDir?.y, [0, 0, 0]) },
          adZ: { value: v3(ex.ambientDir?.z, [0, 0, 0]) },
          ambUp: { value: v3(ex.ambientUp, [0, 0, 0]) },
          ambDn: { value: v3(ex.ambientDown, [0, 0, 0]) },
          shSun: { value: 0 },
          shPcss: { value: 0 },
          shRange: { value: 1 },
          shUvM: { value: 0 },
          colorFactor: { value: ex.colorFactor ? v3(ex.colorFactor, [-1, -1, -1]) : new THREE.Vector3(-1, -1, -1) },
          sunDir: { value: SUN.clone() },
          sunIrr: { value: new THREE.Vector3(1.01859, 0.99313, 0.95748) },
          envCol: { value: new THREE.Vector3(0.86, 0.82, 0.76) },
          f0fm: { value: new THREE.Vector2(...(SPEC[kind] || SPEC.clay)) },
          isLoss: { value: loss ? 1 : 0 },
          clayMap: { value: loss ? await take(loss.clayAlbedo, true, true) : white },
          clayNormal: { value: loss ? await take(loss.clayNormal, false, true) : linearWhite },
          clayOrm: { value: loss ? await take(loss.clayOrm, false, true) : linearWhite },
          clayScale: { value: loss ? loss.clayUvScale : 1 },
          grooveStep: { value: loss ? loss.grooveStep_m : 1 },
          grooveHW: { value: loss ? loss.grooveHalfWidth : 0.055 },
          grooveBump: { value: loss ? loss.grooveBump : 0 },
          grooveCol: { value: v3(loss?.grooveColor_linear, [0, 0, 0]) },
          lightMap2: { value: white },
          lmAux2: { value: linearWhite },
          lm2Mix: { value: 0 },
          aoFloor: { value: 0 },
          aoMix: { value: 0 },
          shMap: { value: linearWhite },
          shMat: { value: new THREE.Matrix4() },
          shOn: { value: 0 },
          shStr: { value: 0.45 },
          shBias: { value: 0 },
          shNo: { value: 0 },
          shTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
          fillK: { value: 0 },
          fillCol: { value: new THREE.Vector3(1, 0.93, 0.855) },
          layersClay: { value: 1 },
          opacity_: { value: 1 },
          noFlip: { value: 0 },
          fogCol: { value: fogCol },
          fogNear: { value: 8 },
          fogFar: { value: 63 },
        };
        material = makeMaterial(uniforms, hasColor);
        material.userData.baseGroove = loss ? loss.grooveBump : 0;
        material.userData.kind = kind;
        built.set(key, material);
        const groundMat = (def.name || "").startsWith("ground") || kind === "sand" || Boolean(loss);
        for (const tex of [uniforms.map.value, uniforms.normalMap.value, uniforms.ormMap.value, uniforms.lightMap.value, uniforms.lmAux.value, uniforms.clayMap.value, uniforms.clayNormal.value, uniforms.clayOrm.value]) {
          if (tex instanceof THREE.Texture) tag(tex, name, groundMat && (tex === uniforms.lightMap.value || tex === uniforms.lmAux.value || kind === "sand"));
        }
      }
      mesh.material = material;
    }
    gltf.scene.userData.sceneName = name;
    roots.set(name, gltf.scene);
    gltf.scene.traverse((o) => {
      if (o === gltf.scene) return;
      const nn = nodeName(o);
      if (!nn) return;
      (nodeObj[nn] = nodeObj[nn] || []).push({ o, scene: name });
    });
    scene.add(gltf.scene);
    scene.updateMatrixWorld(true);
    addSkirts(nodeObj, materials);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.userData.baseMat = mesh.material;
    });
    if (name === "layers") {
      for (const nd of exj.nodes) {
        const hit = (nodeObj[nd.node] || []).find((e) => e.scene === "layers");
        if (hit) restWorld.set(hit.o, hit.o.matrixWorld.clone());
      }
    }
    for (const e of nodeObj.ground_loss || []) if (!lossScale.has(e.o)) lossScale.set(e.o, e.o.scale.y);
    for (const key of Object.keys(byName)) delete byName[key];
    for (const [node, list] of Object.entries(nodeObj)) byName[node] = list.map((e) => e.o);
    if (name === "attn" && !threadsStarted) {
      threadsStarted = true;
      threadCount = await anim.initThreads(byName);
      for (const list of Object.values(nodeObj)) {
        for (const e of list) {
          if (!nodeName(e.o).startsWith("ATTN_th")) continue;
          e.o.traverse((x) => {
            const mesh = x as THREE.Mesh;
            if (mesh.isMesh) mesh.frustumCulled = false;
          });
        }
      }
    }
    for (const tex of dupes) {
      if (![...canon.values()].includes(tex)) tex.dispose();
    }
    dupes.length = 0;
    anim.invalidate();
    loadedCount += 1;
    onProgress(0.08 + (0.84 * loadedCount) / order.length, name);
    readyResolve.get(name)?.();
  }

  const heroReadyBuf = heroBuf;
  await loadScene("hero", heroReadyBuf);
  const queue = order.filter((name) => name !== "hero");
  let prefer: string | null = null;
  let pumping = false;
  let queueStarted = false;
  let resolveLoaded = () => {};
  let rejectLoaded: (error: unknown) => void = () => {};
  const loaded = new Promise<void>((resolve, reject) => {
    resolveLoaded = resolve;
    rejectLoaded = reject;
  });
  const pump = () => {
    if (!queueStarted || pumping) return;
    if (!queue.length) {
      resolveLoaded();
      return;
    }
    let index = 0;
    if (prefer) {
      const at = queue.indexOf(prefer);
      if (at >= 0) index = at;
    }
    const name = queue.splice(index, 1)[0];
    prefer = null;
    pumping = true;
    void loadScene(name)
      .then(() => {
        pumping = false;
        pump();
      })
      .catch((error) => {
        pumping = false;
        rejectLoaded(error);
      });
  };

  const variant = new Map<string, THREE.ShaderMaterial>();
  function vary(material: THREE.ShaderMaterial, key: string) {
    const id = `${material.uuid}:${key}`;
    let next = variant.get(id);
    if (!next) {
      next = material.clone();
      next.userData.baseGroove = material.userData.baseGroove;
      materials.push(next);
      variant.set(id, next);
    }
    return next;
  }

  let shadow: {
    target: THREE.WebGLRenderTarget;
    camera: THREE.OrthographicCamera;
    matrix: THREE.Matrix4;
    depth: THREE.MeshBasicMaterial;
    size: number;
    mode: string;
  } | null = null;
  const shadowed = new Set<THREE.ShaderMaterial>();

  let cssW = 1440;
  let cssH = 900;

  function resize(w: number, h: number, ratio: number) {
    cssW = Math.max(1, w);
    cssH = Math.max(1, h);
    renderer.setPixelRatio(ratio);
    renderer.setSize(cssW, cssH, false);
    camera.aspect = cssW / cssH;
  }

  const boxA = new THREE.Box3();
  const boxB = new THREE.Box3();
  const corner = new THREE.Vector3();
  function boxToScreen(box: THREE.Box3): ScreenRect | null {
    if (box.isEmpty()) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let any = false;
    const min = box.min;
    const max = box.max;
    for (let i = 0; i < 8; i += 1) {
      corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
      corner.project(camera);
      if (corner.z < -1 || corner.z > 1) continue;
      any = true;
      const x = (corner.x * 0.5 + 0.5) * cssW;
      const y = (-corner.y * 0.5 + 0.5) * cssH;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (!any) return null;
    return { x0, y0, x1, y1 };
  }
  function meshBox(mesh: THREE.Mesh) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds) return null;
    return boxB.copy(bounds).applyMatrix4(mesh.matrixWorld);
  }
  function project(name: string): ScreenPoint | null {
    const list = nodeObj[name];
    if (!list?.length) return null;
    const entry = list.find((e) => e.o.visible) || list[0];
    const v = new THREE.Vector3();
    entry.o.getWorldPosition(v);
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * cssW, y: (-v.y * 0.5 + 0.5) * cssH, visible: v.z >= -1 && v.z <= 1 };
  }
  function sceneScreen(scene: string): ScreenRect | null {
    const parts: ScreenRect[] = [];
    const all: ScreenRect[] = [];
    for (const list of Object.values(nodeObj)) {
      for (const entry of list) {
        if (entry.scene !== scene) continue;
        const mesh = entry.o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible || isGroundName(nodeName(mesh))) continue;
        const next = meshBox(mesh);
        if (!next) continue;
        const rect = boxToScreen(next);
        if (!rect) continue;
        const w = rect.x1 - rect.x0;
        const h = rect.y1 - rect.y0;
        if (w < 6 || h < 6 || w > cssW * 1.6 || h > cssH * 1.6) continue;
        if (rect.x1 < -cssW || rect.x0 > cssW * 2 || rect.y1 < -cssH || rect.y0 > cssH * 2) continue;
        all.push(rect);
        if (w < cssW * 0.62 && h < cssH * 0.72) parts.push(rect);
      }
    }
    const use = parts.length >= 3 ? parts : all;
    if (!use.length) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const rect of use) {
      x0 = Math.min(x0, rect.x0);
      y0 = Math.min(y0, rect.y0);
      x1 = Math.max(x1, rect.x1);
      y1 = Math.max(y1, rect.y1);
    }
    return { x0, y0, x1, y1 };
  }
  let pixelBuf = new Uint8Array(0);
  function measureClay(): ScreenRect | null {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const bw = gl.drawingBufferWidth;
    const bh = gl.drawingBufferHeight;
    if (bw < 8 || bh < 8) return null;
    const need = bw * bh * 4;
    if (pixelBuf.length < need) pixelBuf = new Uint8Array(need);
    gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf);
    const xs: number[] = [];
    const ys: number[] = [];
    const yStart = Math.floor(bh * 0.06);
    const yEnd = Math.floor(bh * 0.82);
    for (let y = yStart; y < yEnd; y += 2) {
      for (let x = 0; x < bw; x += 2) {
        const i = (y * bw + x) * 4;
        const r = pixelBuf[i];
        const g = pixelBuf[i + 1];
        const b = pixelBuf[i + 2];
        if (r < 165 && g < 150 && b < 140 && r + g + b > 36) {
          xs.push(x);
          ys.push(y);
        }
      }
    }
    if (xs.length < 24) return null;
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const pick = (values: number[], p: number) => values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * p)))];
    const xLo = pick(xs, 0.1);
    const xHi = pick(xs, 0.9);
    const yLo = pick(ys, 0.1);
    const yHi = pick(ys, 0.9);
    return {
      x0: (xLo / bw) * cssW,
      x1: (xHi / bw) * cssW,
      y0: cssH * (1 - (yHi + 1) / bh),
      y1: cssH * (1 - yLo / bh),
    };
  }
  function fitPortrait(scene: string) {
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    let box = measureClay() ?? sceneScreen(scene);
    if (!box) return;
    for (let pass = 0; pass < 2; pass += 1) {
      const bw = Math.max(8, box.x1 - box.x0);
      const bh = Math.max(8, box.y1 - box.y0);
      let scale = (cssW * 0.7) / bw;
      if (bh * scale > cssH * 0.46) scale = (cssH * 0.46) / bh;
      scale = Math.min(2.4, Math.max(pass === 0 ? 1 : 0.72, scale));
      const half = Math.tan((camera.fov * Math.PI) / 360);
      camera.fov = (Math.atan(half / scale) * 360) / Math.PI;
      camera.aspect = cssW / cssH;
      camera.clearViewOffset();
      box = measureClay() ?? box;
    }
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    camera.setViewOffset(cssW, cssH, cx - cssW / 2, cy - cssH * 0.34, cssW, cssH);
  }
  const edgeWorld = new THREE.Vector3();
  const edgeView = new THREE.Vector3();
  function projectEdge(name: string): { x: number; y: number } | null {
    const list = nodeObj[name];
    if (!list?.length) return null;
    const entry = list.find((e) => e.o.visible);
    if (!entry) return null;
    const points: { z: number; x: number; y: number }[] = [];
    entry.o.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      if (!bounds) return;
      for (let i = 0; i < 8; i += 1) {
        edgeWorld.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z);
        edgeWorld.applyMatrix4(mesh.matrixWorld);
        edgeView.copy(edgeWorld).applyMatrix4(camera.matrixWorldInverse);
        const projected = edgeWorld.project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        points.push({
          z: edgeView.z,
          x: (projected.x * 0.5 + 0.5) * cssW,
          y: (-projected.y * 0.5 + 0.5) * cssH,
        });
      }
    });
    if (points.length < 2) return null;
    points.sort((a, b) => b.z - a.z);
    const near = points.slice(0, Math.max(2, Math.ceil(points.length / 2)));
    return {
      x: Math.max(...near.map((point) => point.x)),
      y: near.reduce((sum, point) => sum + point.y, 0) / near.length,
    };
  }
  function projectBox(name: string): ScreenRect | null {
    const list = nodeObj[name];
    if (!list?.length) return null;
    const entry = list.find((e) => e.o.visible);
    if (!entry) return null;
    boxA.makeEmpty();
    entry.o.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const next = meshBox(mesh);
      if (next) boxA.union(next);
    });
    return boxToScreen(boxA);
  }
  function obstacles(scenes: string[]): Obstacle[] {
    const want = new Set(scenes);
    const out: Obstacle[] = [];
    const seen = new Set<THREE.Object3D>();
    for (const [name, list] of Object.entries(nodeObj)) {
      if (name.startsWith("ground")) continue;
      for (const entry of list) {
        if (!want.has(entry.scene)) continue;
        const mesh = entry.o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.visible || seen.has(mesh)) continue;
        seen.add(mesh);
        const next = meshBox(mesh);
        if (!next) continue;
        const rect = boxToScreen(next);
        if (!rect) continue;
        const w = rect.x1 - rect.x0;
        const h = rect.y1 - rect.y0;
        if (w < 8 || h < 8 || (w > cssW * 0.92 && h > cssH * 0.92)) continue;
        out.push({ name, x0: rect.x0 - 10, y0: rect.y0 - 10, x1: rect.x1 + 10, y1: rect.y1 + 10 });
      }
    }
    return out;
  }
  let upgraded = false;
  function upgrade() {
    if (upgraded || !upgrades.length) return;
    upgraded = true;
    const seen = new Set<string>();
    const batch = upgrades.splice(0).filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
    void (async () => {
      for (const item of batch) {
        try {
          const full = await ktx2.loadAsync(item.url);
          item.tex.dispose();
          item.tex.mipmaps = full.mipmaps;
          item.tex.image = full.image;
          item.tex.format = full.format;
          item.tex.generateMipmaps = false;
          item.tex.needsUpdate = true;
          const rec = records.get(item.tex);
          if (rec) rec.bytes = textureBytes(item.tex);
        } catch (error) {
          console.error(error);
        }
      }
    })();
  }

  function liveScenes(t: number, full: boolean) {
    if (full) return new Set(order);
    const live = new Set<string>();
    for (const name of order) {
      if ((WINDOWS[name] || []).some(([a, b]) => t >= a && t < b)) live.add(name);
    }
    return live;
  }

  function syncResidency(live: Set<string>) {
    for (const list of Object.values(nodeObj)) {
      for (const e of list) {
        const mesh = e.o as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const ground = isGroundName(nodeName(mesh));
        const on = ground || live.has(e.scene);
        if (!on) {
          mesh.visible = false;
          mesh.userData.evicted = true;
        } else if (mesh.userData.evicted) {
          mesh.userData.evicted = false;
          if (!mesh.userData.animHidden) mesh.visible = true;
        }
      }
    }
    for (const rec of records.values()) {
      const needed = rec.ground || [...rec.scenes].some((s) => live.has(s));
      if (needed && rec.evicted) {
        rec.tex.needsUpdate = true;
        rec.evicted = false;
      } else if (!needed && !rec.evicted && rec.tex !== white && rec.tex !== linearWhite) {
        rec.tex.dispose();
        rec.evicted = true;
      }
    }
  }

  function clearShadow() {
    for (const material of shadowed) material.uniforms.shOn.value = 0;
    shadowed.clear();
  }

  function ensureShadow(size: number, mode: string) {
    if (shadow && shadow.size === size && shadow.mode === mode) return shadow;
    shadow?.target.dispose();
    const target = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.depthTexture = new THREE.DepthTexture(size, size);
    target.depthTexture.type = THREE.UnsignedIntType;
    shadow = {
      target,
      camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400),
      matrix: new THREE.Matrix4(),
      depth: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false }),
      size,
      mode,
    };
    return shadow;
  }

  function bindShadow(mesh: THREE.Mesh, pass: NonNullable<typeof shadow>, str: number, sun: number, pcss: number, bias: number, normalOff: number, range: number, uvM: number) {
    const material = mesh.material as THREE.ShaderMaterial;
    if (!material.uniforms) return;
    const u = material.uniforms;
    u.shOn.value = 1;
    u.shMap.value = pass.target.depthTexture;
    u.shMat.value = pass.matrix;
    u.shStr.value = str;
    u.shSun.value = sun;
    u.shPcss.value = pcss;
    u.shRange.value = range;
    u.shUvM.value = uvM;
    u.shBias.value = bias;
    u.shNo.value = normalOff;
    u.shTexel.value = new THREE.Vector2(1 / pass.size, 1 / pass.size);
    shadowed.add(material);
  }

  function renderShadow(pass: NonNullable<typeof shadow>, casters: THREE.Mesh[]) {
    for (const mesh of casters) mesh.layers.enable(1);
    pass.camera.layers.set(1);
    scene.overrideMaterial = pass.depth;
    renderer.setRenderTarget(pass.target);
    renderer.clear();
    renderer.render(scene, pass.camera);
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;
  }

  function fitOrtho(cam: THREE.OrthographicCamera, box: THREE.Box3, pad: number, extra?: THREE.Box3) {
    const sd = SUN;
    const ctr = (extra || box).getCenter(new THREE.Vector3());
    cam.up.set(1, 0, 0);
    cam.position.copy(ctr).addScaledVector(sd, 150);
    cam.lookAt(ctr);
    cam.updateMatrixWorld(true);
    const mn = new THREE.Vector3(1e9, 1e9, 1e9);
    const mx = new THREE.Vector3(-1e9, -1e9, -1e9);
    const boxes = extra ? [box, extra] : [box];
    for (const B of boxes) {
      for (let i = 0; i < 8; i += 1) {
        const p = new THREE.Vector3(i & 1 ? B.max.x : B.min.x, i & 2 ? B.max.y : B.min.y, i & 4 ? B.max.z : B.min.z).applyMatrix4(cam.matrixWorldInverse);
        if (!extra || B === box) {
          mn.x = Math.min(mn.x, p.x);
          mn.y = Math.min(mn.y, p.y);
          mx.x = Math.max(mx.x, p.x);
          mx.y = Math.max(mx.y, p.y);
        }
        mn.z = Math.min(mn.z, p.z);
        mx.z = Math.max(mx.z, p.z);
      }
    }
    cam.left = mn.x - pad;
    cam.right = mx.x + pad;
    cam.bottom = mn.y - pad;
    cam.top = mx.y + pad;
    cam.near = -mx.z - 1;
    cam.far = -mn.z + 1;
    cam.updateProjectionMatrix();
    return { range: cam.far - cam.near, width: Math.max(cam.right - cam.left, cam.top - cam.bottom) };
  }

  function updateShadows(t: number, mobile: boolean, loaderMix: number) {
    clearShadow();
    const stackOn = t >= 19.5 && t <= 31;
    const pcss = (["emb", "loader"] as const).filter((name) => t >= (name === "emb" ? 49 : 0) && t <= (name === "emb" ? 57 : 8.5) && (name !== "loader" || loaderMix > 0.45));
    if (!stackOn && pcss.length === 0) {
      if (shadow) {
        shadow.target.dispose();
        shadow = null;
      }
      return;
    }
    scene.updateMatrixWorld(true);
    if (stackOn) {
      const casters: THREE.Mesh[] = [];
      const recv: THREE.Mesh[] = [];
      scene.traverseVisible((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material as THREE.ShaderMaterial;
        if (!material.uniforms?.dynamicMat?.value) return;
        let x: THREE.Object3D | null = mesh;
        let sn = "";
        let spine = false;
        let skip = false;
        while (x) {
          const n = nodeName(x);
          if (n === "LAYERS_spine" || n.startsWith("LAYERS_cap")) spine = true;
          if (/^LAYERS_(pulse|courier|trayfill)/.test(n)) skip = true;
          if (x.userData.sceneName) sn = String(x.userData.sceneName);
          x = x.parent;
        }
        if (sn !== "layers" || skip) return;
        recv.push(mesh);
        if (!spine) casters.push(mesh);
      });
      if (!casters.length) return;
      const box = new THREE.Box3();
      for (const mesh of casters) box.expandByObject(mesh);
      const pass = ensureShadow(mobile ? 1024 : 2048, "stack");
      const fit = fitOrtho(pass.camera, box, 0.25);
      pass.matrix.multiplyMatrices(pass.camera.projectionMatrix, pass.camera.matrixWorldInverse);
      renderShadow(pass, casters);
      const texel = fit.width / pass.size;
      for (const mesh of recv) bindShadow(mesh, pass, 0.45, 0, 0, 0.02 / fit.range, 1.5 * texel, fit.range, 0);
      return;
    }
    const casters: THREE.Mesh[] = [];
    const recv: THREE.Mesh[] = [];
    scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.ShaderMaterial;
      if (!material.uniforms) return;
      let x: THREE.Object3D | null = mesh;
      let sn = "";
      let ground = false;
      while (x) {
        const n = nodeName(x);
        if (n.startsWith("ground")) ground = true;
        if (x.userData.sceneName) sn = String(x.userData.sceneName);
        x = x.parent;
      }
      const dyn = Boolean(material.uniforms.dynamicMat?.value);
      if (pcss.includes(sn as "emb" | "loader") && dyn) {
        casters.push(mesh);
        recv.push(mesh);
      } else if (ground) recv.push(mesh);
    });
    if (!casters.length) return;
    const box = new THREE.Box3();
    for (const mesh of casters) box.expandByObject(mesh);
    const gb = box.clone();
    for (let i = 0; i < 8; i += 1) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      gb.expandByPoint(p.addScaledVector(SUN, -(p.y + 0.5) / SUN.y));
    }
    const pass = ensureShadow(mobile ? 2048 : 4096, "pcss");
    const fit = fitOrtho(pass.camera, box, 1, gb);
    pass.matrix.multiplyMatrices(pass.camera.projectionMatrix, pass.camera.matrixWorldInverse);
    renderShadow(pass, casters);
    const texel = fit.width / pass.size;
    for (const mesh of recv) bindShadow(mesh, pass, 1, 1, mobileShader ? 1 : 1, 0.03 / fit.range, 2 * texel, fit.range, 1 / fit.width);
  }

  function spinRotors(t: number) {
    const names = ["LAYERS_rotor_3La", "LAYERS_rotor_3Lb", "LAYERS_rotor_3Ra", "LAYERS_rotor_3Rb", "LAYERS_rotor_3Rc"];
    names.forEach((name, index) => {
      for (const e of nodeObj[name] || []) {
        if (e.scene !== "layers") continue;
        let rest = rotorRest.get(e.o);
        if (!rest) {
          rest = e.o.quaternion.clone();
          rotorRest.set(e.o, rest);
        }
        const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (index % 2 === 0 ? 1 : -1) * 0.6 * t);
        e.o.quaternion.copy(rest).multiply(spin);
        e.o.updateMatrixWorld(true);
      }
    });
  }

  function pose(t: number, opts: PoseOptions) {
    const live = liveScenes(t, opts.fullResidency);
    lastLive = [...live];
    if (opts.loaderMix > 0.02) live.add("loader");
    for (const list of Object.values(nodeObj)) {
      for (const e of list) {
        if (e.o.userData.evicted && !e.o.userData.animHidden) e.o.visible = true;
        e.o.userData.evicted = false;
      }
    }
    if (anim) {
      anim.apply(t, byName);
      anim.applyThreads(t);
    }
    const mix = Math.min(1, Math.max(0, opts.loaderMix));
    const loaderRoot = roots.get("loader");
    if (loaderRoot) loaderRoot.visible = mix > 0.001;
    const paintOpacity = (mesh: THREE.Mesh, opacity: number, key: string) => {
      const base = baseMaterial(mesh);
      if (!base?.uniforms) return;
      if (opacity >= 0.999) {
        mesh.material = base;
        base.uniforms.opacity_.value = 1;
        base.transparent = false;
        base.depthWrite = true;
        return;
      }
      const m = vary(base, key);
      m.transparent = opacity < 0.999;
      m.depthWrite = opacity > 0.5;
      m.uniforms.opacity_.value = opacity;
      mesh.material = m;
    };
    for (const sceneName of ["hero", "loader"] as const) {
      const opacity = sceneName === "hero" ? 1 - mix : mix;
      for (const list of Object.values(nodeObj)) {
        for (const e of list) {
          if (e.scene !== sceneName) continue;
          const mesh = e.o as THREE.Mesh;
          if (!mesh.isMesh || isGroundName(nodeName(mesh))) continue;
          const hidden = Boolean(mesh.userData.animHidden);
          mesh.visible = opacity > 0.001 && !hidden;
          if (!hidden) paintOpacity(mesh, opacity, `fade:${sceneName}`);
        }
      }
    }
    explodeStack(t);
    spinRotors(t);
    applyRules(t, mix);
    applyCamera(camera, sampleCamera(samples.samples, t, opts.smoothCamera), t, cssW, cssH, opts.mobile, exj, params);
    if (opts.mobile && cssW < cssH && t < 16.5) fitPortrait(t < 10.5 ? "hero" : "input");
    if (opts.dive && opts.dive.u > 0) blendDive(opts.dive.node, opts.dive.u);
    const mist = mistAt(t);
    for (const material of materials) {
      material.uniforms.fogNear.value = mist[0];
      material.uniforms.fogFar.value = mist[0] + mist[1];
    }
    syncResidency(live);
    updateShadows(t, opts.mobile, mix);
    sky.position.copy(camera.position);
    sky.updateMatrixWorld(true);
  }

  function blendDive(name: string, amount: number) {
    const list = nodeObj[name];
    if (!list?.length) return;
    const u = smootherstep(Math.min(1, Math.max(0, amount)));
    const anchor = new THREE.Vector3();
    list[0].o.getWorldPosition(anchor);
    const fromPos = camera.position.clone();
    const fromQuat = camera.quaternion.clone();
    const fromFov = camera.fov;
    const offset = fromPos.clone().sub(anchor);
    if (offset.lengthSq() < 1e-4) offset.set(0.6, 0.45, 0.8);
    const dist = Math.max(1.2, Math.min(2.4, offset.length() * 0.42));
    const toPos = anchor.clone().addScaledVector(offset.normalize(), dist);
    toPos.y = Math.max(toPos.y, anchor.y + 0.28);
    camera.position.copy(toPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(anchor);
    const toQuat = camera.quaternion.clone();
    camera.position.lerpVectors(fromPos, toPos, u);
    camera.quaternion.copy(fromQuat).slerp(toQuat, u);
    camera.fov = fromFov + (30 - fromFov) * u;
    if (u > 0.02) camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function mistAt(t: number): [number, number] {
    let mist: [number, number] = [anim?.scalar("mist:start", t) ?? 8, anim?.scalar("mist:depth", t) ?? 55];
    const lfNear = exj.fog_threejs.layers.near;
    const lfDepth = exj.fog_threejs.layers.far - lfNear;
    if (t >= 19.5 && t < 36) {
      const b = smootherstep((t - 31) / 5);
      mist = [lfNear + (mist[0] - lfNear) * b, lfDepth + (mist[1] - lfDepth) * b];
    }
    return mist;
  }

  function explodeStack(t: number) {
    const EX = exj.explode;
    const OJ = [0, 1, 2, 3].map((j) => smootherstep((t - EX.t0[j]) / EX.dur[j]) * (1 - smootherstep((t - EX.close_t0 - (3 - j) * 0.25) / EX.close_dur)));
    const bdz = (k: number) => EX.block_rise * OJ.slice(0, k).reduce((a, b) => a + b, 0);
    const ldz = (k: number) => bdz(k) + EX.lid_lift * OJ[k];
    const capx = (k: number) => k * Math.sin(((EX.lid_tilt_deg * Math.PI) / 180) * OJ[3]) + EX.cap_clear * OJ[3];
    const jobs: [THREE.Object3D, THREE.Matrix4 | null, number?][] = [];
    for (const nd of exj.nodes) {
      const hit = (nodeObj[nd.node] || []).find((e) => e.scene === "layers");
      const M0 = hit && restWorld.get(hit.o);
      if (!hit || !M0) continue;
      const Tz = (dz: number) => new THREE.Matrix4().makeTranslation(0, dz, 0);
      if (nd.kind === "box") jobs.push([hit.o, Tz(bdz(nd.block ?? 0)).multiply(M0.clone())]);
      else if (nd.kind === "lid" && nd.pivot_threejs && nd.hinge_axis_threejs) {
        const pv = new THREE.Vector3().fromArray(nd.pivot_threejs);
        const axis = new THREE.Vector3().fromArray(nd.hinge_axis_threejs).normalize();
        const R = new THREE.Matrix4().makeRotationAxis(axis, ((-EX.lid_tilt_deg * Math.PI) / 180) * OJ[nd.block ?? 0]);
        const M = Tz(ldz(nd.block ?? 0))
          .multiply(new THREE.Matrix4().makeTranslation(pv.x, pv.y, pv.z))
          .multiply(R)
          .multiply(new THREE.Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z))
          .multiply(M0.clone());
        jobs.push([hit.o, M]);
      } else if (nd.kind === "cap") jobs.push([hit.o, Tz(ldz(3) + capx(nd.extra_k ?? 0)).multiply(M0.clone())]);
      else if (nd.kind === "spine" && nd.rest_length) jobs.push([hit.o, null, (nd.rest_length + ldz(3) + capx(nd.extra_k ?? 0)) / nd.rest_length]);
    }
    const depthOf = (o: THREE.Object3D) => {
      let d = 0;
      let x: THREE.Object3D | null = o;
      while (x?.parent) {
        d += 1;
        x = x.parent;
      }
      return d;
    };
    jobs.sort((a, b) => depthOf(a[0]) - depthOf(b[0]));
    for (const [o, M, sy] of jobs) {
      if (M && o.parent) {
        o.parent.updateMatrixWorld(true);
        const local = new THREE.Matrix4().copy(o.parent.matrixWorld).invert().multiply(M);
        local.decompose(o.position, o.quaternion, o.scale);
      } else if (sy !== undefined) o.scale.y = sy;
      o.updateMatrixWorld(true);
    }
    const blockOf: Record<string, number> = {};
    for (const nd of exj.nodes) {
      const b = nd.kind === "cap" ? 3 : nd.block;
      for (const c of nd.children || []) if (b !== undefined) blockOf[c] = b;
      if (b !== undefined) blockOf[nd.node] = b;
    }
    const mean = OJ.reduce((a, b) => a + b, 0) / 4;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = baseMaterial(mesh);
      if (!material?.uniforms?.dynamicMat?.value) return;
      if (sceneOf(mesh) !== "layers") return;
      let block: number | undefined;
      let x: THREE.Object3D | null = mesh;
      while (x) {
        const n = nodeName(x);
        if (n === "LAYERS_spine") block = -1;
        else if (block === undefined && n in blockOf) block = blockOf[n];
        x = x.parent;
      }
      const open = block === -1 ? mean : block === undefined ? 0 : OJ[block];
      const next = vary(material, `ao:${block ?? "x"}`);
      next.uniforms.aoMix.value = open;
      next.uniforms.aoFloor.value = block === -1 ? 0.55 : 0;
      next.uniforms.fillK.value = block !== undefined && block >= 0 ? 0.22 : 0;
      mesh.material = next;
    });
  }

  function applyRules(t: number, loaderMix: number) {
    const rules = exj.scene_rules;
    const WS = smootherstep((t - rules.fade_out[0]) / (rules.fade_out[1] - rules.fade_out[0])) * (1 - smootherstep((t - rules.fade_in[0]) / (rules.fade_in[1] - rules.fade_in[0])));
    const groundIn = rules.fade_in_ground || rules.fade_in;
    const WG = smootherstep((t - rules.fade_out[0]) / (rules.fade_out[1] - rules.fade_out[0])) * (1 - smootherstep((t - groundIn[0]) / (groundIn[1] - groundIn[0])));
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = baseMaterial(mesh);
      if (!material?.uniforms) return;
      const sn = sceneOf(mesh);
      const nm = nodeName(mesh);
      if (sn === "attn" && !nm.startsWith("ground")) {
        if (WS >= 0.999) {
          mesh.visible = false;
          return;
        }
        const m = WS > 0 ? vary(material, "attn-fade") : material;
        m.transparent = WS > 0;
        m.depthWrite = WS < 0.5;
        m.uniforms.opacity_.value = 1 - WS;
        mesh.material = m;
        if (!mesh.userData.animHidden && !mesh.userData.evicted) mesh.visible = true;
      }
      if (material.uniforms.isLoss?.value > 0.5) {
        let gl = false;
        let x: THREE.Object3D | null = mesh;
        while (x) {
          if (nodeName(x).startsWith("ground_loss")) gl = true;
          x = x.parent;
        }
        const w = gl ? WG : WS;
        const m = vary(material, gl ? "loss-ground" : "loss-pad");
        m.uniforms.layersClay.value = 1 - w;
        m.uniforms.grooveBump.value = Number(material.userData.baseGroove || m.userData.baseGroove || 0) * (1 - w);
        mesh.material = m;
      }
    });
    for (const lg of layersGround) {
      for (const e of nodeObj[lg.object] || []) {
        e.o.traverse((g) => {
          const mesh = g as THREE.Mesh;
          if (!mesh.isMesh) return;
          const base = baseMaterial(mesh);
          if (!base?.uniforms?.lm2Mix) return;
          const m = vary(base, `lm2:${lg.object}`);
          m.uniforms.lightMap2.value = lg.lm;
          m.uniforms.lmAux2.value = lg.aux;
          m.uniforms.lm2Mix.value = WS;
          tag(lg.lm, "layers", true);
          tag(lg.aux, "layers", true);
          mesh.material = m;
        });
      }
    }
    if (groundOverride) {
      for (const e of nodeObj[groundOverride.object] || []) {
        e.o.traverse((g) => {
          const mesh = g as THREE.Mesh;
          if (!mesh.isMesh) return;
          const base = baseMaterial(mesh);
          if (!base?.uniforms?.lm2Mix) return;
          const m = vary(base, "loader-ground");
          m.uniforms.lightMap2.value = groundOverride?.lm ?? null;
          m.uniforms.lmAux2.value = groundOverride?.aux ?? null;
          m.uniforms.lm2Mix.value = loaderMix;
          mesh.material = m;
        });
      }
    }
    for (const e of nodeObj.ground_loss || []) {
      const rest = lossScale.get(e.o);
      if (rest !== undefined) {
        e.o.scale.y = rest * (1 - 0.8 * WS);
        e.o.updateMatrixWorld(true);
      }
    }
  }

  function render() {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  function memory(): MemoryReport {
    let gpuResident = 0;
    let textures = 0;
    let evicted = 0;
    const seen = new Set<string>();
    for (const rec of records.values()) {
      if (seen.has(rec.tex.uuid)) continue;
      seen.add(rec.tex.uuid);
      textures += 1;
      if (rec.evicted) evicted += 1;
      else gpuResident += textureBytes(rec.tex) || rec.bytes;
    }
    if (shadow) gpuResident += shadow.size * shadow.size * 5;
    return { rgbaBefore, rgbaUnique, gpuResident, textures, evicted };
  }

  resize(1440, 900, 1);
  onProgress(1, "ready");

  return {
    pose,
    render,
    resize,
    project,
    memory,
    get threadCount() {
      return threadCount;
    },
    get threadWarnings() {
      return anim?.warnings ?? [];
    },
    camera,
    loaded,
    animReady,
    sceneReady(name: string) {
      return readyPromise.get(name) ?? Promise.resolve();
    },
    resident() {
      return lastLive;
    },
    hasScene(name: string) {
      return roots.has(name);
    },
    projectBox,
    projectEdge,
    obstacles,
    prefetch(name: string) {
      if (queue.includes(name)) prefer = name;
      pump();
    },
    startQueue() {
      queueStarted = true;
      pump();
    },
    upgrade,
    dispose() {
      shadow?.target.dispose();
      draco.dispose();
      ktx2.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry?.dispose();
      });
      for (const tex of canon.values()) tex.dispose();
    },
  };
}

function baseMaterial(mesh: THREE.Mesh): THREE.ShaderMaterial | null {
  const stored = mesh.userData.baseMat as THREE.ShaderMaterial | undefined;
  if (stored?.uniforms) return stored;
  const current = mesh.material as THREE.ShaderMaterial;
  return current?.uniforms ? current : null;
}

function addSkirts(nodeObj: Record<string, Named[]>, materials: THREE.ShaderMaterial[]) {
  const SK = 0.3;
  for (const [name, list] of Object.entries(nodeObj)) {
    if (!name.startsWith("ground_")) continue;
    for (const e of list) {
      const meshes: THREE.Mesh[] = [];
      e.o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) meshes.push(mesh);
      });
      for (const mesh of meshes) {
        const g = mesh.geometry;
        const pos = g.attributes.position;
        if (!pos || g.userData.skirted) continue;
        const src = g.index ? (g.index.array as ArrayLike<number>) : null;
        const idx = src ? Array.from(src) : Array.from({ length: pos.count }, (_, i) => i);
        const ec = new Map<string, [number, number, number]>();
        for (let t = 0; t < idx.length; t += 3) {
          for (let k = 0; k < 3; k += 1) {
            const a = idx[t + k];
            const b = idx[t + ((k + 1) % 3)];
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            const c = ec.get(key);
            ec.set(key, c ? [c[0] + 1, a, b] : [1, a, b]);
          }
        }
        const edges: [number, number][] = [];
        for (const v of ec.values()) if (v[0] === 1) edges.push([v[1], v[2]]);
        if (!edges.length) continue;
        const inv = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld).invert();
        const dn = new THREE.Vector3(0, -SK, 0).applyMatrix3(inv);
        const used = [...new Set(edges.flat())];
        const map = new Map<number, number>();
        const N0 = pos.count;
        for (const [an, at] of Object.entries(g.attributes)) {
          const attr = at as THREE.BufferAttribute;
          const s = attr.itemSize;
          const base = attr.array as Float32Array;
          const Ctor = base.constructor as Float32ArrayConstructor;
          const arr2 = new Ctor((N0 + used.length) * s);
          arr2.set(base.subarray(0, N0 * s));
          used.forEach((v, i) => {
            for (let c = 0; c < s; c += 1) arr2[(N0 + i) * s + c] = base[v * s + c];
            if (an === "position") {
              arr2[(N0 + i) * 3] += dn.x;
              arr2[(N0 + i) * 3 + 1] += dn.y;
              arr2[(N0 + i) * 3 + 2] += dn.z;
            }
            map.set(v, N0 + i);
          });
          g.setAttribute(an, new THREE.BufferAttribute(arr2, s, attr.normalized));
        }
        const extra: number[] = [];
        for (const [a, b] of edges) {
          const a2 = map.get(a);
          const b2 = map.get(b);
          if (a2 === undefined || b2 === undefined) continue;
          extra.push(b, a, a2, b, a2, b2);
        }
        const all = new Uint32Array(idx.length + extra.length);
        all.set(idx);
        all.set(extra, idx.length);
        g.setIndex(new THREE.BufferAttribute(all, 1));
        g.userData.skirted = true;
        g.computeBoundingBox();
        g.computeBoundingSphere();
        const material = mesh.material as THREE.ShaderMaterial;
        const cloned = material.clone();
        cloned.side = THREE.DoubleSide;
        cloned.userData.baseGroove = material.userData.baseGroove;
        cloned.userData.kind = material.userData.kind;
        if (cloned.uniforms?.noFlip) cloned.uniforms.noFlip.value = 1;
        materials.push(cloned);
        mesh.material = cloned;
      }
    }
  }
}

export type { AnimApi };
