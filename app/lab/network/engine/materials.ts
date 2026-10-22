import * as THREE from "three";
import { PALETTE } from "./palette";

const hazeColor = new THREE.Color(PALETTE.horizon);

export const hazeUniforms = {
  uHazeColor: { value: hazeColor },
  uHazeDensity: { value: 0.012 },
  uHazeStart: { value: 46 },
};

function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = hash(x0, y0);
  const b = hash(x0 + 1, y0);
  const c = hash(x0, y0 + 1);
  const d = hash(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number) {
  let n = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    n += amp * valueNoise(x * freq, y * freq);
    freq *= 2.05;
    amp *= 0.5;
  }
  return n;
}

export function createSandTextures() {
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / 28, y / 28) * 0.55 + fbm(x / 7, y / 7) * 0.45;
      heights[y * size + x] = n;
    }
  }
  const sand = new THREE.Color(PALETTE.sand);
  const deep = new THREE.Color("#DDD0BC");
  const lift = new THREE.Color(PALETTE.surface);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const h = heights[i];
      const grain = valueNoise(x / 2.2, y / 2.2);
      const color = sand.clone().lerp(h > 0.55 ? lift : deep, Math.abs(h - 0.5) * 0.12 + grain * 0.02);
      color.lerp(lift, 0.4);
      const hex = color.getHex();
      const o = i * 4;
      albedo[o] = (hex >> 16) & 255;
      albedo[o + 1] = (hex >> 8) & 255;
      albedo[o + 2] = hex & 255;
      albedo[o + 3] = 255;
      const left = heights[y * size + ((x + size - 1) % size)];
      const right = heights[y * size + ((x + 1) % size)];
      const up = heights[((y + size - 1) % size) * size + x];
      const down = heights[((y + 1) % size) * size + x];
      const dx = (left - right) * 0.45;
      const dy = (up - down) * 0.45;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      normal[o] = Math.round((nx / len * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
      const roughV = Math.round((0.9 + grain * 0.08) * 255);
      rough[o] = roughV;
      rough[o + 1] = roughV;
      rough[o + 2] = roughV;
      rough[o + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(albedo, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  const normalMap = new THREE.DataTexture(normal, size, size);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.needsUpdate = true;
  const roughnessMap = new THREE.DataTexture(rough, size, size);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.needsUpdate = true;
  return { map, normalMap, roughnessMap };
}

/** High-frequency roughness so clay is not a uniform plastic. */
export function createFingerprintRoughness() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = valueNoise(x / 3.1, y / 3.1);
      const ridge = Math.abs(Math.sin((x + n * 6) * 0.85 + y * 0.15));
      const v = Math.round(Math.min(1, Math.max(0.78, 0.9 + n * 0.06 - ridge * 0.045)) * 255);
      const o = (y * size + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

const HAZE_VERTEX = `
vec4 netWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  netWorld = instanceMatrix * netWorld;
#endif
#ifdef USE_BATCHING
  netWorld = batchingMatrix * netWorld;
#endif
vNetWorld = (modelMatrix * netWorld).xyz;
#include <project_vertex>
`;

const HAZE_MIX = `
  float netDist = distance(vNetWorld, cameraPosition);
  float netLift = exp(-0.085 * max(vNetWorld.y, 0.0));
  float netHaze = clamp(1.0 - exp(-uHazeDensity * max(netDist - uHazeStart, 0.0) * netLift), 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeColor, netHaze);
`;

/**
 * Contours every 0.15 m of world height. fwidth anti-aliases a groove a few pixels wide.
 * Farther than the loss bowl, the sculpt fades into the sand so the embedding
 * horizon is not a red slab. The bowl itself stays inside that distance.
 */
const CONTOUR = `
  float netBands = vNetWorld.y / 0.15;
  float netFw = max(fwidth(netBands), 1e-3);
  // A few pixels wide, still anti-aliased. A 1px groove vanishes in the still.
  float netWidth = netFw * 3.6;
  float netFrac = fract(netBands);
  float netDistLine = min(netFrac, 1.0 - netFrac);
  float netGroove = 1.0 - smoothstep(0.0, netWidth, netDistLine);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.045, 0.014, 0.008), netGroove * 0.82);
  float netRange = distance(vNetWorld, cameraPosition);
  float netFar = smoothstep(12.0, 21.0, netRange);
  vec3 netDx = dFdx(vNetWorld);
  vec3 netDy = dFdy(vNetWorld);
  vec3 netN = cross(netDx, netDy);
  float netNl = length(netN);
  float netUp = netNl > 1e-5 ? abs(netN.y) / netNl : 1.0;
  float netSteep = 1.0 - smoothstep(0.2, 0.5, netUp);
  float netCliff = netSteep * smoothstep(16.0, 23.0, netRange);
  vec3 netSand = vec3(0.66, 0.58, 0.46);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, netSand, clamp(max(netFar, netCliff), 0.0, 1.0));
`;

/** Darker clay deeper in the shaft. The rim and the opening stay bright. */
const SHAFT = `
  float netOpen = clamp((vNetWorld.y - 1.5) / 14.0, 0.0, 1.0);
  gl_FragColor.rgb *= mix(0.34, 0.58, netOpen);
`;

type SurfaceFx = "haze" | "contour" | "shaft";

const SURFACE_EXTRA: Record<SurfaceFx, string> = {
  haze: "",
  contour: CONTOUR,
  shaft: SHAFT,
};

function bindSurface(material: THREE.Material, fx: SurfaceFx) {
  const extra = SURFACE_EXTRA[fx];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHazeColor = hazeUniforms.uHazeColor;
    shader.uniforms.uHazeDensity = hazeUniforms.uHazeDensity;
    shader.uniforms.uHazeStart = hazeUniforms.uHazeStart;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vNetWorld;")
      .replace("#include <project_vertex>", HAZE_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vNetWorld;\nuniform vec3 uHazeColor;\nuniform float uHazeDensity;\nuniform float uHazeStart;",
      )
      .replace("#include <tonemapping_fragment>", `{\n${extra}\n${HAZE_MIX}\n}\n#include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => `net-surface-${fx}`;
}

export function applyHaze(material: THREE.Material) {
  bindSurface(material, "haze");
}

/** Loss sculpt: brick clay plus the contour lines the Blender export did not keep. */
export function createTerrainMaterial(roughnessMap: THREE.Texture) {
  const material = new THREE.MeshPhysicalMaterial({
    color: PALETTE.terracotta,
    roughness: 0.94,
    metalness: 0,
    sheen: 0,
    roughnessMap,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  bindSurface(material, "contour");
  return material;
}

export function applyShaftFalloff(material: THREE.Material) {
  bindSurface(material, "shaft");
}

export function createClayMaterial(color: string, roughnessMap: THREE.Texture, envMapIntensity = 0.045) {
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    sheen: 0,
    envMapIntensity,
    roughnessMap,
  });
  applyHaze(material);
  return material;
}

export function createGlazeMaterial() {
  // Bone ceramic: a soft body so the sun can model the form, plus a clear coat.
  // A mirror-flat body on this sand disappears; the coat is what reads as glaze.
  const material = new THREE.MeshPhysicalMaterial({
    color: PALETTE.glaze,
    roughness: 0.2,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    envMapIntensity: 1.35,
    reflectivity: 0.5,
    ior: 1.5,
  });
  applyHaze(material);
  return material;
}

export function createGroundMaterial(textures: ReturnType<typeof createSandTextures>) {
  const material = new THREE.MeshStandardMaterial({
    map: textures.map,
    normalMap: textures.normalMap,
    roughnessMap: textures.roughnessMap,
    roughness: 0.96,
    metalness: 0,
    envMapIntensity: 0.02,
    normalScale: new THREE.Vector2(0.08, 0.08),
  });
  applyHaze(material);
  return material;
}

export function createSkyMaterial() {
  const horizon = new THREE.Color(PALETTE.horizon);
  const zenith = new THREE.Color(PALETTE.surface);
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: true,
    uniforms: {
      uHorizon: { value: horizon },
      uZenith: { value: zenith },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      varying vec3 vDir;
      void main() {
        float up = normalize(vDir).y;
        float t = smoothstep(-0.04, 0.58, up);
        gl_FragColor = vec4(mix(uHorizon, uZenith, t), 1.0);
        #ifdef TONE_MAPPING
          gl_FragColor.rgb = toneMapping(gl_FragColor.rgb);
        #endif
        gl_FragColor = linearToOutputTexel(gl_FragColor);
      }
    `,
  });
}

/** Soft studio, warm, no sun disc. Used only so the bone glaze has a broad reflection. */
export function createStudioEnv(renderer: THREE.WebGLRenderer) {
  const w = 512;
  const h = 256;
  const data = new Float32Array(w * h * 4);
  const dir = new THREE.Vector3();
  const key = new THREE.Vector3(0.35, 0.62, 0.28).normalize();
  for (let y = 0; y < h; y++) {
    const v = 1 - y / (h - 1);
    const dirY = Math.sin((v - 0.5) * Math.PI);
    const cosLat = Math.cos((v - 0.5) * Math.PI);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const lon = (u - 0.5) * Math.PI * 2;
      dir.set(Math.cos(lon) * cosLat, dirY, Math.sin(lon) * cosLat);
      // Bright sky, dark sand floor, one broad warm softbox. The floor is what
      // gives a bone sphere a shaded underside so it separates from the ground.
      const up = Math.max(0, dir.y);
      const down = Math.max(0, -dir.y);
      let r = 0.28 + up * 0.78 - down * 0.12;
      let g = 0.24 + up * 0.72 - down * 0.1;
      let b = 0.18 + up * 0.6 - down * 0.08;
      const nd = Math.max(0, dir.dot(key));
      const lobe = nd ** 4;
      r += lobe * 4.6;
      g += lobe * 4.35;
      b += lobe * 3.9;
      const o = (y * w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 1;
    }
  }
  const equirect = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.LinearSRGBColorSpace;
  equirect.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(equirect);
  pmrem.dispose();
  equirect.dispose();
  return target;
}

/** One soft cast under the hero lattice. The shadow map on this GPU does not resolve the rods. */
export function createLatticeShadow(cast: THREE.Vector3) {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / (size - 1)) * 2 - 1;
      const v = (y / (size - 1)) * 2 - 1;
      const d = Math.hypot(u / 0.48, (v - 0.05) / 0.95);
      const alpha = Math.exp(-d * d * 1.2);
      const o = (y * size + x) * 4;
      data[o] = 36;
      data[o + 1] = 24;
      data[o + 2] = 18;
      data[o + 3] = Math.round(Math.min(1, alpha) * 175);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 12),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
  mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.atan2(-cast.x, -cast.z));
  mesh.position.set(4.4, 0.28, -0.15).addScaledVector(cast, -3.4);
  mesh.renderOrder = 2;
  mesh.name = "lattice-shadow";
  mesh.frustumCulled = false;
  return mesh;
}

export function createContactTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const cx = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cx) / cx;
      const a = Math.min(1, Math.max(0, 1 - d));
      const alpha = Math.round(a * a * 120);
      const o = (y * size + x) * 4;
      data[o] = 92;
      data[o + 1] = 64;
      data[o + 2] = 48;
      data[o + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
