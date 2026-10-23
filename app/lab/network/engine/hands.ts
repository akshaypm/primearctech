import * as THREE from "three";
import type { BeatId, CueName } from "./copy";
import { clampScreenPull, hopWeight, resolveStack, stepUnder, stepVec, vecSpring } from "./clay";

type Hit = { name: string; object: THREE.Object3D; point: THREE.Vector3 };
type CueOpts = { gain?: number };
type HandHooks = {
  dive: (id: string) => void;
  cue: (name: CueName, opts?: CueOpts) => void;
  loop?: (name: CueName, level: number, rate?: number) => void;
  stop?: (name: CueName) => void;
};

export type HandWorld = {
  camera: THREE.Camera;
  named: (test: (name: string) => boolean) => THREE.Object3D[];
  pick: (x: number, y: number, test?: (name: string) => boolean) => Hit | null;
  heightAt: (x: number, z: number) => number | null;
  basin: () => THREE.Vector3 | null;
  lossBounds: () => { minX: number; maxX: number; minZ: number; maxZ: number } | null;
  bendThreads: (point: THREE.Vector3 | null, reach: number) => void;
  screen: (prefix: string) => { name: string; x: number; y: number; box: { x0: number; y0: number; x1: number; y1: number } | null }[];
  attach: (object: THREE.Object3D) => void;
  groundPoint: (x: number, y: number) => THREE.Vector3 | null;
  rayPoint: (x: number, y: number, plane: THREE.Plane) => THREE.Vector3 | null;
};

export type HandFrame = { cursor: "default" | "grab" | "grabbing"; hint: string | null };

export type HandProof = {
  pull: number;
  bend: number;
  pulse: number;
  rod: number;
  squash: string[];
  spread: number;
  bead: { x: number; y: number } | null;
  beadOpacity: number;
  jobs: number;
  age: number;
  home: number;
  ball: { x: number; y: number; z: number; speed: number; basin: number; gap: number; radius: number; sx: number; sy: number } | null;
};

const PRODUCT: Record<string, string> = { ATTN_chain: "fieldrelay", ATTN_coil: "counter", ATTN_tile22: "roster" };
const PULL_FRAC = 0.22;
const ROD_FALLBACK = 0.028;
const PULSE_HOP = 0.5;
const PULSE_TRAVEL = 0.72;

function objectName(object: THREE.Object3D) {
  const named = object.userData.name;
  return (typeof named === "string" && named) || object.name || "";
}

type Body = {
  spring: ReturnType<typeof vecSpring>;
  goal: THREE.Vector3;
  release: boolean;
};

type EdgeMesh = {
  mesh: THREE.Mesh;
  rest: Float32Array;
  param: Float32Array | null;
  radius: number;
};

type EdgeRec = {
  from: string;
  to: string;
  meshes: EdgeMesh[];
  radius: number;
};

type PulseJob = { edge: EdgeRec; delay: number; u: number; hop: number };

type Ball = {
  obj: THREE.Object3D;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  spin: THREE.Quaternion;
  trail: { x: number; z: number; born: number }[];
  releaseAge: number;
  impact: number;
};

function edgeEnds(name: string) {
  const match = name.match(/^HERO_e(\d+)_(\d+)_(\d+)$/);
  if (!match) return null;
  const layer = Number(match[1]);
  return { from: `HERO_n${layer}_${match[2]}`, to: `HERO_n${layer + 1}_${match[3]}` };
}

function objectRadius(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  return 0.5 * Math.max(size.x, size.y, size.z);
}

function estimateRadius(rest: Float32Array) {
  const count = rest.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      const value = rest[i * 3 + k];
      if (value < min[k]) min[k] = value;
      if (value > max[k]) max[k] = value;
    }
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  let axis = 0;
  if (size[1] > size[axis]) axis = 1;
  if (size[2] > size[axis]) axis = 2;
  const a = (axis + 1) % 3;
  const b = (axis + 2) % 3;
  const lo = min[axis] + size[axis] * 0.42;
  const hi = min[axis] + size[axis] * 0.58;
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const value = rest[i * 3 + axis];
    if (value < lo || value > hi) continue;
    pts.push([rest[i * 3 + a], rest[i * 3 + b]]);
  }
  if (pts.length < 8) return ROD_FALLBACK;
  let mx = 0;
  let my = 0;
  for (const point of pts) {
    mx += point[0];
    my += point[1];
  }
  mx /= pts.length;
  my /= pts.length;
  const dists = pts.map((point) => Math.hypot(point[0] - mx, point[1] - my)).sort((p, q) => p - q);
  const median = dists[Math.floor(dists.length * 0.55)] || ROD_FALLBACK;
  return Math.min(0.05, Math.max(0.012, median));
}

export function createHands(world: HandWorld, hooks: HandHooks) {
  const bodies = new Map<THREE.Object3D, Body>();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const grabPoint = new THREE.Vector3();
  const spreadSpring = vecSpring();
  const spreadTarget = new THREE.Vector3();
  const parentQuat = new THREE.Quaternion();
  const pointer = { x: 0, y: 0, down: false, moved: false };
  const restPos = new Map<string, THREE.Vector3>();
  const nodeRadius = new Map<string, number>();
  let holding: THREE.Object3D | null = null;
  let holdName = "";
  let hover = "";
  let lastHover = "";
  let spreadGoal = 0;
  let stackBounce = 0;
  let layerDrag = false;
  let grabbedAt = false;
  let script: { kind: string; age: number } | null = null;
  let scriptNode = "";
  const fired = new Set<string>();
  const used = new Set<string>();
  let ball: Ball | null = null;
  let pit: THREE.Vector3 | null = null;
  const pitCam = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const sphereCenter = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const localUp = new THREE.Vector3();
  let dragLevel = 0;
  let stackApart = false;
  let clock = 0;
  let edges: EdgeRec[] | null = null;
  let neighbors = new Map<string, string[]>();
  let edgesDirty = false;
  let bendNow = 0;
  let rodNow = ROD_FALLBACK;
  const pulseJobs: PulseJob[] = [];
  const squash = new Map<string, number>();
  const beadGeo = new THREE.SphereGeometry(1, 14, 10);
  const beads: THREE.Mesh[] = [];
  for (let i = 0; i < 40; i += 1) {
    const bead = new THREE.Mesh(beadGeo, new THREE.MeshBasicMaterial({ color: 0xf3ede1, transparent: true, opacity: 1, depthWrite: false }));
    bead.name = "clay-bead";
    bead.visible = false;
    bead.frustumCulled = false;
    bead.renderOrder = 4;
    world.attach(bead);
    beads.push(bead);
  }
  const heightCache = new Map<string, number | null>();
  const proof: HandProof = { pull: 0, bend: 0, pulse: 0, rod: ROD_FALLBACK, squash: [], spread: 0, bead: null, beadOpacity: 0, jobs: 0, age: 0, home: 0, ball: null };

  function bodyOf(object: THREE.Object3D) {
    let item = bodies.get(object);
    if (!item) {
      item = { spring: vecSpring(), goal: new THREE.Vector3(), release: false };
      bodies.set(object, item);
    }
    return item;
  }

  function seen(beat: string) {
    if (used.has(beat)) return true;
    try {
      return window.sessionStorage.getItem(`network-drag-${beat}`) === "1";
    } catch {
      return false;
    }
  }

  function mark(beat: string) {
    used.add(beat);
    try {
      window.sessionStorage.setItem(`network-drag-${beat}`, "1");
    } catch {
      /* private mode */
    }
  }

  function signature(beat: BeatId) {
    return beat === "hero" || beat === "book" || beat === "layers" || beat === "loss";
  }

  function project(point: THREE.Vector3) {
    const p = point.clone().project(world.camera);
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height };
  }

  function toLocal(object: THREE.Object3D, delta: THREE.Vector3) {
    if (!object.parent) return delta.clone();
    object.parent.getWorldQuaternion(parentQuat);
    return delta.clone().applyQuaternion(parentQuat.clone().invert());
  }

  function putWorld(object: THREE.Object3D, point: THREE.Vector3) {
    object.position.copy(point);
    if (object.parent) object.parent.worldToLocal(object.position);
    object.updateMatrixWorld(true);
  }

  function snapshotHero() {
    restPos.clear();
    for (const node of world.named((name) => name.startsWith("HERO_n"))) {
      const at = new THREE.Vector3();
      node.updateWorldMatrix(true, false);
      node.getWorldPosition(at);
      restPos.set(objectName(node), at);
      if (!nodeRadius.has(objectName(node))) nodeRadius.set(objectName(node), objectRadius(node));
    }
  }

  function ensureEdges() {
    if (edges) return edges;
    const built: EdgeRec[] = [];
    const links = new Map<string, string[]>();
    const link = (a: string, b: string) => {
      const list = links.get(a) || [];
      if (!list.includes(b)) list.push(b);
      links.set(a, list);
    };
    for (const object of world.named((name) => name.startsWith("HERO_e"))) {
      const ends = edgeEnds(objectName(object));
      if (!ends) continue;
      const meshes: EdgeMesh[] = [];
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const attr = mesh.geometry?.getAttribute("position");
        if (!attr) return;
        const rest = new Float32Array(attr.count * 3);
        for (let i = 0; i < attr.count; i += 1) {
          rest[i * 3] = attr.getX(i);
          rest[i * 3 + 1] = attr.getY(i);
          rest[i * 3 + 2] = attr.getZ(i);
        }
        const radius = estimateRadius(rest);
        meshes.push({ mesh, rest, param: null, radius });
      });
      if (!meshes.length) continue;
      const radius = meshes.reduce((sum, mesh) => sum + mesh.radius, 0) / meshes.length;
      built.push({ from: ends.from, to: ends.to, meshes, radius });
      link(ends.from, ends.to);
      link(ends.to, ends.from);
    }
    edges = built;
    neighbors = links;
    if (built.length) rodNow = built.reduce((sum, edge) => sum + edge.radius, 0) / built.length;
    proof.rod = rodNow;
    return built;
  }

  function hopsFrom(origin: string) {
    const dist = new Map<string, number>([[origin, 0]]);
    const queue = [origin];
    while (queue.length) {
      const name = queue.shift();
      if (!name) break;
      const hop = dist.get(name) ?? 0;
      if (hop >= 2) continue;
      for (const next of neighbors.get(name) || []) {
        if (dist.has(next)) continue;
        dist.set(next, hop + 1);
        queue.push(next);
      }
    }
    return dist;
  }

  function pullDelta(object: THREE.Object3D) {
    const rest = restPos.get(objectName(object));
    if (!rest) return aim.set(0, 0, 0);
    world.camera.getWorldDirection(normal);
    plane.setFromNormalAndCoplanarPoint(normal, rest);
    const hit = world.rayPoint(pointer.x, pointer.y, plane);
    if (!hit) return aim.set(0, 0, 0);
    const delta = hit.clone().sub(grabPoint);
    const from = project(rest);
    const to = project(rest.clone().add(delta));
    const clamped = clampScreenPull(to.x - from.x, to.y - from.y, window.innerHeight || 1, PULL_FRAC);
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    proof.pull = clamped.frac;
    if (span > 1e-3) delta.multiplyScalar(Math.hypot(clamped.x, clamped.y) / span);
    return delta;
  }

  function metresPerPixel(object: THREE.Object3D) {
    const at = new THREE.Vector3();
    object.getWorldPosition(at);
    const up = at.clone();
    up.y += 1;
    const a = project(at);
    const b = project(up);
    const px = Math.max(8, Math.abs(b.y - a.y));
    return 1 / px;
  }

  function applyBodies(dt: number, reduced: boolean) {
    let home = 0;
    for (const [object, item] of bodies) {
      const heroNode = objectName(object).startsWith("HERO_n");
      if (object === holding && pointer.down) {
        item.spring.offset.copy(item.goal);
        item.spring.vel.set(0, 0, 0);
      } else if (item.release) {
        stepUnder(item.spring, item.goal, 9, 0.52, dt, reduced);
        if (item.spring.offset.length() < 0.012 && item.spring.vel.length() < 0.05) item.release = false;
      } else {
        stepVec(item.spring, item.goal, heroNode ? 16 : 14, dt, reduced);
      }
      if (heroNode) home = Math.max(home, item.spring.offset.length());
      const local = toLocal(object, item.spring.offset);
      object.position.add(local);
      object.updateMatrixWorld(true);
      if (object !== holding && !item.release && item.spring.offset.lengthSq() < 1e-6) item.goal.set(0, 0, 0);
    }
    proof.home = home;
  }

  function warpEdges(list: EdgeRec[]) {
    bendNow = 0;
    let active = false;
    const inv = new THREE.Matrix4();
    const worldPoint = new THREE.Vector3();
    const local = new THREE.Vector3();
    const bow = new THREE.Vector3();
    const chord = new THREE.Vector3();
    for (const edge of list) {
      const from = restPos.get(edge.from);
      const to = restPos.get(edge.to);
      const fromNow = world.named((name) => name === edge.from)[0];
      const toNow = world.named((name) => name === edge.to)[0];
      if (!from || !to || !fromNow || !toNow) continue;
      const aNow = new THREE.Vector3();
      const bNow = new THREE.Vector3();
      fromNow.getWorldPosition(aNow);
      toNow.getWorldPosition(bNow);
      const dispA = aNow.clone().sub(from);
      const dispB = bNow.clone().sub(to);
      if (dispA.lengthSq() < 1e-6 && dispB.lengthSq() < 1e-6) {
        if (!edgesDirty) continue;
        for (const part of edge.meshes) {
          const attr = part.mesh.geometry.getAttribute("position");
          for (let i = 0; i < attr.count; i += 1) {
            attr.setXYZ(i, part.rest[i * 3], part.rest[i * 3 + 1], part.rest[i * 3 + 2]);
          }
          attr.needsUpdate = true;
        }
        continue;
      }
      active = true;
      chord.copy(bNow).sub(aNow);
      bow.copy(dispA).sub(dispB);
      const chordLen = chord.length() || 1;
      const along = bow.dot(chord) / (chordLen * chordLen);
      bow.addScaledVector(chord, -along);
      const cap = chordLen * 0.45;
      if (bow.length() > cap) bow.setLength(cap);
      if (bow.length() > bendNow) bendNow = bow.length();
      for (const part of edge.meshes) {
        const attr = part.mesh.geometry.getAttribute("position");
        part.mesh.updateWorldMatrix(true, false);
        inv.copy(part.mesh.matrixWorld).invert();
        if (!part.param) {
          part.param = new Float32Array(attr.count);
          const span = Math.max(1e-4, to.clone().sub(from).lengthSq());
          const ab = to.clone().sub(from);
          for (let i = 0; i < attr.count; i += 1) {
            worldPoint.set(part.rest[i * 3], part.rest[i * 3 + 1], part.rest[i * 3 + 2]).applyMatrix4(part.mesh.matrixWorld);
            const t = THREE.MathUtils.clamp(worldPoint.clone().sub(from).dot(ab) / span, 0, 1);
            part.param[i] = t;
          }
        }
        for (let i = 0; i < attr.count; i += 1) {
          const t = part.param[i];
          worldPoint.set(part.rest[i * 3], part.rest[i * 3 + 1], part.rest[i * 3 + 2]).applyMatrix4(part.mesh.matrixWorld);
          worldPoint.addScaledVector(dispA, 1 - t);
          worldPoint.addScaledVector(dispB, t);
          worldPoint.addScaledVector(bow, Math.sin(Math.PI * t));
          local.copy(worldPoint).applyMatrix4(inv);
          attr.setXYZ(i, local.x, local.y, local.z);
        }
        attr.needsUpdate = true;
      }
    }
    edgesDirty = active;
    proof.bend = bendNow;
  }

  function sampleEdge(edge: EdgeRec, tFind: number) {
    const cam = new THREE.Vector3();
    world.camera.getWorldPosition(cam);
    const near: THREE.Vector3[] = [];
    const worldPoint = new THREE.Vector3();
    for (const part of edge.meshes) {
      if (!part.param) continue;
      const attr = part.mesh.geometry.getAttribute("position");
      part.mesh.updateWorldMatrix(true, false);
      const step = Math.max(1, Math.floor(attr.count / 220));
      for (let i = 0; i < attr.count; i += step) {
        if (Math.abs(part.param[i] - tFind) > 0.045) continue;
        worldPoint.fromBufferAttribute(attr, i).applyMatrix4(part.mesh.matrixWorld);
        near.push(worldPoint.clone());
      }
    }
    if (!near.length) return null;
    const center = new THREE.Vector3();
    for (const point of near) center.add(point);
    center.multiplyScalar(1 / near.length);
    let facing = near[0];
    let best = -Infinity;
    const toCam = cam.sub(center);
    for (const point of near) {
      const score = point.dot(toCam);
      if (score <= best) continue;
      best = score;
      facing = point;
    }
    return { center, facing };
  }

  function startPulse(origin: string) {
    pulseJobs.length = 0;
    const list = ensureEdges();
    const dist = new Map<string, number>([[origin, 0]]);
    const queue = [origin];
    while (queue.length) {
      const name = queue.shift();
      if (!name) break;
      const hop = dist.get(name) ?? 0;
      for (const edge of list) {
        if (edge.from !== name) continue;
        if (!dist.has(edge.to)) {
          dist.set(edge.to, hop + 1);
          queue.push(edge.to);
        }
        pulseJobs.push({ edge, delay: hop * PULSE_HOP, u: 0, hop });
      }
    }
    hooks.cue("pulse");
  }

  function fadeBead(bead: THREE.Mesh, opacity: number) {
    const material = bead.material as THREE.MeshBasicMaterial;
    material.opacity = opacity;
  }

  function stepPulse(dt: number, reduced: boolean) {
    let live = 0;
    let maxAge = 0;
    let shown: THREE.Mesh | null = null;
    let shownHop = -1;
    for (let i = 0; i < beads.length; i += 1) beads[i].visible = false;
    if (reduced) {
      pulseJobs.length = 0;
      proof.pulse = 0;
      proof.age = 0;
      proof.bead = null;
      proof.beadOpacity = 0;
      return;
    }
    let slot = 0;
    let peakOpacity = 0;
    for (const job of pulseJobs) {
      job.u += dt / PULSE_TRAVEL;
      const age = job.u * PULSE_TRAVEL;
      if (age > maxAge) maxAge = age;
      if (age < job.delay) continue;
      const u = THREE.MathUtils.clamp((age - job.delay) / PULSE_TRAVEL, 0, 1);
      const output = job.edge.to.startsWith("HERO_n3");
      if (u >= 1 && output && !squash.has(job.edge.to)) squash.set(job.edge.to, 0.28);
      if (u >= 1) continue;
      const opacity = output ? 1 - THREE.MathUtils.smoothstep(u, 0.62, 0.98) : u < 0.9 ? 1 : 1 - (u - 0.9) / 0.1;
      if (opacity < 0.04) continue;
      const from = world.named((name) => name === job.edge.from)[0];
      const to = world.named((name) => name === job.edge.to)[0];
      if (!from || !to) continue;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      from.getWorldPosition(a);
      to.getWorldPosition(b);
      const len = Math.max(0.2, a.distanceTo(b));
      const beadR = 2.5 * (job.edge.radius || rodNow);
      const t0 = Math.min(0.4, ((nodeRadius.get(job.edge.from) || 0.11) + beadR) / len);
      const t1 = 1 - Math.min(0.45, ((nodeRadius.get(job.edge.to) || 0.11) + beadR) / len);
      const along = t0 + Math.max(0.02, t1 - t0) * u;
      const sample = sampleEdge(job.edge, along);
      const outward = new THREE.Vector3();
      let center: THREE.Vector3;
      if (sample) {
        outward.copy(sample.facing).sub(sample.center);
        if (outward.lengthSq() < 1e-8) outward.set(0, 1, 0);
        outward.normalize();
        center = sample.facing.clone().addScaledVector(outward, beadR);
      } else {
        center = a.clone().lerp(b, along);
      }
      const bead = beads[slot];
      slot += 1;
      if (!bead) continue;
      putWorld(bead, center);
      bead.scale.setScalar(beadR);
      fadeBead(bead, opacity);
      bead.visible = true;
      if (opacity > peakOpacity) peakOpacity = opacity;
      live += 1;
      if (job.hop >= shownHop) {
        shown = bead;
        shownHop = job.hop;
      }
    }
    for (const [name, left] of [...squash]) {
      const node = world.named((entry) => entry === name)[0];
      const k = Math.sin(Math.min(1, left / 0.28) * Math.PI) * 0.16;
      if (node && k > 0) {
        node.scale.y *= 1 - k;
        node.scale.x *= 1 + k * 0.55;
        node.scale.z *= 1 + k * 0.55;
        node.updateMatrixWorld(true);
      }
      const next = left - dt;
      if (next <= 0) squash.delete(name);
      else squash.set(name, next);
    }
    proof.jobs = pulseJobs.length;
    proof.pulse = live;
    proof.age = maxAge;
    proof.squash = [...squash.keys()];
    if (shown) {
      const at = new THREE.Vector3();
      shown.getWorldPosition(at);
      const screen = project(at);
      proof.bead = { x: Math.round(screen.x), y: Math.round(screen.y) };
    } else proof.bead = null;
    proof.beadOpacity = Number(peakOpacity.toFixed(3));
  }

  function driveHero(dt: number, reduced: boolean) {
    snapshotHero();
    ensureEdges();
    let delta: THREE.Vector3 | null = null;
    let leader = "";
    if (holding && pointer.down && holdName.startsWith("HERO_n")) {
      delta = pullDelta(holding);
      leader = holdName;
    } else if (script?.kind === "hero" && scriptNode) {
      const u = Math.sin(Math.min(1, script.age / 0.8) * Math.PI);
      const node = world.named((name) => name === scriptNode)[0];
      const metres = node ? metresPerPixel(node) * (window.innerHeight || 1) * PULL_FRAC : 0.6;
      delta = new THREE.Vector3(metres * u, metres * 0.35 * u, 0);
      leader = scriptNode;
      proof.pull = u * PULL_FRAC;
      if (script.age > 0.82 && !fired.has("pulse")) {
        fired.add("pulse");
        startPulse(scriptNode);
        for (const [object, item] of bodies) {
          if (!objectName(object).startsWith("HERO_n")) continue;
          item.goal.set(0, 0, 0);
          item.release = true;
        }
      }
    }
    if (delta && leader) {
      const falloff = hopsFrom(leader);
      for (const [name, hop] of falloff) {
        const node = world.named((entry) => entry === name)[0];
        if (!node) continue;
        const item = bodyOf(node);
        item.goal.copy(delta).multiplyScalar(hopWeight(hop));
        item.release = false;
        if (hop === 0) holding = pointer.down ? holding : node;
      }
      for (const node of world.named((name) => name.startsWith("HERO_n"))) {
        if (falloff.has(objectName(node))) continue;
        const item = bodyOf(node);
        if (!item.release) item.goal.set(0, 0, 0);
      }
    }
    applyBodies(dt, reduced);
    warpEdges(ensureEdges());
    stepPulse(dt, reduced);
  }

  function driveStack(dt: number, reduced: boolean) {
    spreadTarget.set(spreadGoal, 0, 0);
    stepUnder(spreadSpring, spreadTarget, 9, 0.55, dt, reduced);
    const spread = Math.max(0, spreadSpring.offset.x);
    const groups = new Map<number, THREE.Object3D[]>();
    for (const block of world.named((name) => /^LAYERS_blk\d+_(box|lid)/.test(name))) {
      const match = objectName(block).match(/LAYERS_blk(\d+)/);
      if (!match) continue;
      const index = Number(match[1]);
      const list = groups.get(index) || [];
      list.push(block);
      groups.set(index, list);
    }
    const indices = [...groups.keys()].sort((a, b) => a - b);
    const top: number[] = [];
    const bottom: number[] = [];
    const off = indices.map((index) => spread * index * 0.75);
    const vel = indices.map((index) => spreadSpring.vel.x * index * 0.75);
    for (const index of indices) {
      const box = new THREE.Box3();
      for (const part of groups.get(index) || []) {
        if (!objectName(part).endsWith("_box")) continue;
        box.expandByObject(part);
      }
      top.push(box.max.y);
      bottom.push(box.min.y);
    }
    const resolved = indices.length > 1 ? resolveStack(off, top, bottom, vel) : { off, vel };
    const pushed = resolved.off.some((value, index) => value > off[index] + 0.001);
    stackBounce = pushed ? Math.max(stackBounce, 0.06) : Math.max(0, stackBounce - dt * 0.35);
    indices.forEach((index, i) => {
      const extra = resolved.off[i] + (i > 0 ? stackBounce : 0);
      const parts = groups.get(index) || [];
      for (const part of parts) part.position.y += extra;
      const allowed = clearOfCamera(parts, extra);
      if (allowed < extra - 1e-4) {
        const back = extra - allowed;
        for (const part of parts) part.position.y -= back;
      }
    });
    proof.spread = resolved.off[resolved.off.length - 1] || 0;
  }

  function cameraNear() {
    const cam = world.camera as THREE.PerspectiveCamera;
    return typeof cam.near === "number" ? cam.near : 0.05;
  }

  function clearOfCamera(parts: THREE.Object3D[], extra: number) {
    if (extra <= 0) return extra;
    const clearance = cameraNear() + 0.22;
    world.camera.getWorldPosition(camPos);
    let keep = extra;
    for (const part of parts) {
      part.updateMatrixWorld(true);
      part.getWorldQuaternion(worldQuat);
      localUp.set(0, 1, 0).applyQuaternion(worldQuat);
      part.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
        const sphere = mesh.geometry.boundingSphere;
        if (!sphere) return;
        sphereCenter.copy(sphere.center).applyMatrix4(mesh.matrixWorld);
        const radius = sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis();
        const dist = sphereCenter.distanceTo(camPos);
        const gap = dist - radius - clearance;
        if (gap >= 0) return;
        const toward = camPos.clone().sub(sphereCenter).dot(localUp);
        if (toward <= 0.02) return;
        const deriv = toward / Math.max(dist, 1e-3);
        if (deriv < 0.08) return;
        keep = Math.min(keep, Math.max(0, extra + gap / deriv - 0.01));
      });
    }
    return keep;
  }

  function cachedHeight(x: number, z: number) {
    const key = `${Math.round(x * 8)}:${Math.round(z * 8)}`;
    const cached = heightCache.get(key);
    if (cached !== undefined) return cached;
    const y = world.heightAt(x, z);
    heightCache.set(key, y);
    return y;
  }

  function support(x: number, z: number) {
    const h = world.heightAt(x, z);
    if (h === null) return null;
    const e = 0.22;
    const hx = world.heightAt(x + e, z);
    const hnx = world.heightAt(x - e, z);
    const hz = world.heightAt(x, z + e);
    const hnz = world.heightAt(x, z - e);
    const dx = hx !== null && hnx !== null ? (hx - hnx) / (2 * e) : 0;
    const dz = hz !== null && hnz !== null ? (hz - hnz) / (2 * e) : 0;
    const n = new THREE.Vector3(-dx, 1, -dz).normalize();
    return { h, n };
  }

  function clampLandscape(x: number, z: number, vx: number, vz: number, radius: number) {
    const bounds = world.lossBounds();
    if (!bounds) return { x, z, vx, vz };
    const inset = radius + 0.08;
    let nx = x;
    let nz = z;
    let nvx = vx;
    let nvz = vz;
    if (nx < bounds.minX + inset) {
      nx = bounds.minX + inset;
      nvx = Math.abs(nvx) * 0.25;
    } else if (nx > bounds.maxX - inset) {
      nx = bounds.maxX - inset;
      nvx = -Math.abs(nvx) * 0.25;
    }
    if (nz < bounds.minZ + inset) {
      nz = bounds.minZ + inset;
      nvz = Math.abs(nvz) * 0.25;
    } else if (nz > bounds.maxZ - inset) {
      nz = bounds.maxZ - inset;
      nvz = -Math.abs(nvz) * 0.25;
    }
    return { x: nx, z: nz, vx: nvx, vz: nvz };
  }

  function groundBeads() {
    const beadsOn = world.named((name) => /^LOSS_bead\d+$/.test(name));
    const trail = ball?.trail.filter((dot) => clock - dot.born < 2) || [];
    beadsOn.forEach((bead, index) => {
      if (trail.length) {
        const dot = trail[Math.min(trail.length - 1, Math.floor((index / Math.max(1, beadsOn.length - 1)) * (trail.length - 1)))];
        const h = cachedHeight(dot.x, dot.z);
        if (h === null) {
          bead.visible = false;
          return;
        }
        const age = (clock - dot.born) / 2;
        putWorld(bead, new THREE.Vector3(dot.x, h + 0.02, dot.z));
        const scale = Math.max(0, 1 - age);
        bead.scale.setScalar(scale);
        bead.visible = scale > 0.04;
        return;
      }
      const at = new THREE.Vector3();
      bead.getWorldPosition(at);
      const h = cachedHeight(at.x, at.z);
      if (h === null) return;
      putWorld(bead, new THREE.Vector3(at.x, h + 0.02, at.z));
      bead.scale.setScalar(1);
      bead.visible = true;
    });
  }

  function inBand(x: number, y: number, z: number, x0: number, x1: number, y0: number, y1: number) {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    const ndc = new THREE.Vector3(x, y, z).project(world.camera);
    if (ndc.z < -1 || ndc.z > 1) return false;
    const sx = (ndc.x * 0.5 + 0.5) * width;
    const sy = (-ndc.y * 0.5 + 0.5) * height;
    return sx / width >= x0 && sx / width <= x1 && sy / height >= y0 && sy / height <= y1;
  }

  function pitPoint() {
    world.camera.getWorldPosition(camPos);
    if (pit && pitCam.distanceTo(camPos) > 0.25) pit = null;
    if (pit) return pit;
    const bounds = world.lossBounds();
    if (!bounds) return world.basin();
    const framed = (x: number, y: number, z: number) => inBand(x, y, z, 0.28, 0.72, 0.48, 0.78);
    let bestX = 0;
    let bestZ = 0;
    let bestY = Infinity;
    const columns = 16;
    const rows = 10;
    for (let i = 0; i <= columns; i += 1) {
      for (let j = 0; j <= rows; j += 1) {
        const x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, i / columns);
        const z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, j / rows);
        const h = world.heightAt(x, z);
        if (h === null || h >= bestY || !framed(x, h, z)) continue;
        bestY = h;
        bestX = x;
        bestZ = z;
      }
    }
    if (bestY === Infinity) return world.basin();
    for (let i = -3; i <= 3; i += 1) {
      for (let j = -3; j <= 3; j += 1) {
        const x = bestX + i * 0.35;
        const z = bestZ + j * 0.35;
        const h = world.heightAt(x, z);
        if (h === null || h >= bestY || !framed(x, h, z)) continue;
        bestY = h;
        bestX = x;
        bestZ = z;
      }
    }
    pit = new THREE.Vector3(bestX, bestY, bestZ);
    pitCam.copy(camPos);
    return pit;
  }

  function driveLoss(dt: number, reduced: boolean) {
    groundBeads();
    if (!ball) return;
    const dragging = holding === ball.obj && pointer.down;
    const step = Math.min(Math.max(dt, 0.001), 0.05);
    if (dragging) {
      ball.releaseAge = 0;
      hooks.loop?.("roll-loop", 0);
      const hit = world.groundPoint(pointer.x, pointer.y);
      let nx = ball.x;
      let nz = ball.z;
      let vx = ball.vx;
      let vz = ball.vz;
      const near = hit ? Math.hypot(hit.x - ball.x, hit.z - ball.z) : Infinity;
      if (hit && near > 0.01 && near < 4) {
        const move = Math.min(near, 0.55);
        nx = ball.x + ((hit.x - ball.x) / near) * move;
        nz = ball.z + ((hit.z - ball.z) / near) * move;
        vx = (nx - ball.x) / step;
        vz = (nz - ball.z) / step;
      }
      const clamped = clampLandscape(nx, nz, vx, vz, ball.radius);
      ball.vx = clamped.vx;
      ball.vz = clamped.vz;
      ball.x = clamped.x;
      ball.z = clamped.z;
    } else if (!reduced) {
      ball.releaseAge += step;
      const slope = support(ball.x, ball.z);
      const g = 9.8;
      const age = ball.releaseAge;
      const braking = age < 1 ? 0.4 : 0.4 + (age - 1) * 2.2;
      if (slope && age < 1.8) {
        const push = Math.max(0, 1 - age / 1.8);
        ball.vx += g * slope.n.x * slope.n.y * step * push;
        ball.vz += g * slope.n.z * slope.n.y * step * push;
      }
      const low = pitPoint();
      let pitDist = Infinity;
      if (low) {
        const dx = low.x - ball.x;
        const dz = low.z - ball.z;
        pitDist = Math.hypot(dx, dz);
        const here = world.heightAt(ball.x, ball.z);
        const higher = here !== null && here > low.y + 0.02;
        if (age < 2.2 && pitDist > 0.5 && higher) {
          ball.vx += (dx / pitDist) * 2.6 * step;
          ball.vz += (dz / pitDist) * 2.6 * step;
        }
      }
      ball.vx *= Math.exp(-braking * step);
      ball.vz *= Math.exp(-braking * step);
      if (pitDist < 0.45 || age > 2.4) {
        const kill = Math.exp(-7 * step);
        ball.vx *= kill;
        ball.vz *= kill;
      }
      if (Math.hypot(ball.vx, ball.vz) < 0.05 && (pitDist < 0.55 || age > 2.45)) {
        ball.vx = 0;
        ball.vz = 0;
      }
      const capped = Math.hypot(ball.vx, ball.vz);
      if (capped > 4.2) {
        ball.vx *= 4.2 / capped;
        ball.vz *= 4.2 / capped;
      }
      ball.x += ball.vx * step;
      ball.z += ball.vz * step;
      const limited = clampLandscape(ball.x, ball.z, ball.vx, ball.vz, ball.radius);
      ball.x = limited.x;
      ball.z = limited.z;
      ball.vx = limited.vx;
      ball.vz = limited.vz;
      const lowNow = pitPoint();
      if (lowNow) {
        const lifted = world.heightAt(ball.x, ball.z);
        const ndc = new THREE.Vector3(ball.x, lifted ?? lowNow.y, ball.z).project(world.camera);
        const width = window.innerWidth || 1;
        const height = window.innerHeight || 1;
        const sx = (ndc.x * 0.5 + 0.5) * width;
        const sy = (-ndc.y * 0.5 + 0.5) * height;
        const inside = ndc.z >= -1 && ndc.z <= 1 && sx / width >= 0.28 && sx / width <= 0.72 && sy / height >= 0.48 && sy / height <= 0.78;
        if (!inside) {
          const dx = lowNow.x - ball.x;
          const dz = lowNow.z - ball.z;
          const dist = Math.hypot(dx, dz) || 1;
          const stepBack = Math.min(0.12, dist);
          ball.x += (dx / dist) * stepBack;
          ball.z += (dz / dist) * stepBack;
          if (Math.hypot(ball.vx, ball.vz) > 0.2) {
            ball.vx *= 0.82;
            ball.vz *= 0.82;
          }
        }
      }
      const rolling = Math.hypot(ball.vx, ball.vz);
      if (rolling > ball.impact) ball.impact = rolling;
      if (ball.impact > 0.45 && rolling < 0.06) {
        hooks.cue("tock", { gain: Math.min(1, ball.impact / 2.4) });
        ball.impact = 0;
      }
      const rate = 0.9 + 0.2 * Math.min(1, rolling / 2.8);
      hooks.loop?.("roll-loop", reduced ? 0 : Math.min(1, rolling / 1.8), rate);
      if (rolling > 0.05 && slope) {
        const vel = new THREE.Vector3(ball.vx, 0, ball.vz);
        const axis = new THREE.Vector3().crossVectors(slope.n, vel);
        if (axis.lengthSq() > 1e-6) {
          axis.normalize();
          ball.spin.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, (rolling / ball.radius) * step));
        }
      }
    }
    const placed = support(ball.x, ball.z);
    const h = placed ? placed.h : world.heightAt(ball.x, ball.z);
    const n = placed?.n || new THREE.Vector3(0, 1, 0);
    const y = (h === null ? 0 : h) + n.y * ball.radius;
    putWorld(ball.obj, new THREE.Vector3(ball.x + n.x * ball.radius, y, ball.z + n.z * ball.radius));
    ball.obj.quaternion.premultiply(ball.spin);
    ball.obj.scale.set(1, 1, 1);
    ball.obj.updateMatrixWorld(true);
    ball.trail.push({ x: ball.x, z: ball.z, born: clock });
    if (ball.trail.length > 48) ball.trail.shift();
    const low = pitPoint();
    const gap = h === null ? 0 : y - (h + n.y * ball.radius);
    const shown = new THREE.Vector3();
    ball.obj.getWorldPosition(shown);
    const screen = project(shown);
    proof.ball = {
      x: Number(ball.x.toFixed(3)),
      y: Number(y.toFixed(3)),
      z: Number(ball.z.toFixed(3)),
      speed: Number(Math.hypot(ball.vx, ball.vz).toFixed(3)),
      basin: low ? Number(Math.hypot(low.x - ball.x, low.z - ball.z).toFixed(3)) : -1,
      gap: Number(gap.toFixed(4)),
      radius: Number(ball.radius.toFixed(3)),
      sx: Math.round(screen.x),
      sy: Math.round(screen.y),
    };
    groundBeads();
  }

  function driveHover(beat: BeatId) {
    if (beat === "attention") {
      const threads = world.named((name) => name.startsWith("ATTN_th"));
      const anchor = threads[0];
      let point: THREE.Vector3 | null = null;
      if (anchor && (pointer.x !== 0 || pointer.y !== 0)) {
        world.camera.getWorldDirection(normal);
        anchor.getWorldPosition(aim);
        plane.setFromNormalAndCoplanarPoint(normal, aim);
        point = world.rayPoint(pointer.x, pointer.y, plane);
      }
      world.bendThreads(point, point ? 1.3 : 0);
      return;
    }
    if (beat === "input") {
      const sheets = world.screen("INPUT_fg");
      let hot = "";
      let area = Infinity;
      for (const item of sheets) {
        const box = item.box;
        if (!box || pointer.x < box.x0 || pointer.x > box.x1 || pointer.y < box.y0 || pointer.y > box.y1) continue;
        const next = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
        if (next < area) {
          area = next;
          hot = item.name;
        }
      }
      for (const sheet of world.named((name) => name.startsWith("INPUT_fg"))) {
        const item = bodyOf(sheet);
        item.release = false;
        if (objectName(sheet) === hot) item.goal.copy(toLocal(sheet, new THREE.Vector3(0, 0.06, 0)));
        else if (item.spring.offset.lengthSq() < 1e-5) item.goal.set(0, 0, 0);
      }
      return;
    }
    if (beat === "embedding") {
      world.camera.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(world.camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(world.camera.matrixWorld, 1);
      for (const spot of world.screen("EMB_peb")) {
        const pebble = world.named((name) => name === spot.name)[0];
        if (!pebble) continue;
        const item = bodyOf(pebble);
        item.release = false;
        const dx = (spot.box ? (spot.box.x0 + spot.box.x1) / 2 : spot.x) - pointer.x;
        const dy = (spot.box ? (spot.box.y0 + spot.box.y1) / 2 : spot.y) - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 90 || dist < 1) {
          if (item.spring.offset.lengthSq() < 1e-5) item.goal.set(0, 0, 0);
          continue;
        }
        const mag = 0.05 * (1 - dist / 90);
        const goal = right.clone().multiplyScalar((dx / dist) * mag).addScaledVector(up, (-dy / dist) * mag);
        item.goal.copy(toLocal(pebble, goal));
      }
    }
  }

  function releaseHero() {
    if (!holdName.startsWith("HERO_n")) return;
    for (const [object, item] of bodies) {
      if (!objectName(object).startsWith("HERO_n")) continue;
      item.goal.set(0, 0, 0);
      item.release = true;
    }
    startPulse(holdName);
  }

  return {
    proof: () => proof,
    step(dt: number, beat: BeatId, reduced: boolean): HandFrame {
      clock += dt;
      if (script) {
        script.age += dt;
        if (script.kind === "layers") spreadGoal = Math.sin(Math.min(1, script.age / 0.9) * Math.PI);
        if (script.kind === "loss" && !ball) {
          const node = world.named((name) => name === "LOSS_ball")[0];
          if (node) {
            const at = new THREE.Vector3();
            node.getWorldPosition(at);
            ball = { obj: node, x: at.x, z: at.z, vx: 2.2, vz: 0.4, radius: objectRadius(node) || 0.17, spin: new THREE.Quaternion(), trail: [{ x: at.x, z: at.z, born: clock }], releaseAge: 0, impact: 0 };
          }
        }
        if (script.age > 1.6 && script.kind !== "hero") script = null;
      }
      const heroBeat = beat === "hero" || beat === "book";
      if (heroBeat) driveHero(dt, reduced);
      else applyBodies(dt, reduced);
      if (beat === "layers" || script?.kind === "layers") driveStack(dt, reduced);
      if (beat === "loss" || ball) driveLoss(dt, reduced);
      if (!pointer.down) driveHover(beat);
      const moved = pointer.moved;
      if (pointer.down || moved) {
        const hit = world.pick(pointer.x, pointer.y, (name) => {
          if (heroBeat) return name.startsWith("HERO_n");
          if (beat === "layers") return name.startsWith("LAYERS_blk");
          if (beat === "loss") return name === "LOSS_ball";
          if (beat === "attention") return name in PRODUCT;
          return false;
        });
        hover = hit ? hit.name : "";
        if (hover && hover !== lastHover) hooks.cue("hover");
        lastHover = hover;
        pointer.moved = false;
      }
      const draggingNow = pointer.down && (holding !== null || layerDrag);
      if (draggingNow && !reduced) hooks.loop?.("drag-loop", Math.min(1, dragLevel));
      else hooks.stop?.("drag-loop");
      dragLevel *= 0.82;
      return {
        cursor: holding && pointer.down ? "grabbing" : hover && signature(beat) ? "grab" : "default",
        hint: seen(beat) || !signature(beat) ? null : "drag",
      };
    },
    down(x: number, y: number, beat: BeatId) {
      pointer.x = x;
      pointer.y = y;
      pointer.down = true;
      pointer.moved = true;
      if (signature(beat)) mark(beat);
      const heroBeat = beat === "hero" || beat === "book";
      const hit = world.pick(x, y, (name) => {
        if (heroBeat) return name.startsWith("HERO_n");
        if (beat === "layers") return name.startsWith("LAYERS_blk");
        if (beat === "loss") return name === "LOSS_ball";
        if (beat === "attention") return name in PRODUCT;
        return false;
      });
      if (hit && PRODUCT[hit.name]) {
        hooks.dive(PRODUCT[hit.name]);
        return false;
      }
      if (beat === "layers") {
        const inside = world.screen("LAYERS_blk").some((item) => item.box && x >= item.box.x0 && x <= item.box.x1 && y >= item.box.y0 && y <= item.box.y1);
        if (hit || inside) {
          layerDrag = true;
          return true;
        }
      }
      if (hit && heroBeat) {
        snapshotHero();
        ensureEdges();
        holding = hit.object;
        holdName = hit.name;
        const rest = restPos.get(hit.name);
        world.camera.getWorldDirection(normal);
        if (rest) plane.setFromNormalAndCoplanarPoint(normal, rest);
        const onPlane = rest ? world.rayPoint(x, y, plane) : null;
        grabPoint.copy(onPlane || hit.point);
        grabbedAt = true;
        return true;
      }
      if (hit?.name === "LOSS_ball") {
        const at = new THREE.Vector3();
        hit.object.getWorldPosition(at);
        holding = hit.object;
        holdName = hit.name;
        ball = {
          obj: hit.object,
          x: at.x,
          z: at.z,
          vx: 0,
          vz: 0,
          radius: objectRadius(hit.object) || 0.17,
          spin: new THREE.Quaternion(),
          trail: [{ x: at.x, z: at.z, born: clock }],
          releaseAge: 0,
          impact: 0,
        };
        return true;
      }
      return false;
    },
    move(x: number, y: number, beat: BeatId) {
      const prev = pointer.y;
      const dx = x - pointer.x;
      const dy = y - pointer.y;
      dragLevel = Math.min(1, Math.max(dragLevel * 0.5, Math.hypot(dx, dy) / 28));
      pointer.x = x;
      pointer.y = y;
      pointer.moved = true;
      if (pointer.down && layerDrag && beat === "layers") {
        const delta = prev - y;
        spreadGoal = Math.min(1, Math.max(0, spreadGoal + delta * 0.0045));
        if (delta > 6 && !stackApart) {
          stackApart = true;
          hooks.cue("shatter");
        }
        if (delta < -6 && stackApart) {
          stackApart = false;
          hooks.cue("reassemble");
        }
      }
    },
    up(beat: BeatId) {
      const dragged = pointer.moved && (holding !== null || layerDrag);
      const wasLayer = layerDrag;
      pointer.down = false;
      layerDrag = false;
      dragLevel = 0;
      hooks.stop?.("drag-loop");
      if (holding && (beat === "hero" || beat === "book")) releaseHero();
      if (wasLayer && stackApart) {
        stackApart = false;
        hooks.cue("reassemble");
      }
      if (!dragged && !grabbedAt) hooks.cue("click");
      grabbedAt = false;
      holding = null;
      holdName = "";
    },
    key(key: string, beat: BeatId) {
      let handled = false;
      if (key === "Enter" && beat === "attention") {
        hooks.dive("fieldrelay");
        handled = true;
      }
      if (key === "ArrowUp" && beat === "layers") {
        spreadGoal = Math.min(1, spreadGoal + 0.25);
        if (!stackApart) {
          stackApart = true;
          hooks.cue("shatter");
        }
        handled = true;
      }
      if (key === "ArrowDown" && beat === "layers") {
        spreadGoal = Math.max(0, spreadGoal - 0.25);
        if (stackApart && spreadGoal < 0.2) {
          stackApart = false;
          hooks.cue("reassemble");
        }
        handled = true;
      }
      if ((key === "ArrowRight" || key === "ArrowLeft") && (beat === "hero" || beat === "book")) {
        const node = world.named((name) => name.startsWith("HERO_n"))[0];
        if (node) {
          const metres = metresPerPixel(node) * (window.innerHeight || 1) * 0.18;
          const item = bodyOf(node);
          item.spring.offset.set(key === "ArrowRight" ? metres : -metres, 0, 0);
          item.goal.set(0, 0, 0);
          item.release = true;
          startPulse(objectName(node));
          handled = true;
        }
      }
      if (key === "ArrowRight" && beat === "loss") {
        const node = world.named((name) => name === "LOSS_ball")[0];
        if (node) {
          const at = new THREE.Vector3();
          node.getWorldPosition(at);
          ball = { obj: node, x: at.x, z: at.z, vx: 2.4, vz: 0.3, radius: objectRadius(node) || 0.17, spin: new THREE.Quaternion(), trail: [{ x: at.x, z: at.z, born: clock }], releaseAge: 0, impact: 0 };
          handled = true;
        }
      }
      if (key === " " || (key === "Enter" && beat !== "attention")) {
        hooks.cue("click");
        handled = true;
      }
      if (handled && signature(beat)) mark(beat);
      return handled;
    },
    play(kind: string) {
      script = { kind, age: 0 };
      fired.clear();
      if (kind === "hero") {
        const nodes = world.named((name) => name.startsWith("HERO_n") && !name.startsWith("HERO_n3"));
        scriptNode = objectName(nodes[4] || nodes[0] || world.named((name) => name.startsWith("HERO_n"))[0]);
      }
      if (kind === "loss") ball = null;
      const beat = kind === "hero" ? "hero" : kind === "layers" ? "layers" : kind === "loss" ? "loss" : "";
      if (beat) mark(beat);
    },
  };
}
