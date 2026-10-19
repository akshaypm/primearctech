import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { sharedRenderer } from "../gl-host";
import { textReveal } from "./clock";
import { sampleCamera } from "./path";

const GRAIN = 0.026;
const ORANGE = 0xd8643e;

const grainShader = new THREE.RawShaderMaterial({
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tBloom: { value: null as THREE.Texture | null },
    seed: { value: 0 },
    aspect: { value: 1 },
    grain: { value: GRAIN },
    arrival: { value: 0 },
    cover: { value: 1 },
    tDepth: { value: null as THREE.Texture | null },
  },
  vertexShader: `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform sampler2D tDepth;
    uniform float seed;
    uniform float aspect;
    uniform float grain;
      uniform float arrival;
      uniform float cover;
    varying vec2 vUv;
    #include <tonemapping_pars_fragment>
    #include <colorspace_pars_fragment>
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float center = texture2D(tDepth, vec2(0.5, 0.46)).r;
      float depth = texture2D(tDepth, vUv).r;
      float coc = smoothstep(0.004, 0.045, abs(depth - center)) * arrival;
      vec3 blur = vec3(0.0);
      vec2 texel = vec2(1.6 / 1440.0, 1.6 / 900.0);
      blur += texture2D(tDiffuse, vUv + texel * vec2(1.2, 0.4)).rgb;
      blur += texture2D(tDiffuse, vUv + texel * vec2(-1.1, 0.6)).rgb;
      blur += texture2D(tDiffuse, vUv + texel * vec2(0.4, -1.3)).rgb;
      blur += texture2D(tDiffuse, vUv + texel * vec2(-0.7, -1.0)).rgb;
      blur += texture2D(tDiffuse, vUv + texel * vec2(1.4, 1.1)).rgb;
      blur += texture2D(tDiffuse, vUv + texel * vec2(-1.3, -0.3)).rgb;
      c.rgb = mix(c.rgb, blur / 6.0, coc * 0.72);
      vec3 bloom = texture2D(tBloom, vUv).rgb;
      c.rgb += bloom * 0.42;
      vec2 d = vUv - 0.5;
      d.x *= aspect;
      c.rgb *= mix(0.62, 1.0, smoothstep(1.15, 0.25, length(d)));
      c.rgb = NeutralToneMapping(c.rgb);
      c = sRGBTransferOETF(c);
      vec2 p = gl_FragCoord.xy + seed * vec2(113.0, 71.0);
      float n = hash12(p) + hash12(p + 19.19) - 1.0;
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb += n * grain * (1.0 - smoothstep(0.22, 0.7, luma));
      gl_FragColor = vec4(c.rgb * cover, cover);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

const bloomShader = new THREE.RawShaderMaterial({
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float hot = smoothstep(0.55, 0.95, luma) * smoothstep(0.05, 0.28, c.r - c.b);
      vec2 texel = vec2(2.4 / 720.0, 2.4 / 450.0);
      vec3 sum = c * hot;
      sum += texture2D(tDiffuse, vUv + texel).rgb * hot;
      sum += texture2D(tDiffuse, vUv - texel).rgb * hot;
      gl_FragColor = vec4(sum * 0.12, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

function metal(color: number, roughness = 0.42, metalness = 0.72) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function hotMetal() {
  const material = new THREE.MeshStandardMaterial({
    color: ORANGE,
    roughness: 0.32,
    metalness: 0.48,
    emissive: ORANGE,
    emissiveIntensity: 1.4,
  });
  return material;
}

function buildWave() {
  const group = new THREE.Group();
  const random = (() => {
    let seed = 3;
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  })();
  const fin = new RoundedBoxGeometry(1, 1, 1, 2, 0.04);
  const standing = new THREE.InstancedMesh(fin, metal(0xc8c6c0, 0.38, 0.8), 72);
  const dummy = new THREE.Object3D();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const tooth = new THREE.Mesh(fin, hotMetal());
  let hotIndex = 40;
  for (let index = 0; index < 72; index += 1) {
    const u = index / 71;
    const height = 0.85 + Math.sin(u * Math.PI * 2.1 + 0.3) * 0.7;
    const x = -5.4 + u * 11.2;
    dummy.position.set(x, 0.16 + height / 2, (random() - 0.5) * 0.08);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.055, height, 0.58);
    dummy.updateMatrix();
    standing.setMatrixAt(index, index === hotIndex ? hidden : dummy.matrix);
    if (index === hotIndex) {
      tooth.position.copy(dummy.position);
      tooth.scale.copy(dummy.scale);
      tooth.scale.x = 0.08;
    }
  }
  standing.instanceMatrix.needsUpdate = true;
  standing.frustumCulled = false;
  const rail = new THREE.Mesh(new RoundedBoxGeometry(12, 0.14, 0.8, 3, 0.03), metal(0x2a2c2e, 0.4, 0.7));
  rail.position.y = 0.07;
  group.add(standing, tooth, rail);
  return group;
}

function buildRing() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.028, 10, 48), metal(0xb7b4ae, 0.28, 0.86));
  ring.rotation.y = 0.6;
  const pip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), hotMetal());
  pip.position.set(1.15, 0.55, 0.2);
  group.add(ring, pip);
  return group;
}

function buildWavyArch() {
  const group = new THREE.Group();
  const count = 42;
  const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.03);
  const mesh = new THREE.InstancedMesh(geo, metal(0xb9b7b2, 0.34, 0.78), count);
  const dummy = new THREE.Object3D();
  const hot = new THREE.Mesh(geo, hotMetal());
  for (let index = 0; index < count; index += 1) {
    const u = index / (count - 1);
    const x = (u - 0.5) * 9.2;
    const y = Math.sin(u * Math.PI) * 3.1;
    dummy.position.set(x, 0.2 + y, 0);
    dummy.scale.set(0.045, 0.55, 0.16);
    dummy.rotation.set(0, 0, (0.5 - u) * 0.35);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (index === 21) {
      hot.position.copy(dummy.position);
      hot.scale.set(0.07, 0.7, 0.18);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh, hot);
  group.position.set(29.2, 0, -6.4);
  return group;
}

function buildHall() {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(62, 36), metal(0x2c3034, 0.46, 0.38));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(16, 0, 0);
  group.add(floor);

  const ceilingMat = metal(0x4a4038, 0.62, 0.22);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(62, 34), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(16, 6.4, 0);
  group.add(ceiling);

  const ribMat = metal(0x6a5c50, 0.4, 0.55);
  const ribCount = 5;
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.22, 30), ribMat, ribCount);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < ribCount; index += 1) {
    dummy.position.set(-2 + index * 11.5, 6.15, 0);
    dummy.updateMatrix();
    ribs.setMatrixAt(index, dummy.matrix);
  }
  group.add(ribs);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe2c2,
    emissive: 0xffd2a4,
    emissiveIntensity: 0.22,
    roughness: 0.4,
  });
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.06, 0.28), lampMat, 4);
  for (let index = 0; index < 4; index += 1) {
    dummy.position.set(2 + index * 9.5, 6.22, index % 2 === 0 ? -2.2 : 2.4);
    dummy.updateMatrix();
    lamps.setMatrixAt(index, dummy.matrix);
    const pool = new THREE.PointLight(0xffe6cc, 6.5, 16, 2);
    pool.position.set(2 + index * 9.5, 5.4, index % 2 === 0 ? -1.2 : 1.4);
    group.add(pool);
  }
  group.add(lamps);

  const wall = metal(0x3a3836, 0.7, 0.18);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(62, 6.4), wall);
  back.position.set(16, 3.2, -16);
  group.add(back);
  return group;
}

export type JourneyWorld = {
  render: (progress: number, timeMs: number, portrait: boolean) => void;
  resize: (width: number, height: number) => void;
  texture: () => THREE.Texture | null;
  reveal: (progress: number) => { hero: number; demo: number; shift: number };
  pose: () => { x: number; y: number; z: number; fov: number };
  dispose: () => void;
};

export async function mountJourneyWorld(): Promise<JourneyWorld> {
  const renderer = sharedRenderer();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16181b);
  scene.fog = new THREE.Fog(0x1a1c1f, 28, 90);
  scene.add(new THREE.HemisphereLight(0xc4beb4, 0x2a241e, 1.6));
  const key = new THREE.DirectionalLight(0xfff6ea, 6.5);
  key.position.set(-8, 12, 10);
  const fill = new THREE.DirectionalLight(0xd8d0c4, 2.2);
  fill.position.set(10, 6, 6);
  scene.add(key, fill);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24), new THREE.MeshBasicMaterial({ color: 0x2a2622, side: THREE.BackSide })));
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(10, 2), new THREE.MeshBasicMaterial({ color: 0xffe4c4, side: THREE.DoubleSide }));
  lamp.position.set(0, 5, 4);
  lamp.lookAt(0, 0, 0);
  env.add(lamp);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  scene.environmentIntensity = 1.15;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.12, 160);

  const wave = buildWave();
  wave.position.set(26.2, 0, -4.2);
  const ring = buildRing();
  ring.position.set(14.6, 2.7, 3.6);
  scene.add(buildHall(), wave, ring, buildWavyArch());

  const sceneTarget = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(2, 2),
  });
  const bloomTarget = new THREE.WebGLRenderTarget(2, 2);
  const outTarget = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false });
  const grainQuad = new FullScreenQuad(grainShader);
  const bloomQuad = new FullScreenQuad(bloomShader);
  grainQuad._mesh.frustumCulled = false;
  bloomQuad._mesh.frustumCulled = false;
  let width = 2;
  let height = 2;
  let cssWidth = 2;
  let cssHeight = 2;
  let seed = 0;
  const lastPose = { x: 0, y: 0, z: 0, fov: 24 };

  function resize(nextWidth: number, nextHeight: number) {
    cssWidth = Math.max(2, Math.round(nextWidth));
    cssHeight = Math.max(2, Math.round(nextHeight));
    const ratio = renderer.getPixelRatio() || 1;
    width = Math.max(2, Math.round(cssWidth * ratio));
    height = Math.max(2, Math.round(cssHeight * ratio));
    sceneTarget.setSize(width, height);
    bloomTarget.setSize(Math.max(2, width >> 1), Math.max(2, height >> 1));
    outTarget.setSize(width, height);
    camera.aspect = cssWidth / cssHeight;
    camera.updateProjectionMatrix();
    grainShader.uniforms.aspect.value = camera.aspect;
  }

  function render(progress: number, timeMs: number, portrait: boolean) {
    const pose = sampleCamera(progress, timeMs, portrait);
    camera.position.copy(pose.eye);
    camera.lookAt(pose.look);
    camera.fov = pose.fov;
    lastPose.x = pose.eye.x;
    lastPose.y = pose.eye.y;
    lastPose.z = pose.eye.z;
    lastPose.fov = pose.fov;
    camera.updateProjectionMatrix();
    const previousTone = renderer.toneMapping;
    const previousTarget = renderer.getRenderTarget();
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setScissorTest(false);
    renderer.setRenderTarget(sceneTarget);
    renderer.setViewport(0, 0, cssWidth, cssHeight);
    renderer.setClearColor(0x16181b, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    bloomShader.uniforms.tDiffuse.value = sceneTarget.texture;
    renderer.setRenderTarget(bloomTarget);
    bloomQuad.render(renderer);
    grainShader.uniforms.tDiffuse.value = sceneTarget.texture;
    grainShader.uniforms.tBloom.value = bloomTarget.texture;
    grainShader.uniforms.tDepth.value = sceneTarget.depthTexture;
    grainShader.uniforms.seed.value = seed;
    grainShader.uniforms.arrival.value = textReveal(progress).demo;
    grainShader.uniforms.cover.value = progress <= 0.16 ? 0 : Math.min(1, (progress - 0.16) / 0.18);
    seed = (seed + 1) % 61;
    renderer.setRenderTarget(outTarget);
    grainQuad.render(renderer);
    renderer.setRenderTarget(previousTarget);
    renderer.toneMapping = previousTone;
  }

  resize(2, 2);

  return {
    render,
    resize,
    texture: () => outTarget.texture,
    reveal: textReveal,
    pose: () => lastPose,
    dispose() {
      sceneTarget.dispose();
      bloomTarget.dispose();
      outTarget.dispose();
      grainQuad.dispose();
      bloomQuad.dispose();
      scene.environment?.dispose();
    },
  };
}
