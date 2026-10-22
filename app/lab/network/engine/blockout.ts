import * as THREE from "three";
import { assemblyScale } from "./copy";

/**
 * BLOCKOUT proxies for the camera flight.
 * Replaced by the real scenes in later milestones.
 * Positions are metres, three.js Y-up, sitting on the look targets of camera-path.json.
 */

const BLOCKOUT = true;

const UP = new THREE.Vector3(0, 1, 0);
const _object = new THREE.Object3D();
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();

type Materials = {
  clay: THREE.Material;
  clayDeep: THREE.Material;
  dark: THREE.Material;
  rods: THREE.Material;
  glaze: THREE.Material;
  contact: THREE.Texture;
};

type Slot = {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
  order: number;
  idle: boolean;
};

export type Blockout = {
  group: THREE.Group;
  contact: THREE.Group;
  setAssembly: (progress: number) => void;
  setIdle: (time: number, motion: boolean) => void;
  castShadows: (on: boolean) => void;
};

type Node = { x: number; y: number; z: number; r: number };

function dist(a: Node, b: Node) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function latticeNodes(light: boolean): Node[][] {
  const ox = 3;
  const oz = -0.4;
  const layers: Array<Array<[number, number, number, number]>> = [
    [[-1.45, 1.05, 1.25, 0.2], [-0.4, 2.05, 1.25, 0.18], [0.55, 3.2, 1.2, 0.2], [1.5, 4.25, 1.15, 0.17], [1.25, 1.4, 1.35, 0.16]],
    [[-0.95, 1.4, 0.05, 0.19], [0.1, 2.55, 0.1, 0.2], [1.1, 3.75, 0.0, 0.18], [-0.15, 4.35, -0.05, 0.15]],
    [[-0.35, 1.65, -1.15, 0.18], [0.8, 2.9, -1.1, 0.2], [1.65, 4.05, -1.2, 0.17]],
    [[-0.1, 1.55, -2.25, 0.2], [0.95, 2.75, -2.2, 0.22], [1.9, 3.95, -2.3, 0.18]],
  ];
  return layers.map((layer, layerIndex) => {
    const nodes = layer
      .filter((_, index) => !(light && layerIndex === 2 && index === 1))
      .map(([x, y, z, r]) => ({ x: x + ox, y, z: z + oz, r }));
    return nodes;
  });
}

function linkNodes(layers: Node[][]) {
  const rods: Array<[Node, Node]> = [];
  const seen = new Set<string>();
  for (let i = 0; i < layers.length - 1; i++) {
    for (const a of layers[i]) {
      const next = [...layers[i + 1]].sort((p, q) => dist(a, p) - dist(a, q)).slice(0, 2);
      for (const b of next) {
        if (dist(a, b) > 3.4) continue;
        const ka = `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}`;
        const kb = `${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}`;
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rods.push([a, b]);
      }
    }
  }
  return rods;
}

function remember(mesh: THREE.InstancedMesh, index: number, order: number, idle: boolean, slots: Slot[]) {
  mesh.setMatrixAt(index, _object.matrix);
  slots.push({ mesh, index, matrix: _object.matrix.clone(), order, idle });
}

function placeSphere(mesh: THREE.InstancedMesh, index: number, node: Node, order: number, slots: Slot[]) {
  _object.position.set(node.x, node.y, node.z);
  _object.quaternion.identity();
  _object.scale.setScalar(node.r);
  _object.updateMatrix();
  remember(mesh, index, order, true, slots);
}

function placeRod(mesh: THREE.InstancedMesh, index: number, a: Node, b: Node, radius: number, order: number, slots: Slot[]) {
  _dir.set(b.x - a.x, b.y - a.y, b.z - a.z);
  const length = Math.max(0.001, _dir.length());
  _dir.multiplyScalar(1 / length);
  _quat.setFromUnitVectors(UP, _dir);
  _object.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  _object.quaternion.copy(_quat);
  _object.scale.set(radius, length, radius);
  _object.updateMatrix();
  remember(mesh, index, order, false, slots);
}

function placeBox(
  mesh: THREE.InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rotY = 0,
) {
  _object.position.set(x, y, z);
  _object.rotation.set(0, rotY, 0);
  _object.scale.set(sx, sy, sz);
  _object.updateMatrix();
  mesh.setMatrixAt(index, _object.matrix);
}

function contactPlane(texture: THREE.Texture, x: number, z: number, sx: number, sz: number) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.025, z);
  mesh.scale.set(sx, sz, 1);
  mesh.renderOrder = 2;
  mesh.name = "BLOCKOUT-contact";
  return mesh;
}

function lossTerrain(material: THREE.Material) {
  // Sits in front of the t=44 camera (z ≈ -19), so the lens is not inside the mesh.
  const width = 18;
  const depth = 11;
  const segX = 42;
  const segZ = 28;
  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ridge = Math.sin(x * 0.55) * 0.7 + Math.cos(z * 0.62) * 0.45;
    const mound = Math.exp(-(x * x) / 20 - ((z - 1.2) * (z - 1.2)) / 12) * 1.7;
    const edge = Math.min(1, Math.hypot(x / (width * 0.48), (z + depth * 0.5) / depth));
    const skirt = Math.min(1, Math.max(0, 1.15 - edge));
    pos.setY(i, Math.max(0.04, (0.16 + ridge + mound) * skirt));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(59.1, 0.03, -28.2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = "BLOCKOUT-loss";
  return mesh;
}

function solid(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, name: string) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}

export function buildBlockout(materials: Materials, light: boolean): Blockout {
  const group = new THREE.Group();
  group.name = "BLOCKOUT";
  group.userData.blockout = BLOCKOUT;
  const contact = new THREE.Group();
  contact.name = "BLOCKOUT-contact";
  const slots: Slot[] = [];

  const layers = latticeNodes(light);
  const flat = layers.flat();
  const rods = linkNodes(layers);
  const sphere = new THREE.SphereGeometry(1, light ? 12 : 20, light ? 8 : 14);
  const tube = new THREE.CylinderGeometry(1, 1, 1, light ? 6 : 8);
  const box = new THREE.BoxGeometry(1, 1, 1);

  const nodeMesh = new THREE.InstancedMesh(sphere, materials.clay, flat.length);
  nodeMesh.name = "BLOCKOUT-lattice-nodes";
  nodeMesh.castShadow = true;
  nodeMesh.receiveShadow = true;
  const rodMesh = new THREE.InstancedMesh(tube, materials.rods, rods.length);
  rodMesh.name = "BLOCKOUT-lattice-rods";
  rodMesh.castShadow = true;
  rodMesh.receiveShadow = true;

  flat.forEach((node, index) => {
    placeSphere(nodeMesh, index, node, index, slots);
    const tint = new THREE.Color().setScalar(index % 4 === 0 ? 0.84 : index % 3 === 0 ? 0.92 : 1);
    nodeMesh.setColorAt(index, tint);
  });
  rods.forEach(([a, b], index) => {
    placeRod(rodMesh, index, a, b, 0.034, flat.length + index, slots);
    rodMesh.setColorAt(index, new THREE.Color().setScalar(0.94 + (index % 3) * 0.02));
  });
  if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;
  if (rodMesh.instanceColor) rodMesh.instanceColor.needsUpdate = true;

  const beadGeo = new THREE.SphereGeometry(1, 12, 8);
  const beadCount = Math.min(4, rods.length);
  const beads = new THREE.InstancedMesh(beadGeo, materials.glaze, beadCount);
  beads.name = "BLOCKOUT-signal";
  beads.castShadow = true;
  beads.receiveShadow = true;
  for (let i = 0; i < beadCount; i++) {
    const [a, b] = rods[i * 2] ?? rods[i];
    placeSphere(beads, i, {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: (a.z + b.z) / 2,
      r: 0.075,
    }, flat.length + rods.length + i, slots);
  }

  group.add(nodeMesh, rodMesh, beads);
  contact.add(contactPlane(materials.contact, 3, -0.4, 7.2, 6.4));

  const belt = solid(box, materials.dark, 13.44, 0.56, -6.35, 14.2, 0.16, 1.25, "BLOCKOUT-conveyor");
  group.add(belt);
  const chipCount = light ? 5 : 8;
  const chips = new THREE.InstancedMesh(box, materials.clayDeep, chipCount);
  chips.name = "BLOCKOUT-conveyor-chips";
  chips.castShadow = true;
  chips.receiveShadow = true;
  for (let i = 0; i < chipCount; i++) {
    const x = 13.44 - 5.4 + i * (10.8 / Math.max(1, chipCount - 1));
    placeBox(chips, i, x, 0.78, -6.35, 0.7, 0.32, 0.86);
    chips.setColorAt(i, new THREE.Color().setScalar(i % 2 === 0 ? 0.9 : 1));
  }
  if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
  const glazeChip = solid(box, materials.glaze, 13.44, 0.8, -6.35, 0.78, 0.26, 0.9, "BLOCKOUT-conveyor-glaze");
  group.add(chips, glazeChip);
  contact.add(contactPlane(materials.contact, 13.44, -6.35, 15, 2.4));

  // Three-sided well, open toward the camera. The t=24 ray leaves through the
  // top before it hits the far wall, so the frame is a shaft and not a slab.
  const wallCount = 3;
  const walls = new THREE.InstancedMesh(box, materials.clay, wallCount);
  walls.name = "BLOCKOUT-shaft";
  walls.castShadow = true;
  walls.receiveShadow = true;
  placeBox(walls, 0, 15.2, 11, -31.6, 0.55, 22, 9.2);
  placeBox(walls, 1, 25.2, 11, -31.6, 0.55, 22, 9.2);
  placeBox(walls, 2, 20.2, 10, -36.2, 10.6, 20, 0.55);
  group.add(walls);
  const blockCount = light ? 3 : 5;
  const blocks = new THREE.InstancedMesh(box, materials.clayDeep, blockCount);
  blocks.name = "BLOCKOUT-shaft-blocks";
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  const blockYs = light ? [4.2, 10.5, 16.5] : [3.2, 7.2, 11.4, 15.6, 19.4];
  blockYs.forEach((y, index) => {
    placeBox(blocks, index, 16.6, y, -32.4, 1.15, 0.8, 1.15, index * 0.12);
    blocks.setColorAt(index, new THREE.Color().setScalar(index % 2 ? 0.9 : 1));
  });
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  group.add(blocks);
  contact.add(contactPlane(materials.contact, 20.2, -32.4, 12, 10));

  const outputs = new THREE.InstancedMesh(sphere, materials.glaze, 3);
  outputs.name = "BLOCKOUT-outputs";
  outputs.castShadow = true;
  outputs.receiveShadow = true;
  const spheres = [
    { x: 34.2, r: 1.25 },
    { x: 36.5, r: 1.72 },
    { x: 38.85, r: 1.08 },
  ];
  spheres.forEach((sphereNode, index) => {
    _object.position.set(sphereNode.x, sphereNode.r, -38.7);
    _object.quaternion.identity();
    _object.scale.setScalar(sphereNode.r);
    _object.updateMatrix();
    outputs.setMatrixAt(index, _object.matrix);
    contact.add(contactPlane(materials.contact, sphereNode.x, -38.7, sphereNode.r * 2.3, sphereNode.r * 2.3));
  });
  group.add(outputs);

  group.add(lossTerrain(materials.clay));
  contact.add(contactPlane(materials.contact, 59.1, -28.2, 12, 8));

  const pebbleCount = light ? 8 : 14;
  const pebbles = new THREE.InstancedMesh(sphere, materials.clay, pebbleCount);
  pebbles.name = "BLOCKOUT-pebbles";
  pebbles.castShadow = true;
  pebbles.receiveShadow = true;
  const glazePebbles = new THREE.InstancedMesh(beadGeo, materials.glaze, 3);
  glazePebbles.name = "BLOCKOUT-pebbles-glaze";
  glazePebbles.castShadow = true;
  glazePebbles.receiveShadow = true;
  for (let i = 0; i < pebbleCount; i++) {
    const x = 43.6 + ((i * 47) % 52) / 10;
    const z = -0.4 + ((i * 29) % 40) / 10;
    const r = 0.22 + (i % 5) * 0.08;
    _object.position.set(x, r * 0.55, z);
    _object.rotation.set(0, i, 0);
    _object.scale.set(r, r * 0.62, r * 0.9);
    _object.updateMatrix();
    pebbles.setMatrixAt(i, _object.matrix);
    pebbles.setColorAt(i, new THREE.Color().setScalar(i % 3 === 0 ? 0.8 : 1));
  }
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  const glazeSpots = [
    [46.1, 0.28, 1.6, 0.26],
    [44.5, 0.2, 2.5, 0.18],
    [47.8, 0.24, 0.4, 0.2],
  ];
  glazeSpots.forEach(([x, y, z, r], index) => {
    _object.position.set(x, y, z);
    _object.quaternion.identity();
    _object.scale.set(r * 1.3, r * 0.7, r);
    _object.updateMatrix();
    glazePebbles.setMatrixAt(index, _object.matrix);
  });
  group.add(pebbles, glazePebbles);
  contact.add(contactPlane(materials.contact, 46.2, 2.6, 8, 6));

  const book = new THREE.Group();
  book.name = "BLOCKOUT-book";
  book.add(solid(box, materials.dark, 45.6, 0.48, -1.35, 2.15, 0.96, 1.4, "BLOCKOUT-plinth"));
  book.add(solid(box, materials.clayDeep, 45.22, 1.42, -1.35, 0.16, 0.92, 1.15, "BLOCKOUT-cover"));
  book.add(solid(box, materials.clay, 45.98, 1.4, -1.35, 0.16, 0.88, 1.1, "BLOCKOUT-cover"));
  book.add(solid(box, materials.glaze, 45.6, 1.38, -1.35, 0.62, 0.74, 1.0, "BLOCKOUT-pages"));
  group.add(book);
  contact.add(contactPlane(materials.contact, 45.6, -1.45, 2.6, 2.2));

  for (const mesh of [nodeMesh, rodMesh, beads, chips, walls, blocks, outputs, pebbles, glazePebbles]) {
    mesh.computeBoundingSphere();
    mesh.frustumCulled = false;
  }
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.frustumCulled = false;
  });

  const orderCount = Math.max(1, slots.length);
  let progress = 0;
  const dirty = new Set<THREE.InstancedMesh>();

  function writeSlots(time: number, motion: boolean) {
    dirty.clear();
    for (const slot of slots) {
      const scale = Math.max(0.0008, assemblyScale(slot.order, orderCount, progress));
      _matrix.copy(slot.matrix);
      if (slot.idle && motion && progress > 0.98) {
        _matrix.elements[13] += Math.sin(time * 0.62 + slot.order * 0.37) * 0.015;
      }
      _scale.set(scale, scale, scale);
      _matrix.scale(_scale);
      slot.mesh.setMatrixAt(slot.index, _matrix);
      dirty.add(slot.mesh);
    }
    for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
    contact.visible = progress > 0.4;
  }

  writeSlots(0, false);

  return {
    group,
    contact,
    setAssembly(next) {
      progress = Math.min(1, Math.max(0, next));
      writeSlots(0, false);
    },
    setIdle(time, motion) {
      if (progress < 0.98) return;
      writeSlots(time, motion);
    },
    castShadows(on) {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = on;
          mesh.receiveShadow = on && mesh.name !== "BLOCKOUT-contact";
        }
      });
    },
  };
}
