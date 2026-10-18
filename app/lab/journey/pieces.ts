import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type Piece = {
  object: THREE.Group;
  accents: THREE.MeshStandardMaterial[];
  tick?: (timeMs: number) => void;
};

function metal(color: number, roughness = 0.36, metalness = 0.84) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 1.05 });
}

function accent() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xb3b1ac,
    metalness: 0.55,
    roughness: 0.38,
    clearcoat: 0.75,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.1,
  });
}

function rng(start: number) {
  let seed = start || 7;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

export function buildDemo(): Piece {
  const group = new THREE.Group();
  const random = rng(3);
  const hot = accent();
  const N = 88;
  const L = 11.4;
  const finGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.035);
  const standing = new THREE.InstancedMesh(finGeo, metal(0xc8c6c0, 0.4, 0.84), N);
  const loose = new THREE.InstancedMesh(finGeo, metal(0xb7b8b6, 0.55, 0.74), N);
  standing.frustumCulled = false;
  loose.frustumCulled = false;
  const poses: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; fallen: boolean }[] = [];
  const dummy = new THREE.Object3D();
  for (let index = 0; index < N; index += 1) {
    const u = index / (N - 1);
    const fallen = u < 0.46 && random() < 0.22;
    const height = fallen ? 0.45 + random() * 0.7 : 0.9 + Math.sin(u * Math.PI * 2.15 + 0.4) * 0.72;
    const x = -L / 2 + u * L + (fallen ? (random() - 0.5) * 0.35 : 0);
    dummy.position.set(x, fallen ? 0.08 : 0.16 + height / 2, fallen ? 0.7 + random() * 0.8 : (random() - 0.5) * 0.05);
    dummy.rotation.set(fallen ? -Math.PI / 2 + (random() - 0.5) * 0.25 : 0, fallen ? (random() - 0.5) * 0.8 : 0, fallen ? (random() - 0.5) * 0.4 : 0);
    dummy.scale.set(fallen ? 0.08 : 0.055, height, fallen ? 0.5 : 0.62);
    dummy.updateMatrix();
    standing.setMatrixAt(index, fallen ? hidden : dummy.matrix);
    loose.setMatrixAt(index, fallen ? dummy.matrix : hidden);
    poses.push({
      p: dummy.position.clone(),
      q: dummy.quaternion.clone(),
      s: dummy.scale.clone(),
      fallen,
    });
  }
  standing.instanceMatrix.needsUpdate = true;
  loose.instanceMatrix.needsUpdate = true;
  group.add(standing, loose);

  const rail = new THREE.Mesh(new RoundedBoxGeometry(L + 0.7, 0.14, 0.82, 3, 0.03), metal(0x2a2c2e, 0.42, 0.78));
  rail.position.y = 0.07;
  group.add(rail);

  const carriage = new THREE.Group();
  const dark = metal(0x3a3d40, 0.32, 0.72);
  const bright = metal(0xc9c8c4, 0.22, 0.9);
  const beam = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.16, 1.55, 2, 0.03), dark);
  beam.position.y = 2.15;
  carriage.add(beam);
  const nose = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.42, 0.1, 2, 0.02), bright);
  nose.position.y = 1.9;
  carriage.add(nose);
  for (const z of [-0.62, 0.62]) {
    const leg = new THREE.Mesh(new RoundedBoxGeometry(0.16, 1.95, 0.08, 2, 0.02), bright);
    leg.position.set(0, 1.15, z);
    carriage.add(leg);
  }
  const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.1, 1.45, 2, 0.02), dark);
  shoe.position.y = 0.2;
  carriage.add(shoe);
  group.add(carriage);

  const tooth = new THREE.Mesh(finGeo, hot);
  group.add(tooth);
  let last = -1;

  return {
    object: group,
    accents: [hot],
    tick(timeMs) {
      const u = 0.52 + Math.sin(timeMs * 0.00042) * 0.2;
      const x = -L / 2 + u * L;
      carriage.position.x = x;
      let best = 0;
      let bestDistance = Infinity;
      for (let index = 0; index < N; index += 1) {
        if (poses[index].fallen) continue;
        const distance = Math.abs(poses[index].p.x - x);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
      if (last !== best && last >= 0) {
        const previous = poses[last];
        const matrix = new THREE.Matrix4().compose(previous.p, previous.q, previous.s);
        standing.setMatrixAt(last, matrix);
      }
      const pose = poses[best];
      tooth.position.copy(pose.p);
      tooth.position.z += 0.2;
      tooth.quaternion.copy(pose.q);
      tooth.scale.copy(pose.s);
      tooth.scale.x = Math.max(tooth.scale.x, 0.07);
      standing.setMatrixAt(best, hidden);
      standing.instanceMatrix.needsUpdate = true;
      last = best;
    },
  };
}

export function buildEngagements(): Piece {
  const group = new THREE.Group();
  const hot = accent();
  const rough = metal(0xb0aea8, 0.62, 0.35);
  const cut = metal(0xc4c5c6, 0.48, 0.72);
  const fine = metal(0xe4e3df, 0.26, 0.82);
  const graphite = metal(0x2a2d30, 0.45, 0.6);

  const billet = new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.72, 0.78, 3, 0.04), rough);
  billet.position.set(-3.55, 0.4, 0);
  group.add(billet);

  const stock = new THREE.Mesh(new RoundedBoxGeometry(2.7, 0.14, 0.72, 2, 0.02), cut);
  stock.position.set(-0.55, 0.1, 0);
  group.add(stock);

  const ribGeo = new RoundedBoxGeometry(0.07, 1, 0.7, 2, 0.01);
  const ribs = new THREE.InstancedMesh(ribGeo, cut, 20);
  ribs.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 20; index += 1) {
    const height = 0.55 + ((index * 3) % 5) * 0.03;
    matrix.makeScale(1, height, 0.98);
    matrix.setPosition(-1.75 + index * 0.125, 0.16 + height / 2, 0);
    ribs.setMatrixAt(index, matrix);
  }
  group.add(ribs);

  const chipGeo = new THREE.TorusGeometry(0.03, 0.007, 4, 8, Math.PI * 1.2);
  const chips = new THREE.InstancedMesh(chipGeo, fine, 70);
  chips.frustumCulled = false;
  const random = rng(21);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let index = 0; index < 70; index += 1) {
    e.set(Math.PI / 2 + (random() - 0.5) * 0.7, random() * 6, random() * 6);
    q.setFromEuler(e);
    const scale = 0.55 + random() * 0.8;
    matrix.compose(
      new THREE.Vector3(-1.7 + random() * 2.5, 0.02, 0.45 + random() * 0.7),
      q,
      new THREE.Vector3(scale, scale, scale),
    );
    chips.setMatrixAt(index, matrix);
  }
  group.add(chips);

  const R = 2.35;
  const X0 = 1.85;
  const count = 52;
  const finGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.04);
  const fins = new THREE.InstancedMesh(finGeo, fine, count);
  fins.frustumCulled = false;
  const hotIndex = Math.round(count * 0.62);
  const hotMesh = new THREE.Mesh(finGeo, hot);
  for (let index = 0; index < count; index += 1) {
    const t = index / (count - 1);
    const angle = -Math.PI / 2 + t * (Math.PI / 2);
    const width = 0.5 + 0.12 * Math.sin(t * Math.PI * 1.4);
    const position = new THREE.Vector3(X0 + Math.cos(angle) * R, R + Math.sin(angle) * R, 0);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle + Math.PI / 2);
    const scale = new THREE.Vector3(0.028, width, 0.7);
    if (index === hotIndex) {
      hotMesh.position.copy(position).add(new THREE.Vector3(-Math.cos(angle), -Math.sin(angle), 0).multiplyScalar(width / 2));
      hotMesh.quaternion.copy(quaternion);
      hotMesh.scale.copy(scale);
      fins.setMatrixAt(index, hidden);
      continue;
    }
    position.add(new THREE.Vector3(-Math.cos(angle), -Math.sin(angle), 0).multiplyScalar(width / 2));
    matrix.compose(position, quaternion, scale);
    fins.setMatrixAt(index, matrix);
  }
  group.add(fins, hotMesh);
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.16, 0.9, 2, 0.02), graphite);
  foot.position.set(X0, 0.08, 0);
  group.add(foot);
  return { object: group, accents: [hot] };
}

export function buildToolpath(): Piece {
  const group = new THREE.Group();
  const hot = accent();
  const doneMat = metal(0xd7d4cc, 0.28, 0.88);
  const rawMat = metal(0x6d7174, 0.55, 0.45);
  const R = 3.05;
  const count = 72;
  const finGeo = new RoundedBoxGeometry(1, 1, 1, 1, 0.02);
  const done = new THREE.InstancedMesh(finGeo, doneMat, count);
  const raw = new THREE.InstancedMesh(finGeo, rawMat, count);
  const path = new THREE.InstancedMesh(
    new RoundedBoxGeometry(0.16, 0.035, 0.035, 1, 0.004),
    metal(0xc8c4bc, 0.32, 0.78),
    count,
  );
  done.frustumCulled = false;
  raw.frustumCulled = false;
  path.frustumCulled = false;
  const profile: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; path: THREE.Matrix4 }[] = [];
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 0, 1);
  for (let index = 0; index < count; index += 1) {
    const u = index / (count - 1);
    const angle = Math.PI * (1 - u);
    const width = 0.48 + 0.12 * Math.sin(u * Math.PI * 3 + 0.6);
    const depth = 0.55 + 0.08 * Math.cos(u * Math.PI * 2);
    const radial = R + width / 2;
    position.set(Math.cos(angle) * radial, Math.sin(angle) * radial, 0);
    quaternion.setFromAxisAngle(axis, angle);
    scale.set(width, 0.028, depth);
    const matrix = new THREE.Matrix4().compose(position, quaternion, scale);
    const outer = radial + width / 2 + 0.05;
    const pathMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(angle) * outer, Math.sin(angle) * outer, depth / 2),
      quaternion,
      new THREE.Vector3(1, 1, 1),
    );
    profile.push({ p: position.clone(), q: quaternion.clone(), s: scale.clone(), path: pathMatrix });
    done.setMatrixAt(index, matrix);
    raw.setMatrixAt(index, matrix);
    path.setMatrixAt(index, pathMatrix);
  }
  group.add(done, raw, path);

  for (const side of [-1, 1]) {
    const footing = new THREE.Mesh(new RoundedBoxGeometry(1.05, 0.16, 0.9, 2, 0.03), metal(0x2a2c2e, 0.48, 0.6));
    footing.position.set(side * (R + 0.35), 0.08, 0);
    group.add(footing);
  }

  const tool = new THREE.Group();
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 12), metal(0x2c3033, 0.4, 0.7));
  shank.position.y = 0.35;
  const bit = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.28, 10), hot);
  bit.position.y = 0.08;
  tool.add(shank, bit);
  group.add(tool);

  const apply = (cut: number) => {
    const frontier = Math.max(1, Math.min(count - 2, Math.round(cut * (count - 1))));
    for (let index = 0; index < count; index += 1) {
      const on = index <= frontier;
      done.setMatrixAt(index, on ? new THREE.Matrix4().compose(profile[index].p, profile[index].q, profile[index].s) : hidden);
      const rawScale = profile[index].s.clone().multiply(new THREE.Vector3(0.72, 0.45, 0.72));
      raw.setMatrixAt(index, on ? hidden : new THREE.Matrix4().compose(profile[index].p, profile[index].q, rawScale));
      path.setMatrixAt(index, index <= frontier ? profile[index].path : hidden);
    }
    done.instanceMatrix.needsUpdate = true;
    raw.instanceMatrix.needsUpdate = true;
    path.instanceMatrix.needsUpdate = true;
    const fin = profile[frontier];
    const direction = fin.p.clone().normalize();
    tool.position.copy(fin.p).addScaledVector(direction, fin.s.x / 2 + 0.12);
    tool.position.z = fin.s.z / 2;
    tool.quaternion.copy(fin.q);
  };
  apply(0.62);

  return {
    object: group,
    accents: [hot],
    tick(timeMs) {
      apply(0.58 + Math.sin(timeMs * 0.00038) * 0.1);
    },
  };
}

const SPANS: [string, number, number][] = [
  ["request", 0, 1840],
  ["auth.check", 10, 40],
  ["retrieve.vector", 40, 420],
  ["rerank", 420, 610],
  ["llm.generate", 610, 1520],
  ["tool.call", 900, 1180],
  ["guardrail", 1520, 1660],
  ["eval.sample", 1660, 1760],
  ["respond", 1760, 1840],
];

export function buildTrace(): Piece {
  const group = new THREE.Group();
  const hot = accent();
  const finMat = metal(0xd8d6d1, 0.28, 0.86);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(7.6, 0.22, 4.4, 3, 0.04), metal(0x3a3e42, 0.4, 0.55));
  plate.position.y = 0.11;
  group.add(plate);
  const T = 1840;
  const x0 = -3.15;
  const x1 = 3.2;
  const rowZ = (index: number) => -1.7 + index * 0.4;
  const finGeo = new RoundedBoxGeometry(1, 1, 1, 1, 0.01);
  SPANS.forEach((span, index) => {
    const start = x0 + ((x1 - x0) * span[1]) / T;
    const end = x0 + ((x1 - x0) * span[2]) / T;
    const length = Math.max(0.08, end - start);
    const material = finMat;
    const base = new THREE.Mesh(new RoundedBoxGeometry(length, 0.045, 0.26, 1, 0.01), material);
    base.position.set(start + length / 2, 0.25, rowZ(index));
    group.add(base);
    if (span[0] === "request") return;
    const height = 0.16 + (index % 3) * 0.05;
    const n = Math.max(1, Math.round(length / 0.08));
    const fins = new THREE.InstancedMesh(finGeo, material, n);
    fins.frustumCulled = false;
    const matrix = new THREE.Matrix4();
    for (let fin = 0; fin < n; fin += 1) {
      matrix.makeScale(Math.min(0.045, length * 0.7), height, 0.22);
      matrix.setPosition(start + (fin + 0.5) * (length / n), 0.27 + height / 2, rowZ(index));
      fins.setMatrixAt(fin, matrix);
    }
    group.add(fins);
  });
  const hotSpan = SPANS.findIndex((span) => span[0] === "llm.generate");
  const hotStart = x0 + ((x1 - x0) * (SPANS[hotSpan]?.[1] ?? 610)) / T;
  const marker = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.26, 0.3, 1, 0.01), hot);
  marker.position.set(hotStart + 0.22, 0.46, rowZ(Math.max(0, hotSpan)));
  group.add(marker);
  group.rotation.y = -0.32;
  return { object: group, accents: [hot] };
}

export function buildProducts(): Piece {
  const group = new THREE.Group();
  const hot = accent();
  const alu = metal(0xdcdbd7, 0.38, 0.86);
  const polish = metal(0xe4e3df, 0.18, 0.94);
  const graphite = metal(0x3a3d41, 0.32, 0.62);
  const stock = metal(0xc2bfb9, 0.7, 0.32);
  const cut = metal(0x8e8d89, 0.52, 0.8);

  const table = new THREE.Mesh(new RoundedBoxGeometry(8.6, 0.16, 3.3, 3, 0.03), metal(0x4a4d50, 0.4, 0.7));
  table.position.y = 0.72;
  const apron = new THREE.Mesh(new RoundedBoxGeometry(8.2, 0.55, 2.9, 2, 0.04), metal(0x2c2f32, 0.5, 0.55));
  apron.position.y = 0.36;
  group.add(table, apron);

  const relay = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0, 0],
        [0.58, 0],
        [0.62, 0.04],
        [0.62, 0.2],
        [0.56, 0.24],
        [0.42, 0.28],
        [0, 0.28],
      ].map((pair) => new THREE.Vector2(pair[0], pair[1])),
      56,
    ),
    alu,
  );
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.045, 56, 1, true), hot);
  band.position.y = 0.1;
  const finGeo = new RoundedBoxGeometry(0.42, 1, 0.02, 1, 0.006);
  const fins = new THREE.InstancedMesh(finGeo, polish, 40);
  fins.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let index = 0; index < 40; index += 1) {
    const angle = (index / 40) * Math.PI * 2;
    const height = 0.07 + 0.012 * Math.sin(angle * 3);
    matrix.compose(
      new THREE.Vector3(Math.cos(angle) * 0.48, 0.3 + height / 2, Math.sin(angle) * 0.48),
      new THREE.Quaternion().setFromAxisAngle(yAxis, -angle),
      new THREE.Vector3(1, height, 1),
    );
    fins.setMatrixAt(index, matrix);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 32), graphite);
  hub.position.y = 0.36;
  relay.add(body, band, fins, hub);
  relay.position.set(-2.55, 0.8, 0.05);
  relay.scale.setScalar(1.35);
  relay.rotation.y = 0.35;
  group.add(relay);

  const counter = new THREE.Group();
  const block = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.5, 1.05, 3, 0.04), stock);
  block.position.y = 0.25;
  counter.add(block);
  const deck = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.04, 1.0, 2, 0.015), cut);
  deck.position.y = 0.52;
  counter.add(deck);
  for (let bank = 0; bank < 4; bank += 1) {
    const x0 = -0.98 + bank * 0.5;
    if (bank < 3) {
      const n = bank === 2 ? 5 : 8;
      const blade = new RoundedBoxGeometry(bank === 2 ? 0.06 : 0.03, 1, 0.86, 1, 0.008);
      const field = new THREE.InstancedMesh(blade, bank === 2 ? stock : cut, n);
      field.frustumCulled = false;
      for (let fin = 0; fin < n; fin += 1) {
        const height = 0.34 * (0.92 + 0.08 * Math.sin(fin + bank));
        matrix.makeScale(1, height, 1);
        matrix.setPosition(x0 + 0.04 + fin * (0.4 / n), 0.54 + height / 2, 0);
        field.setMatrixAt(fin, matrix);
      }
      counter.add(field);
    } else {
      const blank = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.34, 0.9, 2, 0.03), stock);
      blank.position.set(x0 + 0.22, 0.71, 0);
      counter.add(blank);
    }
  }
  counter.position.set(0.15, 0.8, 0);
  counter.rotation.y = -0.42;
  group.add(counter);

  const roster = new THREE.Group();
  const raw = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.55, 28), stock);
  raw.rotation.z = Math.PI / 2;
  raw.position.x = -0.72;
  roster.add(raw);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.15, 24), cut);
  core.rotation.z = Math.PI / 2;
  core.position.x = 0.28;
  roster.add(core);
  for (let index = 0; index < 8; index += 1) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.055, 28), polish);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = -0.2 + index * 0.14;
    roster.add(disc);
  }
  roster.position.set(2.45, 1.28, 0.15);
  roster.rotation.y = 0.95;
  group.add(roster);

  return { object: group, accents: [hot] };
}

export function buildGauge(): Piece {
  const group = new THREE.Group();
  const hot = accent();
  const steel = metal(0xc5c7c8, 0.34, 0.9);
  const steelDark = metal(0x8e9194, 0.42, 0.95);
  const alu = metal(0xd9d8d4, 0.28, 0.92);
  const rough = metal(0x6a6c6b, 0.78, 0.28);
  const width = 3.15;
  const height = 1.22;
  const depth = 0.92;
  const slot = 0.09;
  const half = (width - slot) / 2;

  const base = new THREE.Mesh(new RoundedBoxGeometry(width + 0.35, 0.16, depth + 0.28, 3, 0.04), steelDark);
  base.position.y = 0.08;
  group.add(base);
  for (const side of [-1, 1]) {
    const block = new THREE.Mesh(new RoundedBoxGeometry(half, height, depth, 3, 0.08), steel);
    block.position.set(side * (slot / 2 + half / 2), height / 2 + 0.16, 0);
    group.add(block);
  }

  const face = document.createElement("canvas");
  face.width = 1024;
  face.height = 420;
  const context = face.getContext("2d");
  if (context) {
    context.clearRect(0, 0, 1024, 420);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(17,19,21,0.88)";
    context.font = '500 150px "General Sans", sans-serif';
    context.fillText("GO", 270, 150);
    context.fillText("NO-GO", 750, 150);
    context.font = '400 36px "IBM Plex Mono", monospace';
    context.fillText("0.075  +0.002/−0", 270, 280);
    context.fillText("0.075  +0.010", 750, 280);
    context.font = '400 28px "IBM Plex Mono", monospace';
    context.fillText("FIT GAUGE  ·  No. 09", 270, 350);
  }
  const texture = new THREE.CanvasTexture(face);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.2, height - 0.18),
    new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.6, metalness: 0.4, depthWrite: false }),
  );
  plate.position.set(0, height / 2 + 0.16, depth / 2 + 0.004);
  group.add(plate);

  const finGeo = new RoundedBoxGeometry(0.055, 1.45, 0.42, 2, 0.012);
  const blade = new THREE.Mesh(finGeo, hot);
  blade.position.set(0, 0.24 + 0.72, 0.02);
  group.add(blade);
  for (const [z, index] of [[-0.7, 0], [-1.35, 1], [-2.0, 2], [-2.65, 3]] as const) {
    const waiting = new THREE.Mesh(finGeo, alu);
    waiting.position.set(0, 0.24 + 0.72, z);
    waiting.scale.y = index === 3 ? 0.92 : 1;
    group.add(waiting);
  }
  const reject = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.85, 0.55, 2, 0.03), rough);
  reject.position.set(0.15, 0.24 + 0.42, depth / 2 + 0.35);
  reject.rotation.set(-0.04, 0.2, 0.05);
  group.add(reject);
  return { object: group, accents: [hot] };
}
