import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * The Arc model loader.
 *
 * ArcCanvas and the homepage layout do not know whether the mesh is
 * procedural or an artist GLB. Lighting, camera, post, and placement stay
 * in arc-scene.ts. Swap instructions: app/home/ARC-MODEL.md.
 *
 * Set `url` to a path under public/, for example "/models/arc.glb".
 * Leave it null to keep the procedural arc.
 */
export const arcModelConfig: { url: string | null } = {
  url: null,
};

export type ArcModel = {
  object: THREE.Object3D;
  finCount: number;
  /** Move the anodised fins. Defaults to the hero's band of three. */
  setBand: (startIndex: number, hotCount?: number) => void;
  dispose: () => void;
};

type BuildOptions = {
  finCount: number;
};

const HOT_COLOR = 0xd8643e;

function anodisedMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: HOT_COLOR,
    metalness: 0.55,
    roughness: 0.38,
    clearcoat: 0.8,
    clearcoatRoughness: 0.25,
  });
}

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
  if (!context) throw new Error("Could not draw the arc textures.");
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shade = sample(x, y);
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

function createProceduralArc(options: BuildOptions): ArcModel {
  const random = hash(7);
  const brushed = noiseTexture(512, 512, (_x, y) => {
    return 150 + Math.sin(y * 0.9 + Math.sin(y * 0.07) * 4) * 12 + (random() * 60 - 30);
  });
  brushed.repeat.set(1, 6);

  const count = options.finCount;
  const radius = 3.1;
  const finGeometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xb3b1ac,
    metalness: 1,
    roughness: 0.15,
    roughnessMap: brushed,
    anisotropy: 0.7,
    anisotropyRotation: Math.PI / 2,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
    envMapIntensity: 1,
  });
  const hotMaterial = anodisedMaterial();
  const fins = new THREE.InstancedMesh(finGeometry, metal, count);
  fins.castShadow = true;
  fins.receiveShadow = true;
  fins.frustumCulled = false;

  const matrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let index = 0; index < count; index += 1) {
    const u = index / (count - 1);
    const angle = Math.PI * u;
    const width = 0.5 + 0.13 * Math.sin(u * Math.PI * 3 + 0.6) + 0.035 * Math.sin(u * Math.PI * 11 + 1.3);
    const depth = 0.62 + 0.1 * Math.cos(u * Math.PI * 2);
    const radial = radius + width / 2;
    dummy.position.set(Math.cos(angle) * radial, Math.sin(angle) * radial, 0);
    dummy.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    dummy.scale.set(width, 0.021, depth);
    dummy.updateMatrix();
    const matrix = dummy.matrix.clone();
    matrices.push(matrix);
    fins.setMatrixAt(index, matrix);
  }
  fins.instanceMatrix.needsUpdate = true;

  const hots = [0, 1, 2].map(() => {
    const mesh = new THREE.Mesh(finGeometry, hotMaterial);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  });

  const group = new THREE.Group();
  group.add(fins, ...hots);

  const spineMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x8d8c89,
    metalness: 1,
    roughness: 0.18,
    clearcoat: 0.5,
  });
  const spine = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.028, 24, 400, Math.PI), spineMaterial);
  spine.position.z = -0.22;
  spine.castShadow = true;
  const spineBack = spine.clone();
  spineBack.position.z = 0.22;
  group.add(spine, spineBack);

  const footingMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2a2c2e,
    metalness: 0.6,
    roughness: 0.45,
  });
  for (const side of [-1, 1]) {
    const footing = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.18, 1.05, 3, 0.03), footingMaterial);
    footing.position.set(side * (radius + 0.42), 0.09, 0);
    footing.castShadow = true;
    footing.receiveShadow = true;
    group.add(footing);
  }

  let current = -1;
  let currentCount = 0;
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  function placeHot(slot: number, finIndex: number) {
    matrices[finIndex].decompose(position, quaternion, scale);
    hots[slot].visible = true;
    hots[slot].position.copy(position);
    hots[slot].quaternion.copy(quaternion);
    hots[slot].scale.copy(scale);
    fins.setMatrixAt(finIndex, hidden);
  }

  function restore(finIndex: number) {
    fins.setMatrixAt(finIndex, matrices[finIndex]);
  }

  function setBand(startIndex: number, hotCount = 3) {
    const slots = Math.max(1, Math.min(hots.length, Math.round(hotCount)));
    const start = Math.max(0, Math.min(count - slots, Math.round(startIndex)));
    if (start === current && slots === currentCount) return;
    if (current >= 0) {
      for (let index = 0; index < currentCount; index += 1) restore(current + index);
    }
    for (let slot = 0; slot < hots.length; slot += 1) {
      if (slot < slots) placeHot(slot, start + slot);
      else {
        hots[slot].visible = false;
        hots[slot].scale.set(0, 0, 0);
      }
    }
    fins.instanceMatrix.needsUpdate = true;
    current = start;
    currentCount = slots;
  }

  setBand(Math.round(count * 0.66));

  return {
    object: group,
    finCount: count,
    setBand,
    dispose() {
      finGeometry.dispose();
      metal.dispose();
      hotMaterial.dispose();
      brushed.dispose();
      spineMaterial.dispose();
      spine.geometry.dispose();
      footingMaterial.dispose();
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry && mesh.geometry !== finGeometry && mesh.geometry !== spine.geometry) {
          mesh.geometry.dispose();
        }
      });
    },
  };
}

function isFin(mesh: THREE.Mesh) {
  if (mesh.userData.fin === true) return true;
  return /^fin/i.test(mesh.name);
}

function finOrder(mesh: THREE.Mesh, fallback: number) {
  if (typeof mesh.userData.index === "number") return mesh.userData.index as number;
  const named = mesh.name.match(/(\d+)/);
  if (named) return Number(named[1]);
  return fallback;
}

async function loadGlbArc(url: string): Promise<ArcModel> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  const entries: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[]; order: number }[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !isFin(mesh)) return;
    entries.push({ mesh, original: mesh.material, order: finOrder(mesh, entries.length) });
  });
  entries.sort((a, b) => a.order - b.order);

  const hotMaterial = anodisedMaterial();
  const staticBand = root.userData.staticBand === true || entries.length < 3;
  let current = -1;
  let currentCount = 0;

  function setBand(startIndex: number, hotCount = 3) {
    if (staticBand) return;
    const slots = Math.max(1, Math.min(3, Math.round(hotCount)));
    const start = Math.max(0, Math.min(entries.length - slots, Math.round(startIndex)));
    if (start === current && slots === currentCount) return;
    entries.forEach((entry, index) => {
      const hot = index >= start && index < start + slots;
      entry.mesh.material = hot ? hotMaterial : entry.original;
    });
    current = start;
    currentCount = slots;
  }

  if (!staticBand) setBand(Math.round(entries.length * 0.66));

  return {
    object: root,
    finCount: Math.max(entries.length, 3),
    setBand,
    dispose() {
      hotMaterial.dispose();
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          if (material !== hotMaterial) material.dispose();
        });
      });
    },
  };
}

export async function createArcModel(options: BuildOptions): Promise<ArcModel> {
  const url = arcModelConfig.url;
  if (url) return loadGlbArc(url);
  return createProceduralArc(options);
}
