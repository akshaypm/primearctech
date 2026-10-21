/**
 * Sample the CC0 rough-legged buzzard into a compact shard bake.
 * The GLB is not committed. Pass its path, or use /tmp/hawk.glb.
 *
 *   node scripts/bake-falcon.mjs /tmp/hawk.glb public/lab/swarm/falcon.bin
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const glbPath = process.argv[2] || "/tmp/hawk.glb";
const outPath = process.argv[3] || "public/lab/swarm/falcon.bin";
const previewPath = process.argv[4] || "/tmp/falcon-preview.png";
const COUNT = 12288;
const PERCH_Y = 0.06;
const S = 1.7311676740646362;

const file = readFileSync(glbPath);
let offset = 12;
let json;
let bin;
while (offset < file.length) {
  const chunkLength = file.readUInt32LE(offset);
  const chunkType = file.readUInt32LE(offset + 4);
  const data = file.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
  else if (chunkType === 0x004e4942) bin = data;
  offset += 8 + chunkLength;
}

function readAccessor(index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  return {
    start: (view.byteOffset || 0) + (acc.byteOffset || 0),
    stride: view.byteStride || { SCALAR: 4, VEC2: 8, VEC3: 12, VEC4: 16 }[acc.type],
    count: acc.count,
    componentType: acc.componentType,
  };
}

function readVec3(info, i) {
  const o = info.start + i * info.stride;
  return [bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)];
}

function readIndex(info, i) {
  const o = info.start + i * (info.stride || 4);
  if (info.componentType === 5125) return bin.readUInt32LE(o);
  if (info.componentType === 5123) return bin.readUInt16LE(o);
  return bin[o];
}

function xformP(x, y, z) {
  return [S * x, S * z, -S * y];
}
function xformN(x, y, z) {
  return [x, z, -y];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(a) {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a) {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scl(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tris = [];
let skipped = 0;
for (const mesh of json.meshes) {
  const prim = mesh.primitives[0];
  const pos = readAccessor(prim.attributes.POSITION);
  const nor = readAccessor(prim.attributes.NORMAL);
  const idx = readAccessor(prim.indices);
  for (let i = 0; i < idx.count; i += 3) {
    const ia = readIndex(idx, i);
    const ib = readIndex(idx, i + 1);
    const ic = readIndex(idx, i + 2);
    const a = xformP(...readVec3(pos, ia));
    const b = xformP(...readVec3(pos, ib));
    const c = xformP(...readVec3(pos, ic));
    if (a[1] < PERCH_Y || b[1] < PERCH_Y || c[1] < PERCH_Y) {
      skipped += 1;
      continue;
    }
    const ab = sub(b, a);
    const ac = sub(c, a);
    const cr = cross(ab, ac);
    const area = len(cr) * 0.5;
    if (area < 1e-10) continue;
    const na = norm(xformN(...readVec3(nor, ia)));
    const nb = norm(xformN(...readVec3(nor, ib)));
    const nc = norm(xformN(...readVec3(nor, ic)));
    const diverge = 1 - (dot(na, nb) + dot(nb, nc) + dot(nc, na)) / 3;
    tris.push({ a, b, c, na, nb, nc, area, diverge });
  }
}
console.log("triangles kept", tris.length, "perch skipped", skipped);

let cx = 0;
let cy = 0;
let cz = 0;
let areaSum = 0;
for (const tri of tris) {
  const m = [(tri.a[0] + tri.b[0] + tri.c[0]) / 3, (tri.a[1] + tri.b[1] + tri.c[1]) / 3, (tri.a[2] + tri.b[2] + tri.c[2]) / 3];
  cx += m[0] * tri.area;
  cy += m[1] * tri.area;
  cz += m[2] * tri.area;
  areaSum += tri.area;
}
cx /= areaSum;
cy /= areaSum;
cz /= areaSum;
console.log("area centroid", [cx, cy, cz].map((v) => v.toFixed(3)));

let hx = 0;
let hy = 0;
let hz = 0;
let hArea = 0;
for (const tri of tris) {
  const m = [(tri.a[0] + tri.b[0] + tri.c[0]) / 3, (tri.a[1] + tri.b[1] + tri.c[1]) / 3, (tri.a[2] + tri.b[2] + tri.c[2]) / 3];
  const lateral = Math.abs(m[0] - cx);
  if (m[1] < cy + 0.12 || lateral > 0.2) continue;
  if (m[2] < cz + 0.05) continue;
  hx += m[0] * tri.area;
  hy += m[1] * tri.area;
  hz += m[2] * tri.area;
  hArea += tri.area;
}
if (hArea < 1e-6) throw new Error("head region was empty");
hx /= hArea;
hy /= hArea;
hz /= hArea;
const heading = norm([hx - cx, 0, hz - cz]);
console.log("head", [hx, hy, hz].map((v) => v.toFixed(3)), "heading", heading.map((v) => v.toFixed(3)));

const desired = norm([-0.34, 0, 0.94]);
const yaw = Math.atan2(desired[0], desired[2]) - Math.atan2(heading[0], heading[2]);
const cosY = Math.cos(yaw);
const sinY = Math.sin(yaw);
console.log("yaw deg", ((yaw * 180) / Math.PI).toFixed(1));

function rotY(p) {
  return [p[0] * cosY + p[2] * sinY, p[1], -p[0] * sinY + p[2] * cosY];
}

const weights = new Float32Array(tris.length);
let total = 0;
let nyTop = 0;
let nyTopN = 0;
for (let i = 0; i < tris.length; i++) {
  const tri = tris[i];
  const m = [(tri.a[0] + tri.b[0] + tri.c[0]) / 3, (tri.a[1] + tri.b[1] + tri.c[1]) / 3, (tri.a[2] + tri.b[2] + tri.c[2]) / 3];
  const lateral = Math.abs(m[0] - cx);
  const forward = (m[0] - cx) * heading[0] + (m[2] - cz) * heading[2];
  const edge = smoothstep(0.035, 0.42, tri.diverge);
  const head =
    smoothstep(cy + 0.08, cy + 0.2, m[1]) *
    smoothstep(0.16, 0.02, lateral) *
    smoothstep(-0.02, 0.12, forward);
  const wingEdge = smoothstep(0.16, 0.34, lateral) * (0.45 + edge);
  const beak = head * smoothstep(0.08, 0.2, forward);
  let w = tri.area * (1 + edge * 5.5 + head * 6.5 + beak * 4 + wingEdge * 1.8);
  if (!Number.isFinite(w) || w <= 0) w = tri.area;
  weights[i] = w;
  total += w;
  const n = norm([tri.na[0] + tri.nb[0] + tri.nc[0], tri.na[1] + tri.nb[1] + tri.nc[1], tri.na[2] + tri.nb[2] + tri.nc[2]]);
  if (m[1] > cy + 0.16 && lateral < 0.18) {
    nyTop += n[1];
    nyTopN += 1;
  }
}
console.log("mean upper normal Y", (nyTop / Math.max(1, nyTopN)).toFixed(3), "weight", total.toFixed(4));

const prefix = new Float64Array(tris.length);
let run = 0;
for (let i = 0; i < tris.length; i++) {
  run += weights[i];
  prefix[i] = run;
}

function search(target) {
  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const field = new Map();
const CELL = 0.042;
function cellKey(p) {
  const ix = Math.floor(p[0] / CELL);
  const iy = Math.floor(p[1] / CELL);
  const iz = Math.floor(p[2] / CELL);
  return (ix + 512) + (iy + 512) * 1024 + (iz + 512) * 1024 * 1024;
}
function mulCov(c, v) {
  return [c[0] * v[0] + c[1] * v[1] + c[2] * v[2], c[1] * v[0] + c[3] * v[1] + c[4] * v[2], c[2] * v[0] + c[4] * v[1] + c[5] * v[2]];
}
function largestAxis(c) {
  let v = [0.42, 0.78, 0.31];
  for (let i = 0; i < 14; i++) v = norm(mulCov(c, v));
  return v;
}
for (const tri of tris) {
  const m = [(tri.a[0] + tri.b[0] + tri.c[0]) / 3, (tri.a[1] + tri.b[1] + tri.c[1]) / 3, (tri.a[2] + tri.b[2] + tri.c[2]) / 3];
  const faceN = norm([tri.na[0] + tri.nb[0] + tri.nc[0], tri.na[1] + tri.nb[1] + tri.nc[1], tri.na[2] + tri.nb[2] + tri.nc[2]]);
  const key = cellKey(m);
  let bucket = field.get(key);
  if (!bucket) {
    bucket = [];
    field.set(key, bucket);
  }
  if (bucket.length < 18) bucket.push({ p: m, n: faceN });
}
function smoothNormal(p, meshN) {
  const ix = Math.floor(p[0] / CELL);
  const iy = Math.floor(p[1] / CELL);
  const iz = Math.floor(p[2] / CELL);
  const near = [];
  for (let dz = -2; dz <= 2; dz++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const bucket = field.get((ix + dx + 512) + (iy + dy + 512) * 1024 + (iz + dz + 512) * 1024 * 1024);
        if (!bucket) continue;
        for (const q of bucket) {
          if (Math.hypot(q.p[0] - p[0], q.p[1] - p[1], q.p[2] - p[2]) < 0.09) near.push(q);
        }
      }
    }
  }
  if (near.length < 10) return meshN;
  let ax = 0;
  let ay = 0;
  let az = 0;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (const q of near) {
    ax += q.p[0];
    ay += q.p[1];
    az += q.p[2];
    nx += q.n[0];
    ny += q.n[1];
    nz += q.n[2];
  }
  ax /= near.length;
  ay /= near.length;
  az /= near.length;
  const hint = norm([nx, ny, nz]);
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (const q of near) {
    const dx = q.p[0] - ax;
    const dy = q.p[1] - ay;
    const dz = q.p[2] - az;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }
  const cov = [xx, xy, xz, yy, yz, zz];
  const e1 = largestAxis(cov);
  const lambda = dot(e1, mulCov(cov, e1));
  const cov2 = [
    cov[0] - lambda * e1[0] * e1[0],
    cov[1] - lambda * e1[0] * e1[1],
    cov[2] - lambda * e1[0] * e1[2],
    cov[3] - lambda * e1[1] * e1[1],
    cov[4] - lambda * e1[1] * e1[2],
    cov[5] - lambda * e1[2] * e1[2],
  ];
  const e2 = largestAxis(cov2);
  let out = norm(cross(e1, e2));
  const guide = len(hint) > 0.2 ? hint : meshN;
  if (dot(out, guide) < 0) out = [-out[0], -out[1], -out[2]];
  return out;
}

const rng = mulberry32(11);
const samples = [];
let guard = 0;
while (samples.length < COUNT && guard < COUNT * 20) {
  guard += 1;
  const tri = tris[search(rng() * total)];
  const r1 = Math.sqrt(rng());
  const r2 = rng();
  const w0 = 1 - r1;
  const w1 = r1 * (1 - r2);
  const w2 = r1 * r2;
  const p = add(add(scl(tri.a, w0), scl(tri.b, w1)), scl(tri.c, w2));
  if (p[1] < PERCH_Y + 0.004) continue;
  let meshN = norm(add(add(scl(tri.na, w0), scl(tri.nb, w1)), scl(tri.nc, w2)));
  if (len(meshN) < 0.5) meshN = norm(cross(sub(tri.b, tri.a), sub(tri.c, tri.a)));
  let n = smoothNormal(p, meshN);
  const lateral = Math.abs(p[0] - cx);
  const forward = (p[0] - cx) * heading[0] + (p[2] - cz) * heading[2];
  const edge = smoothstep(0.035, 0.42, tri.diverge);
  const head = forward > 0.02 && lateral < 0.16 && p[1] > cy + 0.1;
  const wing = lateral > 0.17 && p[1] > cy - 0.05;
  samples.push({ p, n, edge, head, wing, lateral, forward });
}
if (samples.length < COUNT) throw new Error(`only sampled ${samples.length}`);
console.log("samples", samples.length);

function blurNormals(radius) {
  const cell = radius * 0.55;
  const buckets = new Map();
  const keyOf = (p) =>
    (Math.floor(p[0] / cell) + 400) * 640000 + (Math.floor(p[1] / cell) + 400) * 800 + (Math.floor(p[2] / cell) + 400);
  for (let i = 0; i < samples.length; i++) {
    const key = keyOf(samples[i].p);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(i);
  }
  const next = samples.map((sample) => sample.n);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const ix = Math.floor(sample.p[0] / cell);
    const iy = Math.floor(sample.p[1] / cell);
    const iz = Math.floor(sample.p[2] / cell);
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let count = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = buckets.get((ix + dx + 400) * 640000 + (iy + dy + 400) * 800 + (iz + dz + 400));
          if (!bucket) continue;
          for (const j of bucket) {
            const other = samples[j];
            if (Math.hypot(other.p[0] - sample.p[0], other.p[1] - sample.p[1], other.p[2] - sample.p[2]) > radius) continue;
            const side = other.n[0] * sample.n[0] + other.n[1] * sample.n[1] + other.n[2] * sample.n[2] < 0 ? -1 : 1;
            nx += other.n[0] * side;
            ny += other.n[1] * side;
            nz += other.n[2] * side;
            count += 1;
          }
        }
      }
    }
    if (count > 0) next[i] = norm([nx, ny, nz]);
  }
  for (let i = 0; i < samples.length; i++) samples[i].n = next[i];
}
blurNormals(0.11);
blurNormals(0.11);

const bins = Array.from({ length: 48 }, () => []);
for (let i = 0; i < samples.length; i++) {
  const sample = samples[i];
  if (!sample.wing) continue;
  const angle = Math.atan2(sample.p[2] - cz, sample.p[0] - cx);
  const bin = Math.min(47, Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 48));
  const radius = Math.hypot(sample.p[0] - cx, sample.p[2] - cz);
  bins[bin].push({ i, radius, y: sample.p[1] });
}
const wingPool = [];
for (const bin of bins) {
  if (bin.length < 6) continue;
  bin.sort((a, b) => b.radius - a.radius);
  const edgeCount = Math.max(1, Math.round(bin.length * 0.12));
  for (let k = 0; k < edgeCount; k++) wingPool.push(bin[k].i);
}
const spinePool = [];
for (let i = 0; i < samples.length; i++) {
  const sample = samples[i];
  const dorsal = sample.n[1] > 0.42 && sample.lateral < 0.07 && sample.p[1] > cy - 0.02;
  const crown = sample.forward > 0.1 && sample.p[1] > cy + 0.12;
  if (dorsal && !crown) spinePool.push(i);
}
const seamTarget = Math.round(COUNT * 0.04);
const seamRng = mulberry32(19);
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(seamRng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}
shuffle(spinePool);
shuffle(wingPool);
const seamSet = new Set();
const spineBudget = Math.round(seamTarget * 0.42);
for (const index of spinePool) {
  if (seamSet.size >= spineBudget) break;
  seamSet.add(index);
}
for (const index of wingPool) {
  if (seamSet.size >= seamTarget) break;
  seamSet.add(index);
}
if (seamSet.size < Math.round(COUNT * 0.03)) {
  const rest = samples
    .map((sample, index) => ({ index, score: (sample.wing ? 0.2 : 0) + sample.edge }))
    .sort((a, b) => b.score - a.score);
  for (const item of rest) {
    if (seamSet.size >= seamTarget) break;
    seamSet.add(item.index);
  }
}
console.log("seam", seamSet.size, (seamSet.size / COUNT).toFixed(3), "spine", spinePool.length, "wingEdge", wingPool.length);

function tilt(n) {
  const helper = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const b = norm(cross(n, helper));
  const t = norm(cross(n, b));
  const a = (rng() * 2 - 1) * 0.11;
  const c = (rng() * 2 - 1) * 0.11;
  return norm(add(n, add(scl(b, a), scl(t, c))));
}

const points = samples.map((sample, index) => {
  let length = 0.9 + rng() * 0.18;
  if (sample.head) length *= 0.58;
  if (sample.edge > 0.35) length *= 1.18;
  if (sample.wing) length *= 1.06;
  length = Math.max(0.72, Math.min(1.4, length));
  return {
    p: rotY(sample.p),
    n: rotY(sample.n),
    t: rotY(tilt(sample.n)),
    length,
    seam: seamSet.has(index) ? 1 : 0,
    wing: sample.wing ? 1 : 0,
  };
});

let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
for (const point of points) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], point.p[k]);
    max[k] = Math.max(max[k], point.p[k]);
  }
}
const span = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
const scale = 2.72 / Math.max(...span);
console.log("pre-scale span", span.map((v) => v.toFixed(3)), "scale", scale.toFixed(3));
for (const point of points) {
  point.p = point.p.map((v, k) => (v - (min[k] + max[k]) / 2) * scale);
}
min = [Infinity, Infinity, Infinity];
max = [-Infinity, -Infinity, -Infinity];
for (const point of points) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], point.p[k]);
    max[k] = Math.max(max[k], point.p[k]);
  }
}
console.log("hero bounds", min.map((v) => v.toFixed(3)), max.map((v) => v.toFixed(3)));

let align = 0;
let wingN = 0;
for (const point of points) {
  align += dot(point.n, point.t);
  wingN += point.wing;
}
console.log("mean tangent alignment", (align / points.length).toFixed(3), "wing fraction", (wingN / points.length).toFixed(3));

for (let i = points.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [points[i], points[j]] = [points[j], points[i]];
}

const header = 16;
const record = 32;
const out = Buffer.alloc(header + points.length * record);
out.writeUInt32LE(0x434c4146, 0);
out.writeUInt32LE(1, 4);
out.writeUInt32LE(points.length, 8);
out.writeUInt32LE(0, 12);
for (let i = 0; i < points.length; i++) {
  const o = header + i * record;
  const point = points[i];
  out.writeFloatLE(point.p[0], o);
  out.writeFloatLE(point.p[1], o + 4);
  out.writeFloatLE(point.p[2], o + 8);
  out.writeFloatLE(point.n[0], o + 12);
  out.writeFloatLE(point.n[1], o + 16);
  out.writeFloatLE(point.n[2], o + 20);
  out.writeFloatLE(point.length, o + 24);
  out.writeUInt8(point.seam, o + 28);
  out.writeUInt8(point.wing, o + 29);
  out.writeUInt8(0, o + 30);
  out.writeUInt8(0, o + 31);
}
writeFileSync(outPath, out);
console.log("wrote", outPath, out.length, "bytes");

function project(camera, look, fov, width, height, pointsToDraw, reach = 0.28) {
  const forward = norm(sub(look, camera));
  const worldUp = [0, 1, 0];
  const right = norm(cross(forward, worldUp));
  const up = norm(cross(right, forward));
  const aspect = width / height;
  const half = Math.tan(fov * 0.5);
  const image = Buffer.alloc(width * height * 3, 17);
  const depth = new Float32Array(width * height);
  depth.fill(Infinity);
  const key = norm([-0.55, 0.78, 0.38]);
  const rim = norm([0.2, 0.28, -0.92]);
  for (const point of pointsToDraw) {
    const rel = sub(point.p, camera);
    const z = dot(rel, forward);
    if (z < 0.2) continue;
    const x = dot(rel, right) / (z * half * aspect);
    const y = dot(rel, up) / (z * half);
    const sx = (x * 0.5 + 0.5) * width;
    const sy = (1 - (y * 0.5 + 0.5)) * height;
    const tip = add(point.p, scl(point.t, point.length * reach));
    const relT = sub(tip, camera);
    const zt = dot(relT, forward);
    const xt = dot(relT, right) / (zt * half * aspect);
    const yt = dot(relT, up) / (zt * half);
    const tx = (xt * 0.5 + 0.5) * width;
    const ty = (1 - (yt * 0.5 + 0.5)) * height;
    const n = point.n;
    const ndk = Math.max(0, dot(n, key));
    const ndr = Math.max(0, dot(n, rim));
    const view = norm(sub(camera, point.p));
    const h = norm(add(key, view));
    const spec = Math.max(0, dot(n, h)) ** 80;
    const fres = (1 - Math.max(0, dot(n, view))) ** 2.4;
    let r = 8 + ndk * 28;
    let g = 9 + ndk * 30;
    let b = 10 + ndk * 32;
    const specGain = 210 * spec;
    r += specGain + fres * (40 + ndr * 90);
    g += specGain * 0.98 + fres * (38 + ndr * 86);
    b += specGain * 0.94 + fres * (34 + ndr * 78);
    if (point.seam) {
      r = 190 + ndk * 40;
      g = 78 + ndk * 20;
      b = 48;
    }
    const steps = Math.max(2, Math.hypot(tx - sx, ty - sy));
    const girth = point.seam ? 2.6 : 2.15;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = sx + (tx - sx) * t;
      const py = sy + (ty - sy) * t;
      const rad = girth * (1 - t * 0.65);
      const x0 = Math.max(0, Math.floor(px - rad));
      const x1 = Math.min(width - 1, Math.ceil(px + rad));
      const y0 = Math.max(0, Math.floor(py - rad));
      const y1 = Math.min(height - 1, Math.ceil(py + rad));
      const zpix = z + (zt - z) * t;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const di = (xx - px) ** 2 + (yy - py) ** 2;
          if (di > rad * rad) continue;
          const id = yy * width + xx;
          if (zpix >= depth[id]) continue;
          depth[id] = zpix;
          const o = id * 3;
          const edge = di / (rad * rad);
          const lift = (1 - edge) * 0.35 + edge * 1.15;
          image[o] = Math.max(0, Math.min(255, r * (0.45 + lift)));
          image[o + 1] = Math.max(0, Math.min(255, g * (0.45 + lift)));
          image[o + 2] = Math.max(0, Math.min(255, b * (0.45 + lift)));
        }
      }
    }
  }
  return image;
}

const views = [
  { name: "3/4", camera: [0.15, -0.35, 5.15], look: [0.35, 0.05, 0], fov: (28 * Math.PI) / 180 },
  { name: "front", camera: [0, 0.05, 6.2], look: [0, 0.05, 0], fov: (26 * Math.PI) / 180 },
  { name: "side", camera: [5.4, 0.1, 0.2], look: [0, 0.05, 0], fov: (26 * Math.PI) / 180 },
];
const panels = [];
for (const view of views) {
  const image = project(view.camera, view.look, view.fov, 640, 400, points);
  panels.push({ image, width: 640, height: 400 });
  console.log("preview", view.name);
}
const dots = [];
for (const view of views) dots.push(project(view.camera, view.look, view.fov, 640, 400, points, 0.02));
const sheet = Buffer.alloc(1920 * 800 * 3);
for (let row = 0; row < 2; row++) {
  const source = row === 0 ? panels.map((panel) => panel.image) : dots;
  for (let i = 0; i < 3; i++) {
    for (let y = 0; y < 400; y++) {
      source[i].copy(sheet, ((row * 400 + y) * 1920 + i * 640) * 3, y * 640 * 3, (y + 1) * 640 * 3);
    }
  }
}
await sharp(sheet, { raw: { width: 1920, height: 800, channels: 3 } }).png().toFile(previewPath);
console.log("preview", previewPath);
