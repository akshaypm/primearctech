import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * BLOCKOUT for milestone 1 is the exported animatic world.
 * Object names stay as Blender exported them. Materials are reassigned
 * from those Blender names onto the shared clay and glaze set.
 */

const BLOCKOUT = true;

export type WorldMaterials = {
  clay: THREE.Material;
  dark: THREE.Material;
  rods: THREE.Material;
  glaze: THREE.Material;
  bone: THREE.Material;
  ground: THREE.Material;
  contact: THREE.Texture;
};

export type WorldScene = {
  group: THREE.Group;
  contact: THREE.Group;
  setAssembly: (progress: number) => void;
  setTime: (time: number) => void;
  castShadows: (on: boolean) => void;
};

const CLAY = new Set(["terracotta", "shell_in", "shell_rim", "heat0", "heat2", "heat5", "tablet", "ground"]);
const RODS = new Set(["clayrod"]);
const DARK = new Set(["darkclay", "screen", "engrave2"]);
const GLAZE = new Set(["BoneGlaze", "BoneStone"]);
const GROUND = new Set(["sand"]);

function materialFor(name: string, materials: WorldMaterials) {
  if (GLAZE.has(name)) return materials.glaze;
  if (RODS.has(name)) return materials.rods;
  if (DARK.has(name)) return materials.dark;
  if (GROUND.has(name)) return materials.ground;
  if (name === "engrave") return materials.bone;
  if (CLAY.has(name) || name === "") return materials.clay;
  return materials.clay;
}

function triangleCount(mesh: THREE.Mesh) {
  const index = mesh.geometry.index;
  if (index) return index.count / 3;
  const position = mesh.geometry.getAttribute("position");
  return position ? position.count / 3 : 0;
}

type HeightGrid = { height: Float32Array; nx: number; nz: number; step: number };

function heightGrid(source: THREE.BufferAttribute, minX: number, minZ: number, spanX: number, spanZ: number, step: number): HeightGrid {
  const nx = Math.max(2, Math.ceil(spanX / step) + 1);
  const nz = Math.max(2, Math.ceil(spanZ / step) + 1);
  const height = new Float32Array(nx * nz);
  height.fill(-1e8);
  for (let i = 0; i < source.count; i++) {
    const x = source.getX(i);
    const y = source.getY(i);
    const z = source.getZ(i);
    if (x < minX || z < minZ || x > minX + spanX || z > minZ + spanZ) continue;
    const ix = Math.min(nx - 1, Math.max(0, Math.round((x - minX) / step)));
    const iz = Math.min(nz - 1, Math.max(0, Math.round((z - minZ) / step)));
    const cell = iz * nx + ix;
    if (y > height[cell]) height[cell] = y;
  }
  for (let i = 0; i < height.length; i++) if (height[i] < -1e7) height[i] = 0;
  return { height, nx, nz, step };
}

type Hole = { minX: number; maxX: number; minZ: number; maxZ: number };

function gridGeometry(minX: number, minZ: number, grid: HeightGrid, hole: Hole | null) {
  const { height, nx, nz, step } = grid;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const used = new Int32Array(nx * nz);
  used.fill(-1);
  let cursor = 0;
  const vertex = (ix: number, iz: number) => {
    const cell = iz * nx + ix;
    if (used[cell] >= 0) return used[cell];
    used[cell] = cursor;
    const x = minX + ix * step;
    const z = minZ + iz * step;
    positions.push(x, height[cell], z);
    uvs.push(x * 0.07, z * 0.07);
    cursor += 1;
    return used[cell];
  };
  const covered = (ix: number, iz: number) => {
    if (!hole) return false;
    const x = minX + ix * step;
    const z = minZ + iz * step;
    return x > hole.minX && x < hole.maxX && z > hole.minZ && z < hole.maxZ;
  };
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      if (covered(ix, iz) && covered(ix + 1, iz) && covered(ix, iz + 1) && covered(ix + 1, iz + 1)) continue;
      const a = vertex(ix, iz);
      const b = vertex(ix + 1, iz);
      const c = vertex(ix, iz + 1);
      const d = vertex(ix + 1, iz + 1);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The sand primitive is about a million triangles across 840 m.
 * The second primitive is the carved loss terrain and stays intact.
 * A hole in the coarse sand lets that sculpt show through without z-fighting.
 */
function reshapeGround(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  const sand = meshes.find((mesh) => (mesh.geometry.getAttribute("position")?.count ?? 0) >= 180000);
  if (!sand) return;
  const sculpt = meshes.find((mesh) => mesh !== sand);
  const position = sand.geometry.getAttribute("position");
  if (!position) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  let hole: Hole | null = null;
  if (sculpt) {
    sculpt.geometry.computeBoundingBox();
    const box = sculpt.geometry.boundingBox;
    if (box) {
      const inset = 0.8;
      hole = { minX: box.min.x + inset, maxX: box.max.x - inset, minZ: box.min.z + inset, maxZ: box.max.z - inset };
    }
    sculpt.castShadow = false;
    sculpt.receiveShadow = true;
  }
  const coarse = heightGrid(position, minX, minZ, maxX - minX, maxZ - minZ, 4);
  const next = gridGeometry(minX, minZ, coarse, hole);
  sand.geometry.dispose();
  sand.geometry = next;
  sand.castShadow = false;
  sand.receiveShadow = true;
}

function isGroundMesh(mesh: THREE.Mesh) {
  if (mesh.name === "ground" || mesh.name.startsWith("ground_")) return true;
  const parent = mesh.parent;
  return parent?.name === "ground" || parent?.userData?.name === "ground";
}

function contactPlane(texture: THREE.Texture, x: number, z: number, span: number) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.03, z);
  mesh.scale.set(span, span, 1);
  mesh.renderOrder = 2;
  mesh.name = "contact";
  mesh.frustumCulled = false;
  return mesh;
}

export function loadWorldScene(materials: WorldMaterials, onProgress: (value: number) => void): Promise<WorldScene> {
  const draco = new DRACOLoader();
  draco.setDecoderPath("/lab/network/draco/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  return new Promise((resolve, reject) => {
    loader.load(
      "/lab/network/world-blockout.glb",
      (gltf) => {
        draco.dispose();
        resolve(adopt(gltf.scene, gltf.animations, materials));
      },
      (event) => {
        if (event.total > 0) onProgress(Math.min(1, event.loaded / event.total));
      },
      (error) => {
        draco.dispose();
        reject(error);
      },
    );
  });
}

type ContactAnchor = { mesh: THREE.Object3D; plane: THREE.Mesh };

function adopt(root: THREE.Group, animations: THREE.AnimationClip[], materials: WorldMaterials): WorldScene {
  const group = root;
  group.name = "world-blockout";
  group.userData.blockout = BLOCKOUT;
  const contact = new THREE.Group();
  contact.name = "world-contact";
  const replaced = new Set<THREE.Material>();
  const anchors: ContactAnchor[] = [];
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const contactCandidates: THREE.Object3D[] = [];

  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material;
    const list = Array.isArray(source) ? source : [source];
    const next = list.map((entry) => {
      replaced.add(entry);
      return materialFor(entry.name || "", materials);
    });
    mesh.material = next.length === 1 ? next[0] : next;
    const inside = /^LAYERS_(shaft|band)/.test(mesh.name);
    if (inside) {
      const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const sided = current.map((entry) => {
        const clone = entry.clone();
        clone.side = THREE.DoubleSide;
        return clone;
      });
      mesh.material = sided.length === 1 ? sided[0] : sided;
    }
    mesh.castShadow = !isGroundMesh(mesh) && triangleCount(mesh) < 20000;
    mesh.receiveShadow = true;
    const names = list.map((entry) => entry.name || "");
    const bone = names.some((name) => name === "BoneGlaze" || name === "BoneStone");
    const sphere = /^ATTN_out|^HERO_n3_/.test(mesh.name);
    if (bone || sphere) contactCandidates.push(mesh);
  });

  let ground: THREE.Object3D | null = null;
  group.traverse((obj) => {
    if (!ground && obj.userData?.name === "ground") ground = obj;
  });
  if (!ground) ground = group.getObjectByName("ground") ?? null;
  if (ground) reshapeGround(ground);

  for (const material of replaced) {
    if (material === materials.clay || material === materials.dark || material === materials.rods || material === materials.glaze || material === materials.bone || material === materials.ground) continue;
    material.dispose();
  }

  const mixer = new THREE.AnimationMixer(group);
  const actions = animations.map((clip) => {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    return action;
  });
  let progress = 1;

  // The exported rest pose is the start of the assembly: rods and tokens are scaled to 0.
  // Measure contact shadows once the clips have opened them.
  function scrub(time: number) {
    for (const action of actions) {
      action.enabled = true;
      action.paused = false;
    }
    mixer.setTime(time);
  }

  function placeContacts() {
    for (const mesh of contactCandidates) {
      box.setFromObject(mesh);
      box.getSize(size);
      box.getCenter(center);
      const span = Math.max(size.x, size.z);
      if (span < 0.28 || box.min.y > 4) continue;
      const plane = contactPlane(materials.contact, center.x, center.z, Math.min(6.5, span * 2.1));
      contact.add(plane);
      anchors.push({ mesh, plane });
    }
  }

  scrub(52);
  placeContacts();
  scrub(0);
  contact.visible = progress > 0.35;

  return {
    group,
    contact,
    setTime(time) {
      scrub(time);
      for (const anchor of anchors) {
        box.setFromObject(anchor.mesh);
        box.getCenter(center);
        anchor.plane.position.x = center.x;
        anchor.plane.position.z = center.z;
      }
    },
    setAssembly(next) {
      progress = Math.min(1, Math.max(0, next));
      contact.visible = progress > 0.35;
    },
    castShadows(on) {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const heavy = isGroundMesh(mesh) || triangleCount(mesh) >= 20000;
        mesh.castShadow = on && !heavy;
        mesh.receiveShadow = true;
      });
      contact.visible = on && progress > 0.35;
    },
  };
}
