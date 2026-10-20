import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { journeyTimeline, type JourneyState, type SceneTier } from "./progress";

export type JourneyStats = {
  calls: number;
  reflectionCalls: number;
  triangles: number;
  dpr: number;
  tier: SceneTier;
  renderer: string;
  cameraZ: number;
};

export type JourneyScene = {
  setState(state: JourneyState): void;
  setPointer(x: number, y: number, active: boolean): void;
  resize(width: number, height: number, dpr: number, tier: SceneTier): void;
  render(timeMs: number): void;
  stats(): JourneyStats;
  dispose(): void;
};

const ARCH_R = 3.22;
const OPEN_ANGLE = 0.7;
const PATH_WIDTH = 0.05;

type Key = { t: number; pos: THREE.Vector3; look: THREE.Vector3; fov: number };

const CAMERA_KEYS: Key[] = [
  { t: 0, pos: new THREE.Vector3(0.85, 0.7, 16.6), look: new THREE.Vector3(-2.15, 1.28, 0.05), fov: 34 },
  { t: 0.28, pos: new THREE.Vector3(0.45, 0.72, 12.4), look: new THREE.Vector3(-1.35, 1.45, -0.2), fov: 38 },
  { t: 0.46, pos: new THREE.Vector3(0.15, 0.68, 5.8), look: new THREE.Vector3(0.1, 1.25, -2.6), fov: 50 },
  { t: 0.56, pos: new THREE.Vector3(0.04, 0.95, 6.4), look: new THREE.Vector3(0.04, 1.75, -3.2), fov: 48 },
  { t: 0.66, pos: new THREE.Vector3(0.02, 0.9, 5.4), look: new THREE.Vector3(0.02, 1.6, -3.8), fov: 50 },
  { t: 0.84, pos: new THREE.Vector3(0.4, 0.74, 13.2), look: new THREE.Vector3(-1.5, 1.32, 0.3), fov: 36 },
  { t: 1, pos: new THREE.Vector3(0.9, 0.72, 17.2), look: new THREE.Vector3(-2.05, 1.18, 0.6), fov: 34 },
];

const FLOAT_PLATES = [
  new THREE.Vector3(2.05, 1.02, 2.5),
  new THREE.Vector3(3.65, 1.48, -0.15),
  new THREE.Vector3(4.85, 1.05, -2.35),
];
const FLOAT_TILT = [0.08, -0.14, 0.12];
const TUNNEL_PLATES = [
  new THREE.Vector3(0.72, 0.96, -1.45),
  new THREE.Vector3(-0.2, 0.96, -3.05),
  new THREE.Vector3(0.4, 0.96, -4.7),
];
const RANK_PLATES = [
  new THREE.Vector3(0.45, 1.08, -0.62),
  new THREE.Vector3(1.5, 1.08, -0.62),
  new THREE.Vector3(2.55, 1.08, -0.62),
];

export async function createJourneyScene(
  canvas: HTMLCanvasElement,
  options: { tier: SceneTier },
): Promise<JourneyScene> {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    depth: true,
    preserveDrawingBuffer: true,
  });
  const gl = renderer.getContext();
  if (!gl) {
    renderer.dispose();
    throw new Error("WebGL context was not created");
  }

  renderer.setClearColor(0x111315, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(options.tier === "desktop" ? 1.5 : 1.25);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const env = pmrem.fromScene(new RoomEnvironment(), 0.045).texture;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111315);
  scene.environment = env;

  const hemi = new THREE.HemisphereLight(0x9aa3ab, 0x101214, 0.85);
  const key = new THREE.DirectionalLight(0xfff4e8, 2.35);
  key.position.set(3.2, 10.5, 5.4);
  const rim = new THREE.DirectionalLight(0xd7dee6, 1.7);
  rim.position.set(-8.5, 5.2, -2.4);
  const fill = new THREE.DirectionalLight(0xc9b8a6, 0.42);
  fill.position.set(-1.5, 2.4, 8);
  scene.add(hemi, key, rim, fill);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const track = (geo: THREE.BufferGeometry) => {
    geometries.push(geo);
    return geo;
  };
  const trackMat = <T extends THREE.Material>(mat: T) => {
    materials.push(mat);
    return mat;
  };

  const steel = trackMat(new THREE.MeshPhysicalMaterial({
    color: 0xc5ccd1,
    metalness: 1,
    roughness: 0.46,
    anisotropy: 0.72,
    clearcoat: 0.08,
    clearcoatRoughness: 0.55,
    envMap: env,
    envMapIntensity: 0.34,
  }));
  const ceramic = trackMat(new THREE.MeshPhysicalMaterial({
    color: 0xf1efe9,
    metalness: 0,
    roughness: 0.74,
    clearcoat: 0.06,
    clearcoatRoughness: 0.55,
    envMap: env,
    envMapIntensity: 0.14,
    side: THREE.DoubleSide,
  }));
  const orange = trackMat(new THREE.MeshPhysicalMaterial({
    color: 0xd8643e,
    metalness: 0,
    roughness: 0.56,
    envMap: env,
    envMapIntensity: 0.12,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  }));
  const outputMat = trackMat(new THREE.MeshPhysicalMaterial({
    color: 0xf1efe9,
    metalness: 0,
    roughness: 0.62,
    envMap: env,
    envMapIntensity: 0.16,
  }));

  const floorUniforms = {
    tReflect: { value: null as THREE.Texture | null },
    textureMatrix: { value: new THREE.Matrix4() },
    plateA: { value: new THREE.Vector3() },
    plateB: { value: new THREE.Vector3() },
    plateC: { value: new THREE.Vector3() },
  };
  const floorMat = trackMat(new THREE.MeshPhysicalMaterial({
    color: 0x191c1f,
    metalness: 0.12,
    roughness: 0.22,
    envMap: env,
    envMapIntensity: 0.18,
  }));
  floorMat.onBeforeCompile = (shader) => {
    shader.uniforms.tReflect = floorUniforms.tReflect;
    shader.uniforms.textureMatrix = floorUniforms.textureMatrix;
    shader.uniforms.plateA = floorUniforms.plateA;
    shader.uniforms.plateB = floorUniforms.plateB;
    shader.uniforms.plateC = floorUniforms.plateC;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform mat4 textureMatrix;\nvarying vec3 vJourneyWorld;\nvarying vec4 vJourneyReflect;",
      )
      .replace(
        "#include <project_vertex>",
        `vJourneyReflect = textureMatrix * vec4(position, 1.0);
         #include <project_vertex>
         vJourneyWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform sampler2D tReflect;
         uniform vec3 plateA;
         uniform vec3 plateB;
         uniform vec3 plateC;
         varying vec3 vJourneyWorld;
         varying vec4 vJourneyReflect;`,
      )
      .replace(
        "#include <opaque_fragment>",
        `
        vec2 ruv = vJourneyReflect.xy / max(vJourneyReflect.w, 0.0001);
        vec3 refl = texture2D(tReflect, ruv).rgb;
        float inside = step(0.0, ruv.x) * step(0.0, ruv.y) * step(ruv.x, 1.0) * step(ruv.y, 1.0);
        float fres = pow(1.0 - saturate(dot(normal, geometryViewDir)), 2.8);
        float distFade = smoothstep(16.0, 1.5, length(vJourneyWorld.xz));
        float reflAmt = inside * distFade * (0.07 + 0.18 * fres);
        outgoingLight = mix(outgoingLight, refl, clamp(reflAmt, 0.0, 0.55));
        vec2 cell = abs(fract(vJourneyWorld.xz / 2.35) - 0.5);
        float joint = 1.0 - smoothstep(0.0, 0.011, min(cell.x, cell.y));
        outgoingLight *= mix(1.0, 0.62, joint);
        float contact = 0.0;
        contact += smoothstep(1.35, 0.12, length(vJourneyWorld.xz - vec2(-${ARCH_R.toFixed(2)}, 0.0)));
        contact += smoothstep(1.35, 0.12, length(vJourneyWorld.xz - vec2(${ARCH_R.toFixed(2)}, 0.0)));
        contact += smoothstep(0.85, 0.08, length(vJourneyWorld.xz - plateA.xz));
        contact += smoothstep(0.85, 0.08, length(vJourneyWorld.xz - plateB.xz));
        contact += smoothstep(0.85, 0.08, length(vJourneyWorld.xz - plateC.xz));
        outgoingLight *= 1.0 - 0.55 * clamp(contact, 0.0, 1.0);
        #include <opaque_fragment>
        `,
      );
  };

  const hallMat = trackMat(new THREE.MeshStandardMaterial({
    color: 0x111315,
    roughness: 1,
    metalness: 0,
    side: THREE.BackSide,
    envMap: env,
    envMapIntensity: 0.04,
  }));
  hallMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHallWorld;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         vHallWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHallWorld;")
      .replace(
        "#include <opaque_fragment>",
        `
        vec2 coffer = abs(fract(vHallWorld.xz * 0.16) - 0.5);
        float seam = smoothstep(0.018, 0.004, min(coffer.x, coffer.y));
        if (vHallWorld.y > 6.2) outgoingLight *= mix(1.0, 0.9, seam);
        float falloff = smoothstep(4.0, 22.0, length(vHallWorld.xz));
        outgoingLight *= mix(1.0, 0.55, falloff);
        #include <opaque_fragment>
        `,
      );
  };

  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(56, 56)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.name = "floor";
  const hall = new THREE.Mesh(track(new THREE.BoxGeometry(40, 10.5, 40)), hallMat);
  hall.position.set(0.4, 4.55, -1.2);
  scene.add(hall, floor);

  const steelProfile = roundedRect(0.09, 0.38, 0.026, 3);
  const ceramicProfile = roundedRect(0.016, 0.2, 0.01, 2).map((p) => p.clone().add(new THREE.Vector2(-0.112, 0)));
  const orangeProfile = [
    new THREE.Vector2(-0.132, -PATH_WIDTH / 2),
    new THREE.Vector2(-0.132, PATH_WIDTH / 2),
  ];

  const leftPoints = halfArch("left");
  const rightPoints = halfArch("right");
  const leftSteel = new THREE.Mesh(track(buildSweep(leftPoints, steelProfile, true, false, true)), steel);
  const rightSteel = new THREE.Mesh(track(buildSweep(rightPoints, steelProfile, true, true, false)), steel);
  const leftCeramic = new THREE.Mesh(track(buildSweep(leftPoints, ceramicProfile, true, false, true)), ceramic);
  const rightCeramic = new THREE.Mesh(track(buildSweep(rightPoints, ceramicProfile, true, true, false)), ceramic);
  const leftOrange = new THREE.Mesh(track(buildSweep(leftPoints, orangeProfile, false, false, false)), orange);
  const rightOrange = new THREE.Mesh(track(buildSweep(rightPoints, orangeProfile, false, false, false)), orange);

  const leftPivot = new THREE.Group();
  const leftRig = new THREE.Group();
  leftPivot.position.set(-ARCH_R, 0, 0);
  leftRig.position.set(ARCH_R, 0, 0);
  leftRig.add(leftSteel, leftCeramic, leftOrange);
  leftPivot.add(leftRig);

  const rightPivot = new THREE.Group();
  const rightRig = new THREE.Group();
  rightPivot.position.set(ARCH_R, 0, 0);
  rightRig.position.set(-ARCH_R, 0, 0);
  rightRig.add(rightSteel, rightCeramic, rightOrange);
  rightPivot.add(rightRig);
  scene.add(leftPivot, rightPivot);

  const plateWidth = 0.72;
  const plateHeight = 1.92;
  const plateGeos = plateGeometries(plateWidth, plateHeight);
  geometries.push(plateGeos.ceramic, plateGeos.frame);
  const plates = [0, 1, 2].map((index) => {
    const group = new THREE.Group();
    group.name = `plate-${index}`;
    const body = new THREE.Mesh(plateGeos.ceramic, ceramic);
    const frame = new THREE.Mesh(plateGeos.frame, steel);
    group.add(frame, body);
    scene.add(group);
    return group;
  });

  const tunnelPoints = [
    new THREE.Vector3(0.1, 0.012, 2.4),
    new THREE.Vector3(0.1, 0.012, -5.4),
  ];
  const operationPoints = [
    new THREE.Vector3(0.2, 0.012, -0.62),
    new THREE.Vector3(1.5, 0.012, -0.62),
    new THREE.Vector3(2.55, 0.012, -0.62),
    new THREE.Vector3(3.35, 0.012, 0.35),
    new THREE.Vector3(3.9, 0.012, 1.85),
  ];
  const dashPoints = [
    new THREE.Vector3(3.45, 0.014, 0.85),
    new THREE.Vector3(4.85, 0.014, 1.15),
  ];
  const tunnelPath = new THREE.Mesh(track(ribbon(tunnelPoints, PATH_WIDTH)), orange);
  const operationPath = new THREE.Mesh(track(ribbon(operationPoints, PATH_WIDTH)), orange);
  const dashMat = trackMat(new THREE.ShaderMaterial({
    uniforms: {},
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float along = vUv.x * 18.0;
        if (mod(along, 1.0) > 0.42) discard;
        gl_FragColor = vec4(0.847, 0.392, 0.243, 1.0);
      }
    `,
  }));
  dashMat.toneMapped = false;
  const dashPath = new THREE.Mesh(track(ribbon(dashPoints, 0.02)), dashMat);
  scene.add(tunnelPath, operationPath, dashPath);

  const output = new THREE.Mesh(track(new THREE.BoxGeometry(1.15, 0.028, 0.86)), outputMat);
  output.position.set(3.9, -0.4, 1.85);
  const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.2, 0.012, 12, 32)), steel);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(4.95, -0.4, 1.15);
  const keystone = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.16, 0.78)), steel);
  keystone.position.set(0, ARCH_R - 0.01, 0);
  scene.add(output, ring, keystone);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.06, 80);
  const reflectionCamera = new THREE.PerspectiveCamera();
  const blurScene = new THREE.Scene();
  const blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blurMaterial = trackMat(new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      direction: { value: new THREE.Vector2(1, 0) },
      resolution: { value: new THREE.Vector2(1, 1) },
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 direction;
      uniform vec2 resolution;
      varying vec2 vUv;
      void main() {
        vec2 off = direction / resolution;
        vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
        sum += texture2D(tDiffuse, vUv + off * 2.6) * 0.316216;
        sum += texture2D(tDiffuse, vUv - off * 2.6) * 0.316216;
        sum += texture2D(tDiffuse, vUv + off * 5.8) * 0.070270;
        sum += texture2D(tDiffuse, vUv - off * 5.8) * 0.070270;
        gl_FragColor = sum;
      }
    `,
  }));
  const blurQuad = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), blurMaterial);
  blurScene.add(blurQuad);

  let reflectTarget: THREE.WebGLRenderTarget | null = null;
  let blurA: THREE.WebGLRenderTarget | null = null;
  let blurB: THREE.WebGLRenderTarget | null = null;
  let disposed = false;
  let tier = options.tier;
  let aspect = 1;
  let dpr = 1;
  let state: JourneyState = { chapter: "input", progress: 0 };
  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
  let pointerActive = false;
  let lastTime = 0;
  let mainCalls = 0;
  let reflectionCalls = 0;
  const scratch = {
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    plate: new THREE.Vector3(),
    reflectorWorld: new THREE.Vector3(),
    cameraWorld: new THREE.Vector3(),
    rotation: new THREE.Matrix4(),
    normal: new THREE.Vector3(),
    view: new THREE.Vector3(),
    lookAt: new THREE.Vector3(),
    target: new THREE.Vector3(),
    clipPlane: new THREE.Vector4(),
    q: new THREE.Vector4(),
    reflectorPlane: new THREE.Plane(),
    textureMatrix: floorUniforms.textureMatrix.value,
  };

  const api: JourneyScene = {
    setState(next) {
      state = next;
    },
    setPointer(x, y, active) {
      pointerActive = active;
      pointerTarget.set(active ? x : 0, active ? y : 0);
    },
    resize(width, height, nextDpr, nextTier) {
      if (disposed) return;
      const w = Math.max(2, Math.floor(width));
      const h = Math.max(2, Math.floor(height));
      dpr = nextDpr;
      tier = nextTier;
      aspect = w / h;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const scale = tier === "desktop" ? 0.5 : 0.34;
      const rw = Math.max(16, Math.floor(w * dpr * scale));
      const rh = Math.max(16, Math.floor(h * dpr * scale));
      reflectTarget?.dispose();
      blurA?.dispose();
      blurB?.dispose();
      reflectTarget = new THREE.WebGLRenderTarget(rw, rh, { depthBuffer: true });
      blurA = new THREE.WebGLRenderTarget(rw, rh, { depthBuffer: false });
      blurB = new THREE.WebGLRenderTarget(rw, rh, { depthBuffer: false });
      for (const target of [reflectTarget, blurA, blurB]) {
        target.texture.colorSpace = THREE.LinearSRGBColorSpace;
      }
      floorUniforms.tReflect.value = blurB.texture;
      const resolution = blurMaterial.uniforms.resolution.value as THREE.Vector2;
      resolution.set(rw, rh);
    },
    render(timeMs) {
      if (disposed || !reflectTarget || !blurA || !blurB) return;
      const delta = lastTime === 0 ? 0.016 : Math.min(0.05, (timeMs - lastTime) / 1000);
      lastTime = timeMs;
      const damp = 1 - Math.exp(-delta * (pointerActive ? 3.4 : 6));
      pointer.lerp(pointerTarget, damp);

      const pose = journeyTimeline(state);
      leftPivot.rotation.z = pose.open * OPEN_ANGLE;
      rightPivot.rotation.z = -pose.open * OPEN_ANGLE;
      const cover = 1 - pose.open;
      keystone.visible = cover > 0.03;
      keystone.scale.setScalar(Math.max(cover, 0.001));
      const toTunnel = THREE.MathUtils.clamp(pose.plate, 0, 1);
      const toRank = THREE.MathUtils.clamp(pose.plate - 1, 0, 1);
      plates.forEach((plate, index) => {
        scratch.plate.copy(FLOAT_PLATES[index]).lerp(TUNNEL_PLATES[index], toTunnel);
        plate.position.copy(scratch.plate).lerp(RANK_PLATES[index], toRank);
        plate.rotation.set(0, 0, FLOAT_TILT[index] * (1 - toTunnel));
        plate.position.y = THREE.MathUtils.lerp(FLOAT_PLATES[index].y, plateHeight * 0.5, toTunnel);
      });
      floorUniforms.plateA.value.copy(plates[0].position);
      floorUniforms.plateB.value.copy(plates[1].position);
      floorUniforms.plateC.value.copy(plates[2].position);

      const tunnelDraw = tunnelPath.geometry.index?.count ?? 0;
      const operationDraw = operationPath.geometry.index?.count ?? 0;
      tunnelPath.geometry.setDrawRange(0, Math.floor(tunnelDraw * pose.floorPath));
      operationPath.geometry.setDrawRange(0, Math.floor(operationDraw * pose.output));
      dashPath.geometry.setDrawRange(0, Math.floor((dashPath.geometry.index?.count ?? 0) * pose.output));
      tunnelPath.visible = pose.floorPath > 0.02;
      operationPath.visible = pose.output > 0.02;
      dashPath.visible = pose.output > 0.08;
      output.visible = pose.output > 0.04;
      ring.visible = pose.output > 0.04;
      output.position.y = THREE.MathUtils.lerp(-0.2, 0.014, pose.output);
      ring.position.y = THREE.MathUtils.lerp(-0.2, 0.012, pose.output);

      sampleCamera(pose.t, pose.fly, aspect, pointer, camera);
      scene.updateMatrixWorld(true);
      renderReflection();
      renderer.setRenderTarget(null);
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.render(scene, camera);
      mainCalls = renderer.info.render.calls;
    },
    stats() {
      return {
        calls: mainCalls + reflectionCalls,
        reflectionCalls,
        triangles: countTriangles(scene),
        dpr,
        tier,
        renderer: rendererName(gl),
        cameraZ: Number(camera.position.z.toFixed(2)),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reflectTarget?.dispose();
      blurA?.dispose();
      blurB?.dispose();
      reflectTarget = null;
      blurA = null;
      blurB = null;
      for (const geo of geometries) geo.dispose();
      for (const mat of materials) mat.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };

  function renderReflection() {
    if (!reflectTarget || !blurA || !blurB) return;
    floor.visible = false;
    const prevTone = renderer.toneMapping;
    const prevSpace = renderer.outputColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    placeReflectionCamera(camera, floor, reflectionCamera, scratch);
    renderer.setRenderTarget(reflectTarget);
    renderer.clear();
    renderer.render(scene, reflectionCamera);
    reflectionCalls = renderer.info.render.calls;

    const diffuse = blurMaterial.uniforms.tDiffuse;
    const direction = blurMaterial.uniforms.direction.value as THREE.Vector2;
    diffuse.value = reflectTarget.texture;
    direction.set(1, 0);
    renderer.setRenderTarget(blurA);
    renderer.clear();
    renderer.render(blurScene, blurCamera);
    diffuse.value = blurA.texture;
    direction.set(0, 1);
    renderer.setRenderTarget(blurB);
    renderer.clear();
    renderer.render(blurScene, blurCamera);
    floorUniforms.tReflect.value = blurB.texture;

    renderer.toneMapping = prevTone;
    renderer.outputColorSpace = prevSpace;
    floor.visible = true;
  }

  api.resize(canvas.clientWidth || 2, canvas.clientHeight || 2, options.tier === "desktop" ? 1.5 : 1.25, options.tier);
  return api;
}

function halfArch(side: "left" | "right"): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const drop = 0.5;
  const arcSteps = 64;
  const footSteps = 8;
  const overshoot = 0.008;
  if (side === "left") {
    for (let i = 0; i <= footSteps; i += 1) {
      points.push(new THREE.Vector3(-ARCH_R, -drop + (drop * i) / footSteps, 0));
    }
    for (let i = 1; i <= arcSteps; i += 1) {
      const span = Math.PI / 2 + overshoot;
      const a = Math.PI - span * (i / arcSteps);
      points.push(new THREE.Vector3(Math.cos(a) * ARCH_R, Math.sin(a) * ARCH_R, 0));
    }
    return points;
  }
  for (let i = 0; i <= arcSteps; i += 1) {
    const span = Math.PI / 2 + overshoot;
    const a = Math.PI / 2 + overshoot - span * (i / arcSteps);
    points.push(new THREE.Vector3(Math.cos(a) * ARCH_R, Math.sin(a) * ARCH_R, 0));
  }
  for (let i = 1; i <= footSteps; i += 1) {
    points.push(new THREE.Vector3(ARCH_R, -(drop * i) / footSteps, 0));
  }
  return points;
}

function roundedRect(hx: number, hy: number, radius: number, corner: number): THREE.Vector2[] {
  const r = Math.min(radius, hx, hy);
  const corners = [
    { cx: hx - r, cy: hy - r, a0: 0, a1: Math.PI / 2 },
    { cx: -hx + r, cy: hy - r, a0: Math.PI / 2, a1: Math.PI },
    { cx: -hx + r, cy: -hy + r, a0: Math.PI, a1: Math.PI * 1.5 },
    { cx: hx - r, cy: -hy + r, a0: Math.PI * 1.5, a1: Math.PI * 2 },
  ];
  const points: THREE.Vector2[] = [];
  for (const item of corners) {
    for (let i = 0; i < corner; i += 1) {
      const a = item.a0 + ((item.a1 - item.a0) * i) / corner;
      points.push(new THREE.Vector2(item.cx + Math.cos(a) * r, item.cy + Math.sin(a) * r));
    }
  }
  return points;
}

function buildSweep(
  points: THREE.Vector3[],
  profile: THREE.Vector2[],
  closed: boolean,
  capStart: boolean,
  capEnd: boolean,
): THREE.BufferGeometry {
  const frames = framesAlong(points);
  const segments = profile.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const tangents: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const radial = new THREE.Vector3();

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const frame = frames[i];
    for (let j = 0; j < segments; j += 1) {
      const pr = profile[j];
      positions.push(
        point.x + frame.normal.x * pr.x + frame.binormal.x * pr.y,
        point.y + frame.normal.y * pr.x + frame.binormal.y * pr.y,
        point.z + frame.normal.z * pr.x + frame.binormal.z * pr.y,
      );
      radial.set(0, 0, 0).addScaledVector(frame.normal, pr.x).addScaledVector(frame.binormal, pr.y);
      if (radial.lengthSq() < 1e-8) radial.copy(frame.normal);
      radial.normalize();
      normals.push(radial.x, radial.y, radial.z);
      tangents.push(frame.tangent.x, frame.tangent.y, frame.tangent.z, 1);
      uvs.push(j / Math.max(1, segments - 1), i / Math.max(1, points.length - 1));
    }
  }

  const columns = closed ? segments : segments - 1;
  for (let i = 0; i < points.length - 1; i += 1) {
    for (let j = 0; j < columns; j += 1) {
      const j2 = closed ? (j + 1) % segments : j + 1;
      const a = i * segments + j;
      const b = i * segments + j2;
      const c = (i + 1) * segments + j;
      const d = (i + 1) * segments + j2;
      indices.push(a, c, b, b, c, d);
    }
  }

  if (capStart) addCap(positions, normals, tangents, uvs, indices, 0, segments, points[0], frames[0].tangent, -1);
  if (capEnd) {
    const last = points.length - 1;
    addCap(positions, normals, tangents, uvs, indices, last * segments, segments, points[last], frames[last].tangent, 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("tangent", new THREE.Float32BufferAttribute(tangents, 4));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function addCap(
  positions: number[],
  normals: number[],
  tangents: number[],
  uvs: number[],
  indices: number[],
  ringStart: number,
  segments: number,
  center: THREE.Vector3,
  tangent: THREE.Vector3,
  sign: number,
) {
  const centerIndex = positions.length / 3;
  positions.push(center.x, center.y, center.z);
  normals.push(tangent.x * sign, tangent.y * sign, tangent.z * sign);
  tangents.push(tangent.x, tangent.y, tangent.z, 1);
  uvs.push(0.5, 0.5);
  for (let j = 0; j < segments; j += 1) {
    const a = ringStart + j;
    const b = ringStart + ((j + 1) % segments);
    if (sign > 0) indices.push(centerIndex, a, b);
    else indices.push(centerIndex, b, a);
  }
}

function framesAlong(points: THREE.Vector3[]) {
  const binormal = new THREE.Vector3(0, 0, 1);
  return points.map((point, index) => {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangent = next.clone().sub(prev);
    if (tangent.lengthSq() < 1e-8) tangent.set(0, 1, 0);
    tangent.normalize();
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0);
    if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0);
    normal.normalize();
    return { point, tangent, normal, binormal };
  });
}

function plateGeometries(width: number, height: number) {
  const rim = 0.012;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  const ceramic = new THREE.ExtrudeGeometry(shape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.0035,
    bevelSize: 0.0035,
    bevelSegments: 1,
    curveSegments: 1,
  });
  ceramic.translate(0, 0, -0.013);
  const boxes = [
    box(width + rim, rim, 0.04, 0, height - rim / 2, 0),
    box(rim, height, 0.04, -width / 2, height / 2, 0),
    box(rim, height, 0.04, width / 2, height / 2, 0),
    box(width + rim, rim, 0.04, 0, rim / 2, 0),
  ];
  const frame = mergeGeometries(boxes, false) ?? boxes[0];
  for (const geo of boxes) {
    if (geo !== frame) geo.dispose();
  }
  return { ceramic, frame };
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return geo;
}

function ribbon(points: THREE.Vector3[], width: number) {
  const half = width / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let distance = 0;
  let previousSide = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dir = next.clone().sub(prev);
    dir.y = 0;
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    if (side.dot(previousSide) < 0) side.negate();
    previousSide = side;
    const point = points[i];
    positions.push(point.x + side.x * half, point.y, point.z + side.z * half);
    positions.push(point.x - side.x * half, point.y, point.z - side.z * half);
    normals.push(0, 1, 0, 0, 1, 0);
    if (i > 0) distance += points[i].distanceTo(points[i - 1]);
    uvs.push(distance, 1, distance, 0);
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function sampleCamera(
  t: number,
  fly: number,
  aspect: number,
  pointer: THREE.Vector2,
  camera: THREE.PerspectiveCamera,
) {
  let index = 0;
  while (index < CAMERA_KEYS.length - 2 && t > CAMERA_KEYS[index + 1].t) index += 1;
  const a = CAMERA_KEYS[index];
  const b = CAMERA_KEYS[index + 1];
  const span = Math.max(1e-4, b.t - a.t);
  const u = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);
  camera.position.lerpVectors(a.pos, b.pos, u);
  const look = a.look.clone().lerp(b.look, u);
  let fov = THREE.MathUtils.lerp(a.fov, b.fov, u);
  const narrow = aspect < 1.05 ? THREE.MathUtils.clamp((1.05 - aspect) / 0.55, 0, 1) * (1 - fly) : 0;
  if (narrow > 0) {
    camera.position.y += 0.85 * narrow;
    look.y -= 0.45 * narrow;
    look.x = THREE.MathUtils.lerp(look.x, 0.2, narrow);
    fov = THREE.MathUtils.lerp(fov, Math.min(64, fov + 8), narrow);
  }
  const parallax = 1 - fly * 0.65;
  camera.position.x += pointer.x * 0.18 * parallax;
  camera.position.y += pointer.y * 0.1 * parallax;
  look.x += pointer.x * 0.08 * parallax;
  look.y += pointer.y * 0.04 * parallax;
  camera.fov = fov;
  camera.lookAt(look);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

type Scratch = {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  plate: THREE.Vector3;
  reflectorWorld: THREE.Vector3;
  cameraWorld: THREE.Vector3;
  rotation: THREE.Matrix4;
  normal: THREE.Vector3;
  view: THREE.Vector3;
  lookAt: THREE.Vector3;
  target: THREE.Vector3;
  clipPlane: THREE.Vector4;
  q: THREE.Vector4;
  reflectorPlane: THREE.Plane;
  textureMatrix: THREE.Matrix4;
};

function placeReflectionCamera(
  camera: THREE.PerspectiveCamera,
  floor: THREE.Mesh,
  reflectionCamera: THREE.PerspectiveCamera,
  scratch: Scratch,
) {
  scratch.reflectorWorld.setFromMatrixPosition(floor.matrixWorld);
  scratch.cameraWorld.setFromMatrixPosition(camera.matrixWorld);
  scratch.rotation.extractRotation(floor.matrixWorld);
  scratch.normal.set(0, 0, 1).applyMatrix4(scratch.rotation);
  scratch.view.subVectors(scratch.reflectorWorld, scratch.cameraWorld);
  scratch.view.reflect(scratch.normal).negate().add(scratch.reflectorWorld);
  scratch.rotation.extractRotation(camera.matrixWorld);
  scratch.lookAt.set(0, 0, -1).applyMatrix4(scratch.rotation).add(scratch.cameraWorld);
  scratch.target.subVectors(scratch.reflectorWorld, scratch.lookAt);
  scratch.target.reflect(scratch.normal).negate().add(scratch.reflectorWorld);
  reflectionCamera.position.copy(scratch.view);
  reflectionCamera.up.set(0, 1, 0).applyMatrix4(scratch.rotation);
  reflectionCamera.up.reflect(scratch.normal);
  reflectionCamera.lookAt(scratch.target);
  reflectionCamera.far = camera.far;
  reflectionCamera.near = camera.near;
  reflectionCamera.updateMatrixWorld();
  reflectionCamera.projectionMatrix.copy(camera.projectionMatrix);

  scratch.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  scratch.textureMatrix.multiply(reflectionCamera.projectionMatrix);
  scratch.textureMatrix.multiply(reflectionCamera.matrixWorldInverse);
  scratch.textureMatrix.multiply(floor.matrixWorld);

  scratch.reflectorPlane.setFromNormalAndCoplanarPoint(scratch.normal, scratch.reflectorWorld);
  scratch.reflectorPlane.applyMatrix4(reflectionCamera.matrixWorldInverse);
  scratch.clipPlane.set(
    scratch.reflectorPlane.normal.x,
    scratch.reflectorPlane.normal.y,
    scratch.reflectorPlane.normal.z,
    scratch.reflectorPlane.constant,
  );
  const projection = reflectionCamera.projectionMatrix;
  const elements = projection.elements;
  scratch.q.set(
    (Math.sign(scratch.clipPlane.x) + elements[8]) / elements[0],
    (Math.sign(scratch.clipPlane.y) + elements[9]) / elements[5],
    -1,
    (1 + elements[10]) / elements[14],
  );
  scratch.clipPlane.multiplyScalar(2 / scratch.clipPlane.dot(scratch.q));
  elements[2] = scratch.clipPlane.x;
  elements[6] = scratch.clipPlane.y;
  elements[10] = scratch.clipPlane.z + 1 - 0.003;
  elements[14] = scratch.clipPlane.w;
}

function countTriangles(root: THREE.Object3D) {
  let count = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const index = mesh.geometry.index;
    count += index ? index.count / 3 : mesh.geometry.attributes.position.count / 3;
  });
  return Math.round(count);
}

function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  if (!info) return gl.getParameter(gl.RENDERER);
  return String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
}
