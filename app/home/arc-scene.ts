import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createArcModel, type ArcModel } from "./arc-model";
import { registerLayer, sharedRenderer, unregisterLayer } from "./v3/gl-host";

export type ArcHandle = {
  setProgress: (value: number) => void;
  dispose: () => void;
};

export type ArcMountOptions = {
  reducedMotion: boolean;
  mobile: boolean;
  onReady: () => void;
};

const INK = 0x111315;

function hash(seed: number) {
  let value = seed || 7;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

function noiseTexture(width: number, height: number, sample: (x: number, y: number) => number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the cyclorama texture.");
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shade = Math.max(0, Math.min(255, sample(x, y)));
      const index = (y * width + x) * 4;
      image.data[index] = shade;
      image.data[index + 1] = shade;
      image.data[index + 2] = shade;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function groundNoise() {
  const random = hash(11);
  const size = 512;
  const field = new Float32Array(size * size);
  for (let octave = 0; octave < 4; octave += 1) {
    const cells = 2 ** (octave + 2);
    const grid: number[] = [];
    for (let index = 0; index < (cells + 1) * (cells + 1); index += 1) grid.push(random());
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const x0 = fx | 0;
        const y0 = fy | 0;
        const tx = fx - x0;
        const ty = fy - y0;
        const a = grid[y0 * (cells + 1) + x0];
        const b = grid[y0 * (cells + 1) + x0 + 1];
        const c = grid[(y0 + 1) * (cells + 1) + x0];
        const d = grid[(y0 + 1) * (cells + 1) + x0 + 1];
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        field[y * size + x] += ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy) / 2 ** octave;
      }
    }
  }
  const randomGrain = hash(19);
  return noiseTexture(size, size, (x, y) => {
    const shade = 188 + field[y * size + x] * 18 + (randomGrain() * 6 - 3);
    return Math.max(0, Math.min(255, shade));
  });
}

function cycloramaGeometry() {
  const profile: [number, number][] = [];
  const curve = 6;
  const zCenter = -6;
  for (let index = 0; index <= 20; index += 1) profile.push([30 - (index * (30 - zCenter)) / 20, 0]);
  for (let index = 1; index <= 24; index += 1) {
    const angle = (index / 24) * (Math.PI / 2);
    profile.push([zCenter - Math.sin(angle) * curve, curve - Math.cos(angle) * curve]);
  }
  for (let index = 1; index <= 10; index += 1) profile.push([zCenter - curve, curve + index * 2.5]);

  const halfWidth = 48;
  const columns = 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const lengths = [0];
  let length = 0;
  for (let index = 1; index < profile.length; index += 1) {
    length += Math.hypot(profile[index][0] - profile[index - 1][0], profile[index][1] - profile[index - 1][1]);
    lengths.push(length);
  }
  for (let row = 0; row < profile.length; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      positions.push(-halfWidth + column * halfWidth, profile[row][1], profile[row][0]);
      uvs.push(column * 4, lengths[row] / 12);
    }
  }
  for (let row = 0; row < profile.length - 1; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(
    new THREE.BoxGeometry(40, 20, 40),
    new THREE.MeshBasicMaterial({ color: 0x060708, side: THREE.BackSide }),
  ));
  const card = (width: number, height: number, x: number, y: number, z: number, yaw: number, pitch: number, intensity: number, color = 0xffffff) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.set(pitch, yaw, 0);
    room.add(mesh);
  };
  card(14, 2.2, -6, 9, 4, 0, Math.PI / 2, 4.5, 0xf6f6f4);
  card(3, 12, -15, 3, 2, Math.PI / 2, 0, 2.4, 0xf4f1ea);
  card(8, 6, 10, 4, -14, -0.6, 0, 1.6, 0xdfe6ee);
  card(30, 1, 0, -0.5, -19, 0, 0, 0.35, 0xffffff);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(room, 0.02).texture;
  pmrem.dispose();
  room.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
  return texture;
}

const filmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    t: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float t;
    uniform vec2 res;
    varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec4 c=texture2D(tDiffuse,vUv);
      vec2 d=vUv-0.5;
      d.x*=res.x/res.y;
      float v=smoothstep(1.4,0.45,length(d));
      c.rgb*=mix(0.88,1.0,v);
      float g=h(floor(vUv*res)+t)-0.5;
      c.rgb+=g*0.018;
      gl_FragColor=c;
    }
  `,
};

function smoothstep(value: number) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export async function mountArcScene(canvas: HTMLCanvasElement, options: ArcMountOptions): Promise<ArcHandle> {
  const { reducedMotion, mobile, onReady } = options;
  const parent = canvas.parentElement;
  const renderer = sharedRenderer();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK);
  scene.fog = new THREE.Fog(INK, 15, 34);
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 1.7;

  const groundTexture = groundNoise();
  const ground = new THREE.Mesh(
    cycloramaGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x5c5e60,
      roughness: 0.78,
      metalness: 0,
      roughnessMap: groundTexture,
      bumpMap: groundTexture,
      bumpScale: 0.012,
    }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  let model: ArcModel;
  try {
    model = await createArcModel({ finCount: 260 });
  } catch (error) {
    renderer.dispose();
    scene.environment?.dispose();
    throw error;
  }
  model.object.position.set(mobile ? 0.5 : 1.45, mobile ? 0.1 : 0.02, 0);
  scene.add(model.object);

  const key = new THREE.SpotLight(0xfaf6f0, mobile ? 360 : 420, 50, 0.46, 1, 2);
  key.position.set(-5, 12, 7);
  key.target.position.set(0, 1.2, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = mobile ? 2 : 4;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0xdfe6ee, 1.2);
  rim.position.set(6, 4, -8);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x2a2f34, 0x0b0c0d, 0.25));
  const floorWash = new THREE.SpotLight(0xf4f1ea, mobile ? 70 : 110, 36, 0.95, 1, 1.4);
  floorWash.position.set(1.2, 7.5, 7);
  floorWash.target.position.set(1.4, 0, -3);
  scene.add(floorWash, floorWash.target);

  const camera = new THREE.PerspectiveCamera(mobile ? 31 : 22, 1, 0.1, 100);
  const restPosition = new THREE.Vector3(...(mobile ? [-1.95, 0.52, 7.05] : [0.15, 0.55, 13.2]));
  const restTarget = new THREE.Vector3(...(mobile ? [-0.42, 1.92, -0.12] : [-3.55, 1.58, 0.1]));
  const endPosition = new THREE.Vector3(-0.2, 1.85, 7.9);
  const endTarget = new THREE.Vector3(-1.65, 3.55, 0.05);
  const position = restPosition.clone();
  const target = restTarget.clone();

  const size = () => {
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;
    return { width: Math.max(1, width), height: Math.max(1, height) };
  };

  const initial = size();
  camera.aspect = initial.width / Math.max(1, initial.height);
  camera.updateProjectionMatrix();

  const samples = Math.min(4, renderer.capabilities.maxSamples || 0);
  const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.renderToScreen = false;
  composer.setPixelRatio(1);
  const driver: { tick: (time: number) => void; resize: (width: number, height: number) => void } = {
    tick: () => {},
    resize: () => {},
  };
  registerLayer("hero", {
    element: parent ?? canvas,
    tick: (time) => driver.tick(time),
    resize: (width, height) => driver.resize(width, height),
    texture: () => {
      const texture = composer.readBuffer?.texture ?? null;
      if (texture) {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
      }
      return texture;
    },
  });
  composer.addPass(new RenderPass(scene, camera));

  const bokeh: BokehPass | null = null;

  const film = new ShaderPass(filmShader);
  composer.addPass(film);
  composer.addPass(new OutputPass());

  let targetProgress = 0;
  let progress = 0;
  let frameCount = 0;
  let stopped = false;
  let paused = false;
  let raf = 0;
  let readySent = false;
  const focusPoint = new THREE.Vector3(-2.2, 2, 0);

  let bufferW = 0;
  let bufferH = 0;

  function fit(cssWidth: number, cssHeight: number) {
    const width = Math.max(1, cssWidth);
    const height = Math.max(1, cssHeight);
    const deviceRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    // Fins are a few pixels wide. A 1x buffer with no MSAA stair-steps on mobile,
    // and the old 640px cap upscaled that aliasing. Resolve at device pixels,
    // and at 2x when the context cannot multisample.
    const applied = mobile ? Math.max(2, deviceRatio) : (samples > 0 ? deviceRatio : Math.max(2, deviceRatio));
    const w = Math.max(2, Math.round(width * applied));
    const h = Math.max(2, Math.round(height * applied));
    if (w !== bufferW || h !== bufferH) {
      bufferW = w;
      bufferH = h;
      composer.setPixelRatio(1);
      composer.setSize(w, h);
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    film.uniforms.res.value.set(w, h);
    canvas.dataset.arcBuffer = `${w}x${h}`;
    canvas.dataset.arcSamples = String(samples);
    canvas.dataset.arcScale = String(applied);
    if (bokeh) {
      const uniforms = bokeh.uniforms as { aspect?: { value: number } };
      if (uniforms.aspect) uniforms.aspect.value = camera.aspect;
    }
  }

  function resize() {
    const next = size();
    fit(next.width, next.height);
  }

  function applyProgress(amount: number) {
    const eased = mobile || reducedMotion ? 0 : smoothstep(amount);
    position.lerpVectors(restPosition, mobile ? restPosition : endPosition, eased);
    target.lerpVectors(restTarget, mobile ? restTarget : endTarget, eased);
    camera.position.copy(position);
    camera.lookAt(target);
    const idle = reducedMotion ? 0 : Math.sin(performance.now() * 0.0011) * (mobile ? 0.07 : 0.16);
    model.object.rotation.y = (mobile ? -0.57 : -0.38) + idle + eased * 0.2;
    const along = 0.66 + eased * 0.26;
    model.setBand(along * (model.finCount - 1));
    if (bokeh) {
      const uniforms = bokeh.uniforms as { focus?: { value: number } };
      if (uniforms.focus) uniforms.focus.value = camera.position.distanceTo(focusPoint);
    }
  }

  function schedule() {
    if (stopped || paused || raf) return;
    if (reducedMotion && frameCount >= 4) return;
    raf = window.requestAnimationFrame(render);
  }

  function render(time: number) {
    raf = 0;
    if (stopped) return;
    progress += (targetProgress - progress) * (reducedMotion ? 1 : 0.14);
    applyProgress(progress);
    film.uniforms.t.value = reducedMotion ? 2.4 : time * 0.00037;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    composer.renderToScreen = false;
    composer.render();
    frameCount += 1;
    if (!readySent && frameCount >= 2) {
      readySent = true;
      onReady();
    }
  }

  driver.tick = (time) => render(time);
  driver.resize = (width, height) => {
    fit(width, height);
  };

  resize();
  applyProgress(0);
  render(performance.now());

  const observed = parent ?? canvas;
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(observed);

  const onVisibility = () => {
    if (document.hidden) {
      window.cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    schedule();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onPause = (event: Event) => {
    const release = event instanceof CustomEvent && event.detail === false;
    paused = !release;
    window.cancelAnimationFrame(raf);
    raf = 0;
    if (!paused) schedule();
  };
  window.addEventListener("arc:pause", onPause);

  const intersection = new IntersectionObserver((entries) => {
    const visible = entries.some((entry) => entry.isIntersecting);
    if (!visible) {
      window.cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    schedule();
  }, { threshold: 0.02 });
  intersection.observe(observed);

  return {
    setProgress(value: number) {
      if (reducedMotion || mobile) return;
      targetProgress = Math.min(1, Math.max(0, value));
      schedule();
    },
    dispose() {
      stopped = true;
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("arc:pause", onPause);
      composer.dispose();
      model.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      groundTexture.dispose();
      scene.environment?.dispose();
      key.dispose();
      unregisterLayer("hero");
    },
  };
}
