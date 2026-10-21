/**
 * Bake the CC0 Quaternius eagle into public/lab/swarm/falcon.bin.
 * Feathers lie on the surface. See public/lab/swarm/ASSETS.md.
 *
 * node scripts/bake-falcon.mjs [obj] [out.bin]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/workspace/package.json");
const sharp = require("sharp");

const objPath = process.argv[2] || "/tmp/birds/eagle/Animal Pack Vol.2 by @Quaternius/OBJ/Eagle.obj";
const outPath = process.argv[3] || "public/lab/swarm/falcon.bin";
const COUNT = 12288;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

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

const raw = readFileSync(objPath, "utf8").split("\n");
const verts = [];
const faces = [];
for (const line of raw) {
  if (line.startsWith("v ")) verts.push(line.trim().split(/\s+/).slice(1, 4).map(Number));
  else if (line.startsWith("f ")) {
    const idx = line.trim().split(/\s+/).slice(1).map((p) => Number(p.split("/")[0]) - 1);
    for (let i = 1; i < idx.length - 1; i++) faces.push([idx[0], idx[i], idx[i + 1]]);
  }
}

let beakI = 0;
for (let i = 1; i < verts.length; i++) if (verts[i][2] < verts[beakI][2]) beakI = i;

const target = [0.1, -2.2, 0.8];
const az = (58 * Math.PI) / 180;
const el = (14 * Math.PI) / 180;
const offset = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
const cam = add(target, scl(offset, 14));
const forward = norm(sub(target, cam));
const towardCam = scl(forward, -1);
const right = norm(cross(forward, [0, 1, 0]));
const up = norm(cross(right, forward));

let hero = verts.map((p) => {
  const d = sub(p, target);
  return [dot(d, right), dot(d, up), dot(d, towardCam)];
});
let mirror1 = false;
if (hero[beakI][0] > 0) {
  mirror1 = true;
  hero = hero.map((p) => [-p[0], p[1], p[2]]);
}
const roll = (-42 * Math.PI) / 180;
const rc = Math.cos(roll);
const rs = Math.sin(roll);
hero = hero.map((p) => [p[0] * rc - p[1] * rs, p[0] * rs + p[1] * rc, p[2]]);
let mirror2 = false;
if (hero[beakI][0] > 0) {
  mirror2 = true;
  hero = hero.map((p) => [-p[0], p[1], p[2]]);
}

function poseVector(v) {
  let x = dot(v, right);
  let y = dot(v, up);
  let z = dot(v, towardCam);
  if (mirror1) x = -x;
  const xr = x * rc - y * rs;
  const yr = x * rs + y * rc;
  x = xr;
  y = yr;
  if (mirror2) x = -x;
  return [x, y, z];
}

let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
for (const p of hero) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], p[k]);
    max[k] = Math.max(max[k], p[k]);
  }
}
const center = min.map((v, k) => (v + max[k]) / 2);
const span = max.map((v, k) => v - min[k]);
const scale = 2.35 / Math.max(span[0], span[1]);
hero = hero.map((p) => p.map((v, k) => (v - center[k]) * scale));
min = [Infinity, Infinity, Infinity];
max = [-Infinity, -Infinity, -Infinity];
for (const p of hero) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], p[k]);
    max[k] = Math.max(max[k], p[k]);
  }
}
console.log("hero bounds", min.map((v) => v.toFixed(3)), max.map((v) => v.toFixed(3)));
console.log("beak", hero[beakI].map((v) => v.toFixed(3)));

const centroid = hero.reduce((s, p) => add(s, p), [0, 0, 0]).map((v) => v / hero.length);
const vnorm = Array.from({ length: hero.length }, () => [0, 0, 0]);
const tris = faces.map(([ia, ib, ic]) => {
  const a = hero[ia];
  const b = hero[ib];
  const c = hero[ic];
  const ab = sub(b, a);
  const ac = sub(c, a);
  let n = cross(ab, ac);
  const area = len(n) * 0.5;
  n = norm(n);
  const mid = scl(add(add(a, b), c), 1 / 3);
  if (dot(n, sub(mid, centroid)) < 0) n = scl(n, -1);
  const ang = (i, j, k) => {
    const u = norm(sub(hero[j], hero[i]));
    const v = norm(sub(hero[k], hero[i]));
    return Math.acos(Math.min(1, Math.max(-1, dot(u, v))));
  };
  vnorm[ia] = add(vnorm[ia], scl(n, ang(ia, ib, ic) * area));
  vnorm[ib] = add(vnorm[ib], scl(n, ang(ib, ic, ia) * area));
  vnorm[ic] = add(vnorm[ic], scl(n, ang(ic, ia, ib) * area));
  return { ia, ib, ic, a, b, c, n, area, mid };
});
for (let i = 0; i < vnorm.length; i++) vnorm[i] = norm(vnorm[i]);

const edgeFaces = new Map();
for (let t = 0; t < tris.length; t++) {
  const tri = tris[t];
  const ids = [tri.ia, tri.ib, tri.ic];
  for (let e = 0; e < 3; e++) {
    const i = ids[e];
    const j = ids[(e + 1) % 3];
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    const list = edgeFaces.get(key);
    if (list) list.push(t);
    else edgeFaces.set(key, [t]);
  }
}
const silTri = new Uint8Array(tris.length);
for (const list of edgeFaces.values()) {
  if (list.length !== 2) continue;
  const n0 = tris[list[0]].n;
  const n1 = tris[list[1]].n;
  if (n0[2] * n1[2] < 0) {
    silTri[list[0]] = 1;
    silTri[list[1]] = 1;
  }
}

const beak = hero[beakI];
const beakM = verts[beakI];
const BODY = norm([0.044, -1.27, 4.78]);
const weights = new Array(tris.length);
for (let i = 0; i < tris.length; i++) {
  const tri = tris[i];
  const mm = scl(add(add(verts[tri.ia], verts[tri.ib]), verts[tri.ic]), 1 / 3);
  tri.mm = mm;
  const head = Math.max(0, 1 - len(sub(mm, beakM)) / 0.85);
  const wing = Math.abs(mm[0]) > 0.7 ? 1 : 0;
  const lead = wing && mm[2] < 0.35 ? 1 : 0;
  weights[i] = tri.area * (1 + (silTri[i] ? 5.5 : 0) + head * 8 + lead * 2.4);
}
const prefix = new Float64Array(tris.length);
let total = 0;
for (let i = 0; i < tris.length; i++) {
  total += weights[i];
  prefix[i] = total;
}
const rng = mulberry32(11);
function pickTri() {
  const t = rng() * total;
  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

for (let i = 0; i < tris.length; i++) tris[i].i = i;
const samples = [];
while (samples.length < COUNT) {
  const ti = pickTri();
  const tri = tris[ti];
  const r1 = Math.sqrt(rng());
  const r2 = rng();
  const b0 = 1 - r1;
  const b1 = r1 * (1 - r2);
  const b2 = r1 * r2;
  const p = add(add(scl(tri.a, b0), scl(tri.b, b1)), scl(tri.c, b2));
  const mp = add(add(scl(verts[tri.ia], b0), scl(verts[tri.ib], b1)), scl(verts[tri.ic], b2));
  const n = norm(add(add(scl(vnorm[tri.ia], b0), scl(vnorm[tri.ib], b1)), scl(vnorm[tri.ic], b2)));
  const wing = Math.abs(mp[0]) > 0.72 && len(sub(mp, beakM)) > 0.62;
  const head = !wing && len(sub(mp, beakM)) < 0.58;
  samples.push({ p, mp, n, wing, head, sil: silTri[ti] === 1 });
}
console.log("samples", samples.length, "wing", samples.filter((s) => s.wing).length, "head", samples.filter((s) => s.head).length);

function projectFlow(flow, n) {
  const t = sub(flow, scl(n, dot(flow, n)));
  if (len(t) < 1e-4) return norm(cross(n, Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]));
  return norm(t);
}

const SHOULDER = [0, -0.45, 0.15];
for (const sample of samples) {
  const mp = sample.mp;
  const dir = sample.wing
    ? [mp[0] - SHOULDER[0], (mp[1] - SHOULDER[1]) * 0.9, (mp[2] - SHOULDER[2]) * 0.18]
    : BODY;
  let t = projectFlow(poseVector(dir), sample.n);
  const outward = poseVector(sample.wing ? [Math.sign(mp[0]) || 1, 0, 0] : BODY);
  if (dot(t, outward) < 0) t = scl(t, -1);
  sample.flow = t;
}

// Trailing edge: aft side of each wing (max model Z at a given span), plus the tail.
function trailingMask(list) {
  const bins = Array.from({ length: 28 }, () => []);
  for (const sample of list) {
    const span = Math.abs(sample.mp[0]);
    const b = Math.min(27, Math.max(0, Math.floor(((span - 0.7) / 1.8) * 28)));
    bins[b].push(sample);
  }
  for (const bin of bins) {
    if (bin.length < 4) continue;
    bin.sort((a, b) => b.mp[2] - a.mp[2]);
    const take = Math.max(1, Math.round(bin.length * 0.18));
    for (let i = 0; i < take; i++) bin[i].trail = true;
  }
}
trailingMask(samples.filter((s) => s.wing && s.mp[0] >= 0));
trailingMask(samples.filter((s) => s.wing && s.mp[0] < 0));
for (const sample of samples) {
  const tail = !sample.wing && !sample.head && sample.mp[2] > 2.2;
  if (tail) sample.trail = true;
  if (sample.trail) sample.flow = norm(add(sample.flow, scl(sample.n, 0.16)));
}
let flowAlign = 0;
for (const sample of samples) flowAlign += Math.abs(dot(sample.flow, sample.n));
console.log("mean |flow·n|", (flowAlign / samples.length).toFixed(4));

// Orange: the beak-facing edge of each wing, plus one eye. The spine stays steel.
let shoulder = [0, 0, 0];
let shoulderN = 0;
for (const s of samples) {
  if (s.wing || s.head) continue;
  shoulder = add(shoulder, s.p);
  shoulderN++;
}
shoulder = scl(shoulder, 1 / Math.max(1, shoulderN));
const leadBins = (sign) => {
  let tip = null;
  let tipD = -1;
  for (const s of samples) {
    if (!s.wing || Math.sign(s.mp[0] || 1) !== sign) continue;
    const d = Math.hypot(s.p[0] - shoulder[0], s.p[1] - shoulder[1]);
    if (d > tipD) {
      tipD = d;
      tip = s;
    }
  }
  const span = norm([tip.p[0] - shoulder[0], tip.p[1] - shoulder[1], 0]);
  let side = [-span[1], span[0], 0];
  if (dot(side, sub(beak, shoulder)) < 0) side = scl(side, -1);
  const binCount = 72;
  const bins = Array.from({ length: binCount }, () => []);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s.wing || Math.sign(s.mp[0] || 1) !== sign) continue;
    const along = dot(sub(s.p, shoulder), span);
    const b = Math.min(binCount - 1, Math.max(0, Math.floor((along / Math.max(0.2, tipD)) * binCount)));
    bins[b].push(i);
  }
  const picked = [];
  let last = null;
  for (const bin of bins) {
    if (!bin.length) continue;
    bin.sort((a, b) => dot(samples[b].p, side) - dot(samples[a].p, side));
    const choice = bin[0];
    const p = samples[choice].p;
    const edge = dot(p, side);
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.02) {
      picked.push(choice);
      last = p;
    }
    for (const other of bin) {
      if (other === choice) continue;
      const q = samples[other].p;
      if (dot(q, side) < edge - 0.025) break;
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.03) continue;
      picked.push(other);
      break;
    }
  }
  return picked;
};
let tailSample = samples[0];
for (const s of samples) if (!s.wing && s.mp[2] > tailSample.mp[2]) tailSample = s;
const bodyAxis = norm([tailSample.p[0] - beak[0], tailSample.p[1] - beak[1], 0]);
let wingMean = [0, 0, 0];
let wingN = 0;
for (const s of samples) {
  if (!s.wing) continue;
  wingMean = add(wingMean, s.p);
  wingN++;
}
wingMean = scl(wingMean, 1 / Math.max(1, wingN));
let dorsal = [-bodyAxis[1], bodyAxis[0], 0];
if (dot(dorsal, sub(wingMean, beak)) < 0) dorsal = scl(dorsal, -1);
const spineBins = Array.from({ length: 42 }, () => []);
const bodyReach = Math.max(0.2, dot(sub(tailSample.p, beak), bodyAxis));
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  if (s.wing || Math.abs(s.mp[0]) > 0.55) continue;
  const along = dot(sub(s.p, beak), bodyAxis);
  if (along < -0.05 || along > bodyReach * 1.05) continue;
  const b = Math.min(41, Math.max(0, Math.floor((along / bodyReach) * 42)));
  spineBins[b].push(i);
}
const spinePick = [];
for (const bin of spineBins) {
  if (!bin.length) continue;
  bin.sort((a, b) => dot(samples[b].p, dorsal) - dot(samples[a].p, dorsal));
  spinePick.push(bin[0]);
}
const lead = [...leadBins(1), ...leadBins(-1)];
const seam = new Set(lead);
let eye = -1;
let eyeScore = Infinity;
const eyeAt = [0.18, 0.46, -0.92];
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  if (s.wing || len(sub(s.mp, beakM)) > 0.75) continue;
  const d = len(sub(s.mp, eyeAt)) - s.p[2] * 0.12;
  if (d < eyeScore) {
    eyeScore = d;
    eye = i;
  }
}
if (eye >= 0) seam.add(eye);
console.log("seam", seam.size, (seam.size / COUNT).toFixed(4), "eye", eye, "spine", spinePick.length, "lead", lead.length);

const points = samples.map((sample, index) => {
  let length = 0.92 + rng() * 0.16;
  if (sample.head) length *= 0.46;
  else if (!sample.wing) length *= 0.72;
  if (sample.trail) length *= 1.06;
  if (index === eye) length = 0.22;
  length = Math.max(0.18, Math.min(1.15, length));
  return {
    p: sample.p,
    n: sample.n,
    t: sample.flow,
    length,
    seam: seam.has(index) ? 1 : 0,
    wing: sample.wing ? 1 : 0,
    lift: sample.trail ? 1 : 0,
    eye: index === eye ? 1 : 0,
  };
});

for (let i = points.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [points[i], points[j]] = [points[j], points[i]];
}

const header = 16;
const record = 48;
const out = Buffer.alloc(header + points.length * record);
out.writeUInt32LE(0x434c4146, 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(points.length, 8);
out.writeUInt32LE(record, 12);
for (let i = 0; i < points.length; i++) {
  const o = header + i * record;
  const point = points[i];
  out.writeFloatLE(point.p[0], o);
  out.writeFloatLE(point.p[1], o + 4);
  out.writeFloatLE(point.p[2], o + 8);
  out.writeFloatLE(point.n[0], o + 12);
  out.writeFloatLE(point.n[1], o + 16);
  out.writeFloatLE(point.n[2], o + 20);
  out.writeFloatLE(point.t[0], o + 24);
  out.writeFloatLE(point.t[1], o + 28);
  out.writeFloatLE(point.t[2], o + 32);
  out.writeFloatLE(point.length, o + 36);
  out.writeUInt8(point.seam, o + 40);
  out.writeUInt8(point.wing, o + 41);
  out.writeUInt8(point.lift, o + 42);
  out.writeUInt8(point.eye, o + 43);
}
writeFileSync(outPath, out);
console.log("wrote", outPath, out.length);

function rasterMesh(W, H, project) {
  const img = Buffer.alloc(W * H * 3, 236);
  const tris2 = faces.map(([ia, ib, ic]) => [hero[ia], hero[ib], hero[ic]].map(project));
  for (const [p0, p1, p2] of tris2) {
    const x0 = p0[0];
    const y0 = p0[1];
    const x1 = p1[0];
    const y1 = p1[1];
    const x2 = p2[0];
    const y2 = p2[1];
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-6) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / den;
        const w1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / den;
        const w2 = 1 - w0 - w1;
        if (w0 >= -0.001 && w1 >= -0.001 && w2 >= -0.001) {
          const o = (y * W + x) * 3;
          img[o] = 0;
          img[o + 1] = 0;
          img[o + 2] = 0;
        }
      }
    }
  }
  return img;
}

function fitOrtho(W, H) {
  const xs = hero.map((p) => p[0]);
  const ys = hero.map((p) => p[1]);
  let minx = Math.min(...xs);
  let maxx = Math.max(...xs);
  let miny = Math.min(...ys);
  let maxy = Math.max(...ys);
  const spanx = maxx - minx;
  const spany = maxy - miny;
  const aspect = W / H;
  if (spanx / spany > aspect) {
    const extra = (spanx / aspect - spany) / 2;
    miny -= extra;
    maxy += extra;
  } else {
    const extra = (spany * aspect - spanx) / 2;
    minx -= extra;
    maxx += extra;
  }
  const pad = 0.08;
  const dx = (maxx - minx) * pad;
  const dy = (maxy - miny) * pad;
  minx -= dx;
  maxx += dx;
  miny -= dy;
  maxy += dy;
  return (p) => [
    ((p[0] - minx) / (maxx - minx)) * (W - 1),
    (1 - (p[1] - miny) / (maxy - miny)) * (H - 1),
  ];
}

const sil = rasterMesh(900, 560, fitOrtho(900, 560));
await sharp(sil, { raw: { width: 900, height: 560, channels: 3 } }).png().toFile("/tmp/birds/hero-sil.png");
console.log("silhouette /tmp/birds/hero-sil.png");

export function screenPoint(p, frame, W, H) {
  const yaw = frame.yaw;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x = p[0] * c + p[2] * s;
  const y = p[1];
  const z = -p[0] * s + p[2] * c;
  const world = [x * frame.scale + frame.x, y * frame.scale + frame.y, z * frame.scale];
  const camP = [0, frame.camY, frame.camZ];
  const look = [frame.lookX, frame.lookY, 0];
  const f = norm(sub(look, camP));
  const r = norm(cross(f, [0, 1, 0]));
  const u = norm(cross(r, f));
  const rel = sub(world, camP);
  const depth = dot(rel, f);
  const fov = (frame.fov * Math.PI) / 180;
  const aspect = W / H;
  const ndcX = dot(rel, r) / (depth * Math.tan(fov * 0.5) * aspect);
  const ndcY = dot(rel, u) / (depth * Math.tan(fov * 0.5));
  return { x: ndcX * 0.5 + 0.5, y: 1 - (ndcY * 0.5 + 0.5), depth };
}

function coverage(frame, W, H) {
  let minx = 1;
  let maxx = 0;
  let miny = 1;
  let maxy = 0;
  for (const p of hero) {
    const s = screenPoint(p, frame, W, H);
    if (s.depth < 0.05) continue;
    minx = Math.min(minx, s.x);
    maxx = Math.max(maxx, s.x);
    miny = Math.min(miny, s.y);
    maxy = Math.max(maxy, s.y);
  }
  return { minx, maxx, miny, maxy, w: maxx - minx, h: maxy - miny };
}

function searchFrame(goal) {
  let best = null;
  for (const frame of goal.candidates) {
    const box = coverage(frame, goal.w, goal.h);
    let score = 0;
    score += Math.abs(box.minx - goal.minx) * 4;
    score += Math.abs(box.maxx - goal.maxx) * 4;
    score += Math.abs(box.miny - goal.miny) * 4;
    score += Math.abs(box.maxy - goal.maxy) * 4;
    if (box.minx < goal.limit.minx) score += 8 + (goal.limit.minx - box.minx) * 20;
    if (box.maxx > goal.limit.maxx) score += 8 + (box.maxx - goal.limit.maxx) * 20;
    if (box.miny < goal.limit.miny) score += 8 + (goal.limit.miny - box.miny) * 20;
    if (box.maxy > goal.limit.maxy) score += 8 + (box.maxy - goal.limit.maxy) * 20;
    if (!best || score < best.score) best = { score, frame, box };
  }
  return best;
}

const desktopCandidates = [];
for (const scale of [0.62, 0.7, 0.78, 0.86, 0.94]) {
  for (const x of [0.7, 1.0, 1.25, 1.5, 1.75]) {
    for (const y of [-0.2, -0.05, 0.1, 0.25]) {
      for (const lookX of [0.35, 0.65, 0.95]) {
        desktopCandidates.push({
          x, y, scale, yaw: 0, camZ: 6.5, camY: 0.06, lookX, lookY: 0.02, fov: 26,
        });
      }
    }
  }
}
const desktopBest = searchFrame({
  candidates: desktopCandidates,
  w: 1440,
  h: 900,
  minx: 0.52,
  maxx: 0.91,
  miny: 0.15,
  maxy: 0.76,
  limit: { minx: 0.48, maxx: 0.94, miny: 0.12, maxy: 0.8 },
});
console.log("desktop", desktopBest.score.toFixed(3), desktopBest.box, desktopBest.frame);

const mobileCandidates = [];
for (const scale of [0.55, 0.64, 0.72, 0.8]) {
  for (const y of [0.7, 0.95, 1.15, 1.35]) {
    for (const yaw of [0, 0.18, 0.32]) {
      for (const camZ of [5.2, 6.0, 6.8]) {
        mobileCandidates.push({
          x: 0, y, scale, yaw, camZ, camY: 0.04, lookX: 0, lookY: 0.15, fov: 32,
        });
      }
    }
  }
}
const mobileBest = searchFrame({
  candidates: mobileCandidates,
  w: 390,
  h: 844,
  minx: 0.075,
  maxx: 0.925,
  miny: 0.05,
  maxy: 0.46,
  limit: { minx: 0.05, maxx: 0.95, miny: 0.03, maxy: 0.5 },
});
console.log("mobile", mobileBest.score.toFixed(3), mobileBest.box, mobileBest.frame);

const framed = rasterMesh(1440, 900, (p) => {
  const s = screenPoint(p, desktopBest.frame, 1440, 900);
  return [s.x * 1439, s.y * 899];
});
await sharp(framed, { raw: { width: 1440, height: 900, channels: 3 } }).png().toFile("/tmp/birds/frame-sil.png");
const framedMobile = rasterMesh(390, 844, (p) => {
  const s = screenPoint(p, mobileBest.frame, 390, 844);
  return [s.x * 389, s.y * 843];
});
await sharp(framedMobile, { raw: { width: 390, height: 844, channels: 3 } }).png().toFile("/tmp/birds/frame-sil-390.png");

const feather = Buffer.alloc(900 * 560 * 3, 236);
const project = fitOrtho(900, 560);
function plot(x, y, rgb) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= 900 || iy >= 560) return;
  const o = (iy * 900 + ix) * 3;
  feather[o] = rgb[0];
  feather[o + 1] = rgb[1];
  feather[o + 2] = rgb[2];
}
for (let i = 0; i < samples.length; i++) {
  const sample = samples[i];
  const a = project(sample.p);
  const b = project(add(sample.p, scl(sample.flow, 0.1)));
  const rgb = seam.has(i) ? [216, 100, 62] : [20, 20, 22];
  const steps = 8;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    plot(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, rgb);
  }
}
await sharp(feather, { raw: { width: 900, height: 560, channels: 3 } }).png().toFile("/tmp/birds/feathers.png");
const orange = Buffer.alloc(900 * 560 * 3, 236);
const mesh = rasterMesh(900, 560, project);
for (let i = 0; i < mesh.length; i += 3) {
  if (mesh[i] === 0) {
    orange[i] = 214;
    orange[i + 1] = 214;
    orange[i + 2] = 210;
  }
}
for (let i = 0; i < samples.length; i++) {
  if (!seam.has(i)) continue;
  const sample = samples[i];
  const a = project(sample.p);
  const b = project(add(sample.p, scl(sample.flow, 0.12)));
  const rgb = i === eye ? [216, 60, 20] : [216, 100, 62];
  for (let s = 0; s <= 10; s++) {
    const t = s / 10;
    const x = Math.round(a[0] + (b[0] - a[0]) * t);
    const y = Math.round(a[1] + (b[1] - a[1]) * t);
    if (x < 1 || y < 1 || x >= 899 || y >= 559) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const o = ((y + dy) * 900 + (x + dx)) * 3;
        orange[o] = rgb[0];
        orange[o + 1] = rgb[1];
        orange[o + 2] = rgb[2];
      }
    }
  }
}
await sharp(orange, { raw: { width: 900, height: 560, channels: 3 } }).png().toFile("/tmp/birds/orange.png");
console.log("previews written");
