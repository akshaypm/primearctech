import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { createArcModel, type ArcModel } from "./arc-model";
import { registerLayer, setDebug, sharedRenderer, unregisterLayer } from "./v3/gl-host";

export type ArcHandle = {
  setProgress: (value: number) => void;
  dispose: () => void;
};

export type ClearBox = { left: number; top: number; right: number; bottom: number };

export type ArcMountOptions = {
  reducedMotion: boolean;
  mobile: boolean;
  onReady: () => void;
  /** The headline's box in hero-local CSS px. On mobile the mesh is framed to stay above it. */
  keepClear?: () => ClearBox | null;
};

const INK = 0x111315;
// 1440x900 at 1x and 390x844 at 2x both fit; larger or denser screens scale down to this.
const MAX_BUFFER_PIXELS = 2_100_000;
// The approved hero pose; the idle sway leaves it and returns, always away from the copy.
const REST_YAW = -0.62;
const SWAY_YAW = 0.14;
const SWAY_RATE = 0.0011;
const CLEAR_MARGIN = 6;
// The mobile top bar is about 60px tall; keep the top of the Arc below it when reframing.
const MOBILE_APEX_MIN = 76;

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
  return noiseTexture(size, size, (x, y) => Math.min(255, field[y * size + x] * 120 + 14 + randomGrain() * 12));
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

// Vignette in linear light, then tone map and encode, then grain in display space.
// Grain is about one 8-bit step, per device pixel, and fades out on bright metal.
function finishMaterial() {
  return new THREE.RawShaderMaterial({
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      toneMappingExposure: { value: 1 },
      seed: { value: 0 },
      aspect: { value: 1 },
      grain: { value: 0.011 },
    },
    vertexShader: `
      precision highp float;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      attribute vec3 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D tDiffuse;
      uniform float seed;
      uniform float aspect;
      uniform float grain;
      #include <tonemapping_pars_fragment>
      #include <colorspace_pars_fragment>
      varying vec2 vUv;
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 d = vUv - 0.5;
        d.x *= aspect;
        c.rgb *= mix(0.62, 1.0, smoothstep(1.15, 0.25, length(d)));
        c.rgb = NeutralToneMapping(c.rgb);
        c = sRGBTransferOETF(c);
        vec2 p = gl_FragCoord.xy + seed * vec2(113.0, 71.0);
        float n = hash12(p) + hash12(p + 19.19) - 1.0;
        float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb += n * grain * (1.0 - smoothstep(0.22, 0.7, luma));
        gl_FragColor = vec4(c.rgb, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

/** Bounding-box corners of every mesh and instance, in the root's local space. Slightly conservative. */
function meshSamples(root: THREE.Object3D) {
  const points: THREE.Vector3[] = [];
  const box = new THREE.Box3();
  const instance = new THREE.Matrix4();
  const toRoot = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const push = (matrix: THREE.Matrix4) => {
    for (let corner = 0; corner < 8; corner += 1) {
      points.push(new THREE.Vector3(
        corner & 1 ? box.max.x : box.min.x,
        corner & 2 ? box.max.y : box.min.y,
        corner & 4 ? box.max.z : box.min.z,
      ).applyMatrix4(matrix));
    }
  };
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox!);
    toRoot.multiplyMatrices(rootInverse, mesh.matrixWorld);
    const instanced = child as THREE.InstancedMesh;
    if (!instanced.isInstancedMesh) {
      if (Math.abs(toRoot.determinant()) > 1e-12) push(toRoot);
      return;
    }
    for (let index = 0; index < instanced.count; index += 1) {
      instanced.getMatrixAt(index, instance);
      // Hidden instances are zero-scaled onto the origin; they would read as a point on the floor.
      if (Math.abs(instance.determinant()) < 1e-12) continue;
      push(instance.premultiply(toRoot));
    }
  });
  return points;
}

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
      roughness: 0.55,
      metalness: 0,
      roughnessMap: groundTexture,
      bumpMap: groundTexture,
      bumpScale: 0.06,
    }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  let model: ArcModel;
  try {
    model = await createArcModel({ finCount: mobile ? 150 : 260 });
  } catch (error) {
    renderer.dispose();
    scene.environment?.dispose();
    throw error;
  }
  model.object.position.y = 0.18;
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

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  const restPosition = new THREE.Vector3(...(mobile ? [2.6, 1.2, 18.5] : [-1.2, 1.3, 12.6]));
  const restTarget = new THREE.Vector3(...(mobile ? [-0.4, 0.9, 0] : [-3.4, 2.6, 0]));
  const endPosition = new THREE.Vector3(-0.2, 1.85, 7.9);
  const endTarget = new THREE.Vector3(-1.65, 3.55, 0.05);
  const position = restPosition.clone();
  const target = restTarget.clone();

  const size = () => {
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;
    return { width: Math.max(1, width), height: Math.max(1, height) };
  };

  // MSAA on the HDR scene buffer at every width; thin fins alias badly without it.
  const samples = Math.min(4, renderer.capabilities.maxSamples || 0);
  const sceneTarget = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples });
  const outTarget = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false });
  const finish = finishMaterial();
  finish.uniforms.tDiffuse.value = sceneTarget.texture;
  const finishQuad = new FullScreenQuad(finish);
  let bufferWidth = 0;
  let bufferHeight = 0;
  let cssWidth = 0;
  let cssHeight = 0;
  let dirty = true;

  const meshPoints = mobile && options.keepClear ? meshSamples(model.object) : [];
  let clearKey = "";

  /**
   * Phones are shorter than the approved 390x844 frame once browser chrome is counted, and the copy is
   * pinned to the bottom in fixed px while the Arc scales with height. Lift the view (and zoom out, anchored
   * left, only if lifting would push the Arc under the top bar) so the mesh clears the headline at every
   * yaw the sway reaches.
   */
  function frameAboveHeadline(width: number, height: number) {
    const clear = options.keepClear?.();
    const key = clear ? `${width}|${height}|${Math.round(clear.left)}|${Math.round(clear.top)}|${Math.round(clear.right)}` : "";
    if (key === clearKey) return;
    clearKey = key;
    camera.clearViewOffset();
    camera.position.copy(restPosition);
    camera.lookAt(restTarget);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    if (!clear || meshPoints.length === 0) {
      setDebug("hero-frame", "natural", "no keep-clear box");
      return;
    }
    const projected: number[] = [];
    const pose = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const point = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let step = 0; step <= 6; step += 1) {
      turn.setFromAxisAngle(up, REST_YAW + (reducedMotion ? 0 : (SWAY_YAW * step) / 6));
      pose.compose(model.object.position, turn, model.object.scale);
      for (const sample of meshPoints) {
        point.copy(sample).applyMatrix4(pose).project(camera);
        projected.push(((point.x + 1) / 2) * width, ((1 - point.y) / 2) * height);
      }
    }
    const footLimit = clear.top - CLEAR_MARGIN;
    let zoom = 1;
    let lift = 0;
    for (let pass = 0; pass < 6; pass += 1) {
      let top = Infinity;
      let bottom = -Infinity;
      for (let index = 0; index < projected.length; index += 2) {
        const x = projected[index] * zoom;
        if (x < 0 || x > width) continue;
        const y = projected[index + 1];
        top = Math.min(top, y);
        if (x >= clear.left - CLEAR_MARGIN && x <= clear.right + CLEAR_MARGIN) bottom = Math.max(bottom, y);
      }
      if (!Number.isFinite(bottom) || (bottom - lift) * zoom <= footLimit + 0.25) break;
      lift = bottom - footLimit / zoom;
      if ((top - lift) * zoom < MOBILE_APEX_MIN && bottom > top) {
        zoom = Math.min(zoom, (footLimit - MOBILE_APEX_MIN) / (bottom - top));
        lift = top - MOBILE_APEX_MIN / zoom;
      }
    }
    if (lift > 0.25 || zoom < 1) camera.setViewOffset(width, height, 0, lift, width / zoom, height / zoom);
    camera.updateProjectionMatrix();
    setDebug("hero-frame", lift > 0.25 || zoom < 1 ? "reframed" : "natural", `lift ${lift.toFixed(1)}px zoom ${zoom.toFixed(3)}`);
  }

  registerLayer("hero", {
    element: parent ?? canvas,
    tick: (time) => tick(time),
    resize: (width, height) => resize(width, height),
    texture: () => outTarget.texture,
  });

  let targetProgress = 0;
  let progress = 0;
  let frameCount = 0;
  let stopped = false;
  let paused = false;
  let readySent = false;
  const mountedAt = performance.now();

  function resize(width: number, height: number) {
    const ratio = renderer.getPixelRatio();
    const budget = Math.min(1, Math.sqrt(MAX_BUFFER_PIXELS / Math.max(1, width * height * ratio * ratio)));
    const w = Math.max(2, Math.round(width * ratio * budget));
    const h = Math.max(2, Math.round(height * ratio * budget));
    if (width !== cssWidth || height !== cssHeight) {
      cssWidth = width;
      cssHeight = height;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      finish.uniforms.aspect.value = camera.aspect;
      dirty = true;
    }
    if (mobile) frameAboveHeadline(width, height);
    if (w === bufferWidth && h === bufferHeight) return;
    bufferWidth = w;
    bufferHeight = h;
    sceneTarget.setSize(w, h);
    outTarget.setSize(w, h);
    dirty = true;
    setDebug("hero-buffer", `${w}x${h}`, `dpr ${ratio} msaa ${samples}x ${mobile ? 150 : 260} fins`);
  }

  function applyProgress(amount: number, time: number) {
    const eased = mobile || reducedMotion ? 0 : smoothstep(amount);
    position.lerpVectors(restPosition, mobile ? restPosition : endPosition, eased);
    target.lerpVectors(restTarget, mobile ? restTarget : endTarget, eased);
    camera.position.copy(position);
    camera.lookAt(target);
    // Desktop: more negative yaw walks the leg right, off the headline. Mobile: less negative slides it off the left edge.
    const sway = reducedMotion ? 0 : (mobile ? 1 : -1) * SWAY_YAW * 0.5 * (1 - Math.cos((time - mountedAt) * SWAY_RATE));
    model.object.rotation.y = REST_YAW + sway + eased * 0.24;
    setDebug("hero-pose", `yaw ${model.object.rotation.y.toFixed(3)}`, `rest ${REST_YAW}`);
    const along = 0.66 + eased * 0.26;
    model.setBand(along * (model.finCount - 1));
  }

  function render(time: number) {
    progress += (targetProgress - progress) * (reducedMotion ? 1 : 0.14);
    applyProgress(progress, time);
    finish.uniforms.seed.value = reducedMotion ? 3 : frameCount % 61;
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(outTarget);
    finishQuad.render(renderer);
    renderer.setRenderTarget(null);
    frameCount += 1;
    dirty = false;
    if (!readySent && frameCount >= 2) {
      readySent = true;
      onReady();
    }
  }

  function tick(time: number) {
    if (stopped || document.hidden) return;
    if ((paused || reducedMotion) && frameCount >= 4 && !dirty) return;
    render(time);
  }

  const initial = size();
  resize(initial.width, initial.height);
  applyProgress(0, mountedAt);
  render(mountedAt);
  render(performance.now());

  const onPause = (event: Event) => {
    paused = !(event instanceof CustomEvent && event.detail === false);
  };
  window.addEventListener("arc:pause", onPause);

  return {
    setProgress(value: number) {
      if (reducedMotion || mobile) return;
      targetProgress = Math.min(1, Math.max(0, value));
    },
    dispose() {
      stopped = true;
      window.removeEventListener("arc:pause", onPause);
      sceneTarget.dispose();
      outTarget.dispose();
      finish.dispose();
      finishQuad.dispose();
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
