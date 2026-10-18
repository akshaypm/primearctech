import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { registerLayer, sharedRenderer, unregisterLayer } from "./gl-host";

export { THREE, RoundedBoxGeometry };

let seed = 11;
export const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const reseed = (value: number) => {
  seed = value;
};

function noise(size = 512) {
  const n = new Float32Array(size * size);
  for (let o = 0; o < 5; o += 1) {
    const s = 2 ** (o + 2);
    const g: number[] = [];
    for (let k = 0; k < (s + 1) * (s + 1); k += 1) g.push(rnd());
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const fx = (i / size) * s;
        const fy = (j / size) * s;
        const x0 = fx | 0;
        const y0 = fy | 0;
        const tx = fx - x0;
        const ty = fy - y0;
        const a = g[y0 * (s + 1) + x0] ?? 0;
        const b = g[y0 * (s + 1) + x0 + 1] ?? 0;
        const c = g[(y0 + 1) * (s + 1) + x0] ?? 0;
        const d = g[(y0 + 1) * (s + 1) + x0 + 1] ?? 0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        n[j * size + i] = (n[j * size + i] ?? 0) + ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy) / 2 ** o;
      }
    }
  }
  return n;
}

export function tex(size: number, fn: (i: number, j: number) => number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d context unavailable");
  const image = context.createImageData(size, size);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      const v = fn(i, j);
      const k = (j * size + i) * 4;
      image.data[k] = image.data[k + 1] = image.data[k + 2] = v;
      image.data[k + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export const groundTex = () => {
  const field = noise();
  return tex(512, (i, j) => Math.min(255, (field[j * 512 + i] ?? 0) * 120 + rnd() * 40));
};

export function brushedTex(repeatY = 6, amp = 60) {
  const texture = tex(512, (_i, j) => 150 + Math.sin(j * 0.9 + Math.sin(j * 0.07) * 4) * 12 + (rnd() * amp - amp / 2));
  texture.repeat.set(1, repeatY);
  return texture;
}

export function cyclorama(R0 = 6, zc = -6, front = 30) {
  const prof: number[][] = [];
  for (let i = 0; i <= 20; i += 1) prof.push([front - (i * (front - zc)) / 20, 0]);
  for (let i = 1; i <= 24; i += 1) {
    const a = (i / 24) * Math.PI / 2;
    prof.push([zc - Math.sin(a) * R0, R0 - Math.cos(a) * R0]);
  }
  for (let i = 1; i <= 10; i += 1) prof.push([zc - R0, R0 + i * 2.5]);
  const X = 60;
  const cols = 2;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let len = 0;
  const L = [0];
  for (let i = 1; i < prof.length; i += 1) {
    const prev = prof[i - 1] ?? [0, 0];
    const next = prof[i] ?? [0, 0];
    len += Math.hypot(next[0] - prev[0], next[1] - prev[1]);
    L.push(len);
  }
  for (let i = 0; i < prof.length; i += 1) {
    for (let j = 0; j <= cols; j += 1) {
      const row = prof[i] ?? [0, 0];
      pos.push(-X + j * X, row[1], row[0]);
      uv.push(j * 4, (L[i] ?? 0) / 12);
    }
  }
  for (let i = 0; i < prof.length - 1; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  return geometry;
}

const filmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    t: { value: 0 },
    vig: { value: 0.62 },
    grain: { value: 0.04 },
    res: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float t, vig, grain; uniform vec2 res; varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      vec2 d=vUv-0.5; d.x*=res.x/res.y;
      float v=smoothstep(1.15,0.25,length(d));
      c.rgb*=mix(vig,1.0,v);
      float g=h(floor(vUv*res/1.5)+t)-0.5;
      c.rgb+=g*grain;
      gl_FragColor=c;
    }
  `,
};

export type StudioOptions = {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  bg?: number;
  floor?: number;
  fog?: [number, number];
  env?: number;
  key?: { pos: [number, number, number]; int: number; angle: number };
  tone?: number;
  light?: boolean;
  softbox?: number;
  mobile?: boolean;
};

export type Studio = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  spot: THREE.SpotLight;
  rim: THREE.DirectionalLight;
  bokeh: BokehPass | null;
  look: (position: number[], target: number[], focus?: number[]) => void;
  render: () => void;
  settle: (frames?: number) => Promise<void>;
  resize: (w: number, h: number) => void;
  setVignette: (value: number) => void;
  setGrain: (value: number) => void;
  setAperture: (value: number) => void;
  setGrade: (mapping: THREE.ToneMapping, exposure?: number) => void;
  dispose: () => void;
};

let sceneSerial = 0;

export function studio(options: StudioOptions): Studio {
  reseed(11);
  const { canvas, bg = 0x111315, floor = 0x5c5e60, fog = [15, 34], env = 1.7, tone = 1, light = false, softbox = 0, mobile = false } = options;
  const key = options.key ?? { pos: [-5, 12, 7] as [number, number, number], int: 420, angle: 0.46 };
  let w = options.w;
  let h = options.h;
  const dpr = sharedRenderer().getPixelRatio();
  const renderer = sharedRenderer();
  const grade = { mapping: THREE.NeutralToneMapping as THREE.ToneMapping, exposure: tone };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, fog[0], fog[1]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: 0x060708, side: THREE.BackSide })));
  const box = (W: number, H: number, x: number, y: number, z: number, ry: number, rx: number, intensity: number, color = 0xffffff) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0);
    envScene.add(mesh);
  };
  box(14, 2.2, -6, 9, 4, 0, Math.PI / 2, 4.5, 0xf6f6f4);
  box(3, 12, -15, 3, 2, Math.PI / 2, 0, 2.4, 0xf4f1ea);
  box(8, 6, 10, 4, -14, -0.6, 0, 1.6, 0xdfe6ee);
  box(30, 1, 0, -0.5, -19, 0, 0, 0.35, 0xffffff);
  if (softbox) box(16, 10, -2, 9.6, 2, 0, Math.PI / 2, softbox, 0xf5f4f1);
  scene.environment = pmrem.fromScene(light ? new RoomEnvironment() : envScene, 0.02).texture;
  scene.environmentIntensity = env;
  pmrem.dispose();

  const gt = groundTex();
  const ground = new THREE.Mesh(
    cyclorama(),
    new THREE.MeshStandardMaterial({
      color: floor,
      roughness: 0.6,
      roughnessMap: light ? null : gt,
      bumpMap: light ? null : gt,
      bumpScale: 0.06,
    }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  const spot = new THREE.SpotLight(0xfaf6f0, key.int, 50, key.angle, 1, 2);
  spot.position.set(...key.pos);
  spot.castShadow = true;
  const shadowSize = mobile ? 1024 : 2048;
  spot.shadow.mapSize.set(shadowSize, shadowSize);
  spot.shadow.camera.near = 3;
  spot.shadow.camera.far = 40;
  spot.shadow.bias = -0.0002;
  spot.shadow.normalBias = 0.02;
  spot.shadow.radius = mobile ? 2 : 4;
  scene.add(spot, spot.target);
  const rim = new THREE.DirectionalLight(0xdfe6ee, 1.2);
  rim.position.set(6, 4, -8);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x2a2f34, 0x0b0c0d, 0.25));

  const camera = new THREE.PerspectiveCamera(24, w / Math.max(1, h), 0.1, 100);
  const samples = mobile ? 0 : Math.min(4, renderer.capabilities.maxSamples || 0);
  const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.renderToScreen = false;
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  let bokeh: BokehPass | null = null;
  if (!mobile) {
    bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.0009, maxblur: 0.004 });
    composer.addPass(bokeh);
  }
  composer.addPass(new OutputPass());
  const film = new ShaderPass(filmShader);
  composer.addPass(film);
  film.uniforms.res.value.set(w * dpr, h * dpr);

  let frame = 0;
  let raf = 0;
  let stopped = false;

  const layerId = canvas.closest("section, header")?.id || `scene-${++sceneSerial}`;
  const layerElement = canvas.parentElement ?? canvas;
  registerLayer(layerId, {
    element: layerElement,
    texture: () => composer.readBuffer?.texture ?? null,
  });

  function render() {
    frame += 1;
    film.uniforms.t.value = frame * 0.37;
    renderer.toneMapping = grade.mapping;
    renderer.toneMappingExposure = grade.exposure;
    composer.renderToScreen = false;
    composer.render();
  }

  function resize(nextW: number, nextH: number) {
    w = Math.max(1, nextW);
    h = Math.max(1, nextH);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    film.uniforms.res.value.set(w * dpr, h * dpr);
    const uniforms = bokeh?.uniforms as { aspect?: { value: number } } | undefined;
    if (uniforms?.aspect) uniforms.aspect.value = camera.aspect;
  }

  return {
    renderer,
    scene,
    camera,
    spot,
    rim,
    bokeh,
    look(position, target, focus) {
      camera.position.set(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);
      camera.lookAt(target[0] ?? 0, target[1] ?? 0, target[2] ?? 0);
      const focusPoint = focus ?? target;
      const uniforms = bokeh?.uniforms as { focus?: { value: number } } | undefined;
      if (uniforms?.focus) {
        uniforms.focus.value = camera.position.distanceTo(new THREE.Vector3(focusPoint[0] ?? 0, focusPoint[1] ?? 0, focusPoint[2] ?? 0));
      }
    },
    render,
    settle(frames = 4) {
      return new Promise((resolve) => {
        let left = frames;
        const step = () => {
          if (stopped) {
            resolve();
            return;
          }
          render();
          left -= 1;
          if (left <= 0) resolve();
          else raf = window.requestAnimationFrame(step);
        };
        step();
      });
    },
    resize,
    setVignette(value) {
      film.uniforms.vig.value = value;
    },
    setGrain(value) {
      film.uniforms.grain.value = value;
    },
    setAperture(value) {
      const uniforms = bokeh?.uniforms as { aperture?: { value: number } } | undefined;
      if (uniforms?.aperture) uniforms.aperture.value = value;
    },
    setGrade(mapping, exposure) {
      grade.mapping = mapping;
      if (exposure !== undefined) grade.exposure = exposure;
    },
    dispose() {
      stopped = true;
      window.cancelAnimationFrame(raf);
      unregisterLayer(layerId);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
        const list = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of list) {
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      });
      if (scene.environment) textures.add(scene.environment);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      composer.dispose();
      renderTarget.dispose();
    },
  };
}

export function viewSize(canvas: HTMLCanvasElement) {
  const view = canvas.parentElement;
  return {
    w: Math.max(1, view?.clientWidth || canvas.clientWidth || 1),
    h: Math.max(1, view?.clientHeight || canvas.clientHeight || 1),
  };
}

export function project(camera: THREE.Camera, point: THREE.Vector3, w: number, h: number) {
  const projected = point.clone().project(camera);
  return { x: ((projected.x + 1) / 2) * w, y: ((1 - projected.y) / 2) * h };
}
