/**
 * One hound, in profile, facing left toward the headline.
 * A point set on articulated volumes, not a filled blob.
 * The orange seam is a thread inside the chest and back.
 */

export const SWARM_SEED = 11;
export const DESKTOP_GRID = { x: 256, y: 128 };
export const MOBILE_GRID = { x: 128, y: 64 };

export type V3 = [number, number, number];

export type Shard = {
  home: V3;
  origin: V3;
  tangent: V3;
  normal: V3;
  seam: V3;
  seamFlag: number;
  length: number;
  rough: number;
  twist: number;
  ao: number;
  delay: number;
  width: number;
  thin: number;
};

type Rng = () => number;

const SEAM_PTS: V3[] = [
  [-0.95, 0.5, 0.1],
  [-0.55, 0.42, 0.1],
  [-0.12, 0.36, 0.09],
  [0.28, 0.33, 0.08],
  [0.58, 0.32, 0.08],
  [0.9, 0.42, 0.09],
];

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scl(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a: V3, b: V3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(a: V3) {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a: V3): V3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function randn(rng: Rng) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function ellip(p: V3, c: V3, r: V3) {
  const x = (p[0] - c[0]) / r[0];
  const y = (p[1] - c[1]) / r[1];
  const z = (p[2] - c[2]) / r[2];
  return (Math.hypot(x, y, z) - 1) * Math.min(r[0], r[1], r[2]);
}

function ellipNormal(p: V3, c: V3, r: V3): V3 {
  return norm([(p[0] - c[0]) / (r[0] * r[0]), (p[1] - c[1]) / (r[1] * r[1]), (p[2] - c[2]) / (r[2] * r[2])]);
}

function capsule(p: V3, a: V3, b: V3, r: number) {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / Math.max(1e-6, dot(ab, ab)), 0, 1);
  return len(sub(sub(p, a), scl(ab, t))) - r;
}

export function creatureSdf(p: V3) {
  const torso = ellip(p, [-0.02, 0.3, 0], [0.64, 0.2, 0.2]);
  const chest = ellip(p, [-0.42, 0.26, 0.02], [0.32, 0.22, 0.18]);
  const haunch = ellip(p, [0.46, 0.24, 0.02], [0.3, 0.24, 0.17]);
  const neck = capsule(p, [-0.78, 0.58, 0.03], [-0.18, 0.4, 0.02], 0.15);
  const head = ellip(p, [-0.92, 0.58, 0.03], [0.24, 0.17, 0.16]);
  const snout = ellip(p, [-1.22, 0.5, 0.04], [0.3, 0.1, 0.1]);
  const body = Math.min(torso, chest, haunch, neck, head, snout);
  const earN = capsule(p, [-0.84, 0.74, 0.1], [-0.76, 1.14, 0.12], 0.075);
  const earF = capsule(p, [-0.78, 0.7, -0.08], [-0.74, 0.98, -0.1], 0.055);
  const fl = capsule(p, [-0.48, 0.2, 0.14], [-0.56, -0.8, 0.16], 0.055);
  const fr = capsule(p, [-0.28, 0.18, -0.12], [-0.22, -0.78, -0.14], 0.046);
  const hl1 = capsule(p, [0.48, 0.2, 0.13], [0.66, -0.28, 0.15], 0.06);
  const hl2 = capsule(p, [0.66, -0.28, 0.15], [0.5, -0.8, 0.16], 0.048);
  const hr1 = capsule(p, [0.3, 0.18, -0.11], [0.42, -0.3, -0.13], 0.05);
  const hr2 = capsule(p, [0.42, -0.3, -0.13], [0.28, -0.78, -0.14], 0.042);
  const legs = Math.min(fl, fr, hl1, hl2, hr1, hr2);
  let tail = 1;
  for (let i = 0; i < 7; i++) {
    const t0 = i / 7;
    const t1 = (i + 1) / 7;
    tail = Math.min(tail, capsule(p, tailAt(t0).p, tailAt(t1).p, tailAt(t0).radius));
  }
  return Math.min(body, earN, earF, legs, tail);
}

function tailAt(t: number) {
  const x = 0.66 + t * 0.62 - t * t * 0.3;
  const y = 0.3 + Math.pow(t, 0.82) * 0.74;
  const z = 0.04 + Math.sin(t * 2.4) * 0.04;
  const dt = 0.012;
  const x2 = 0.66 + (t + dt) * 0.62 - (t + dt) * (t + dt) * 0.3;
  const y2 = 0.3 + Math.pow(t + dt, 0.82) * 0.74;
  const z2 = 0.04 + Math.sin((t + dt) * 2.4) * 0.04;
  return {
    p: [x, y, z] as V3,
    tangent: norm([x2 - x, y2 - y, z2 - z]),
    radius: lerp(0.1, 0.028, t),
  };
}

function coversSeam(p: V3) {
  const q = seamQuery(p);
  return q.d < 0.042 && p[2] > 0.0;
}

function seamQuery(p: V3) {
  let best = Infinity;
  let point: V3 = SEAM_PTS[0];
  let tangent: V3 = [1, 0, 0];
  for (let i = 0; i < SEAM_PTS.length - 1; i++) {
    const a = SEAM_PTS[i];
    const b = SEAM_PTS[i + 1];
    const ab = sub(b, a);
    const t = clamp(dot(sub(p, a), ab) / Math.max(1e-6, dot(ab, ab)), 0, 1);
    const q = add(a, scl(ab, t));
    const d = len(sub(p, q));
    if (d < best) {
      best = d;
      point = q;
      tangent = norm(ab);
    }
  }
  return { d: best, point, tangent };
}

function sampleEllipsoid(c: V3, r: V3, rng: Rng, inner: number, outer: number) {
  const n = norm([randn(rng), randn(rng), randn(rng)]);
  const radial = inner + (outer - inner) * Math.pow(rng(), 0.7);
  const p: V3 = [c[0] + n[0] * r[0] * radial, c[1] + n[1] * r[1] * radial, c[2] + n[2] * r[2] * radial];
  return { p, normal: ellipNormal(p, c, r) };
}

function sampleCapsule(a: V3, b: V3, radius: number, rng: Rng, surface = 0.45) {
  const axis = sub(b, a);
  const tangent = norm(axis);
  const center = add(a, scl(axis, 0.06 + rng() * 0.88));
  const helper: V3 = Math.abs(tangent[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const n = norm(cross(tangent, helper));
  const bin = cross(tangent, n);
  const ang = rng() * Math.PI * 2;
  const rad = radius * (surface + rng() * (1.05 - surface));
  const p = add(center, add(scl(n, Math.cos(ang) * rad), scl(bin, Math.sin(ang) * rad)));
  const outward = norm(sub(p, center));
  return { p, tangent, normal: outward };
}

function sampleCone(base: V3, tip: V3, radius: number, rng: Rng) {
  const tangent = norm(sub(tip, base));
  const t = Math.pow(rng(), 0.65);
  const center = add(base, scl(sub(tip, base), t));
  const helper: V3 = Math.abs(tangent[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const n = norm(cross(tangent, helper));
  const bin = cross(tangent, n);
  const ang = rng() * Math.PI * 2;
  const rad = radius * (1 - t) * (0.35 + rng() * 0.7);
  const p = add(center, add(scl(n, Math.cos(ang) * rad), scl(bin, Math.sin(ang) * rad)));
  return { p, tangent, normal: norm(add(tangent, scl(norm(sub(p, center)), 0.65))) };
}

function inLegGap(p: V3) {
  return p[1] < -0.04 && p[0] > -0.06 && p[0] < 0.2 && Math.abs(p[2]) < 0.32;
}

function flowAlongBack(p: V3): V3 {
  const { tangent } = seamQuery(p);
  return tangent;
}

type Built = {
  p: V3;
  tangent: V3;
  normal: V3;
  length: number;
  rough: number;
  ao: number;
  width: number;
  thin: number;
  seamFlag: number;
};

function finish(built: Built, rng: Rng, homeOverride?: V3): Shard {
  const home = homeOverride ?? built.p;
  const { point } = seamQuery(home);
  const fromRight = rng() < 0.78;
  const origin: V3 = fromRight
    ? [home[0] + 2.6 + rng() * 1.8, home[1] + (rng() - 0.35) * 1.6, home[2] + (rng() - 0.5) * 0.7]
    : [home[0] + (rng() - 0.45) * 2.2, home[1] + 2.3 + rng() * 1.2, home[2] + (rng() - 0.5) * 0.55];
  const delay = clamp((1.15 - home[0]) / 2.7, 0, 1) * 0.5 + rng() * 0.08;
  return {
    home,
    origin,
    tangent: norm(built.tangent),
    normal: norm(built.normal),
    seam: point,
    seamFlag: built.seamFlag,
    length: built.length,
    rough: built.rough,
    twist: (rng() - 0.5) * 0.35,
    ao: built.ao,
    delay,
    width: built.width,
    thin: built.thin,
  };
}

function takeEllipsoid(
  c: V3,
  r: V3,
  rng: Rng,
  inner: number,
  outer: number,
  length: number,
  rough: number,
  ao: number,
  tangentOf: (p: V3, n: V3) => V3,
): Built | null {
  const { p, normal } = sampleEllipsoid(c, r, rng, inner, outer);
  if (inLegGap(p)) return null;
  return {
    p,
    tangent: tangentOf(p, normal),
    normal,
    length,
    rough,
    ao,
    width: 0.85 + rng() * 0.4,
    thin: 0.75 + rng() * 0.35,
    seamFlag: 0,
  };
}

const WEIGHTS: { name: string; w: number }[] = [
  { name: "coreTorso", w: 16 },
  { name: "shellTorso", w: 13 },
  { name: "coreChest", w: 6 },
  { name: "shellChest", w: 6 },
  { name: "coreHaunch", w: 6 },
  { name: "shellHaunch", w: 6 },
  { name: "neck", w: 7.5 },
  { name: "head", w: 8 },
  { name: "snout", w: 5.5 },
  { name: "brow", w: 1.6 },
  { name: "earNear", w: 3.4 },
  { name: "earFar", w: 2 },
  { name: "legFL", w: 4.6 },
  { name: "legFR", w: 3.6 },
  { name: "legHL", w: 5.2 },
  { name: "legHR", w: 3.6 },
  { name: "paws", w: 3.4 },
  { name: "tail", w: 8.2 },
  { name: "ruff", w: 2.6 },
  { name: "contour", w: 4.4 },
  { name: "seam", w: 4.2 },
];

function allocate(count: number) {
  const sum = WEIGHTS.reduce((s, p) => s + p.w, 0);
  const raw = WEIGHTS.map((p) => (p.w / sum) * count);
  const ints = raw.map((v) => Math.floor(v));
  let left = count - ints.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, f: v - ints[i] }))
    .sort((a, b) => b.f - a.f);
  for (let k = 0; k < left; k++) ints[order[k % order.length].i] += 1;
  left = count - ints.reduce((s, v) => s + v, 0);
  ints[0] += left;
  return ints;
}

function buildOne(name: string, rng: Rng): Built | null {
  const along = (p: V3, n: V3) => {
    const flow = flowAlongBack(p);
    const flat = sub(flow, scl(n, dot(flow, n)));
    return len(flat) > 0.28 ? norm(flat) : flow;
  };
  if (name === "coreTorso") {
    return takeEllipsoid([-0.02, 0.3, 0], [0.64, 0.2, 0.2], rng, 0.28, 0.7, lerp(0.55, 0.85, rng()), lerp(0.55, 0.82, rng()), lerp(0.42, 0.62, rng()), along);
  }
  if (name === "shellTorso") {
    const built = takeEllipsoid([-0.02, 0.3, 0], [0.64, 0.2, 0.2], rng, 0.82, 1, lerp(0.85, 1.15, rng()), lerp(0.28, 0.5, rng()), lerp(0.82, 1, rng()), along);
    if (!built || coversSeam(built.p)) return null;
    return built;
  }
  if (name === "coreChest") {
    return takeEllipsoid([-0.42, 0.26, 0.02], [0.32, 0.22, 0.18], rng, 0.3, 0.72, lerp(0.55, 0.8, rng()), lerp(0.5, 0.75, rng()), lerp(0.45, 0.65, rng()), along);
  }
  if (name === "shellChest") {
    const built = takeEllipsoid([-0.42, 0.26, 0.02], [0.32, 0.22, 0.18], rng, 0.82, 1, lerp(0.85, 1.15, rng()), lerp(0.28, 0.5, rng()), lerp(0.82, 1, rng()), along);
    if (!built || coversSeam(built.p)) return null;
    return built;
  }
  if (name === "coreHaunch") {
    return takeEllipsoid([0.46, 0.24, 0.02], [0.3, 0.24, 0.17], rng, 0.3, 0.72, lerp(0.55, 0.85, rng()), lerp(0.5, 0.78, rng()), lerp(0.45, 0.66, rng()), along);
  }
  if (name === "shellHaunch") {
    const built = takeEllipsoid([0.46, 0.24, 0.02], [0.3, 0.24, 0.17], rng, 0.82, 1, lerp(0.9, 1.2, rng()), lerp(0.28, 0.5, rng()), lerp(0.82, 1, rng()), along);
    if (!built || coversSeam(built.p)) return null;
    return built;
  }
  if (name === "neck") {
    const s = sampleCapsule([-0.78, 0.58, 0.03], [-0.16, 0.4, 0.02], 0.145, rng);
    return { ...s, length: lerp(0.9, 1.25, rng()), rough: lerp(0.32, 0.55, rng()), ao: lerp(0.75, 1, rng()), width: 0.8, thin: 0.62, seamFlag: 0 };
  }
  if (name === "head") {
    return takeEllipsoid([-0.92, 0.58, 0.03], [0.24, 0.17, 0.16], rng, 0.4, 1, lerp(0.62, 0.95, rng()), lerp(0.28, 0.5, rng()), lerp(0.78, 1, rng()), along);
  }
  if (name === "snout") {
    return takeEllipsoid([-1.22, 0.5, 0.04], [0.3, 0.1, 0.1], rng, 0.35, 1, lerp(0.7, 1.05, rng()), lerp(0.24, 0.45, rng()), lerp(0.84, 1, rng()), along);
  }
  if (name === "brow") {
    return takeEllipsoid([-0.98, 0.7, 0.06], [0.12, 0.07, 0.1], rng, 0.4, 1, lerp(0.6, 0.9, rng()), lerp(0.35, 0.6, rng()), 0.9, () => norm([-0.4, 0.9, 0.1]));
  }
  if (name === "earNear") {
    const s = sampleCone([-0.84, 0.74, 0.1], [-0.76, 1.16, 0.12], 0.09, rng);
    return { p: s.p, tangent: s.tangent, normal: s.normal, length: lerp(1.15, 1.75, rng()), rough: lerp(0.25, 0.48, rng()), ao: 1, width: 0.7, thin: 0.65, seamFlag: 0 };
  }
  if (name === "earFar") {
    const s = sampleCone([-0.78, 0.7, -0.08], [-0.74, 1.0, -0.1], 0.065, rng);
    return { p: s.p, tangent: s.tangent, normal: s.normal, length: lerp(1.0, 1.45, rng()), rough: lerp(0.3, 0.55, rng()), ao: 0.85, width: 0.7, thin: 0.65, seamFlag: 0 };
  }
  if (name === "legFL") {
    const s = sampleCapsule([-0.48, 0.2, 0.14], [-0.56, -0.8, 0.16], 0.055, rng, 0.72);
    return { ...s, length: lerp(1.35, 1.9, rng()), rough: lerp(0.28, 0.5, rng()), ao: 0.95, width: 0.62, thin: 0.5, seamFlag: 0 };
  }
  if (name === "legFR") {
    const s = sampleCapsule([-0.28, 0.18, -0.12], [-0.22, -0.78, -0.14], 0.046, rng, 0.72);
    return { ...s, length: lerp(1.25, 1.75, rng()), rough: lerp(0.3, 0.55, rng()), ao: 0.86, width: 0.6, thin: 0.48, seamFlag: 0 };
  }
  if (name === "legHL") {
    const bend = rng() < 0.55;
    const s = bend
      ? sampleCapsule([0.48, 0.2, 0.13], [0.66, -0.28, 0.15], 0.06, rng, 0.72)
      : sampleCapsule([0.66, -0.28, 0.15], [0.5, -0.8, 0.16], 0.048, rng, 0.72);
    return { ...s, length: lerp(1.3, 1.85, rng()), rough: lerp(0.28, 0.52, rng()), ao: 0.92, width: 0.62, thin: 0.5, seamFlag: 0 };
  }
  if (name === "legHR") {
    const bend = rng() < 0.55;
    const s = bend
      ? sampleCapsule([0.3, 0.18, -0.11], [0.42, -0.3, -0.13], 0.05, rng, 0.72)
      : sampleCapsule([0.42, -0.3, -0.13], [0.28, -0.78, -0.14], 0.042, rng, 0.72);
    return { ...s, length: lerp(1.2, 1.7, rng()), rough: lerp(0.32, 0.55, rng()), ao: 0.82, width: 0.6, thin: 0.48, seamFlag: 0 };
  }
  if (name === "paws") {
    const paws: { c: V3; r: V3 }[] = [
      { c: [-0.6, -0.8, 0.16], r: [0.09, 0.035, 0.05] },
      { c: [-0.2, -0.78, -0.14], r: [0.075, 0.03, 0.042] },
      { c: [0.46, -0.8, 0.16], r: [0.1, 0.038, 0.055] },
      { c: [0.26, -0.78, -0.14], r: [0.08, 0.032, 0.045] },
    ];
    const paw = paws[Math.floor(rng() * paws.length)];
    const s = sampleEllipsoid(paw.c, paw.r, rng, 0.4, 1);
    return { p: s.p, tangent: [1, 0, 0.1], normal: s.normal, length: lerp(0.45, 0.75, rng()), rough: 0.6, ao: 0.7, width: 1.3, thin: 0.45, seamFlag: 0 };
  }
  if (name === "tail") {
    const t = rng();
    const frame = tailAt(t);
    const helper: V3 = Math.abs(frame.tangent[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
    const n = norm(cross(frame.tangent, helper));
    const bin = cross(frame.tangent, n);
    const ang = rng() * Math.PI * 2;
    const rad = frame.radius * (0.25 + rng() * 0.8);
    const radial = add(scl(n, Math.cos(ang) * rad), scl(bin, Math.sin(ang) * rad));
    const p = add(frame.p, radial);
    const tip = t > 0.72;
    return {
      p,
      tangent: frame.tangent,
      normal: len(radial) > 1e-4 ? norm(radial) : n,
      length: tip ? lerp(1.2, 1.8, rng()) : lerp(0.8, 1.25, rng()),
      rough: lerp(0.3, 0.55, rng()),
      ao: lerp(0.75, 1, rng()),
      width: 0.75,
      thin: 0.6,
      seamFlag: 0,
    };
  }
  if (name === "ruff") {
    const s = sampleEllipsoid([-0.7, 0.58, 0.04], [0.2, 0.16, 0.12], rng, 0.85, 1.02);
    const pushed = add(s.p, scl(s.normal, 0.012 + rng() * 0.02));
    if (coversSeam(pushed)) return null;
    return {
      p: pushed,
      tangent: norm(add(s.normal, [0, 0.35, 0])),
      normal: s.normal,
      length: lerp(0.7, 1.05, rng()),
      rough: lerp(0.22, 0.42, rng()),
      ao: 1,
      width: 0.62,
      thin: 0.5,
      seamFlag: 0,
    };
  }
  if (name === "contour") {
    const parts: { c: V3; r: V3 }[] = [
      { c: [-0.02, 0.3, 0], r: [0.64, 0.2, 0.2] },
      { c: [-0.42, 0.26, 0.02], r: [0.32, 0.22, 0.18] },
      { c: [0.46, 0.24, 0.02], r: [0.3, 0.24, 0.17] },
    ];
    for (let attempt = 0; attempt < 8; attempt++) {
      const part = parts[Math.floor(rng() * parts.length)];
      const s = sampleEllipsoid(part.c, part.r, rng, 0.96, 1.02);
      if (Math.abs(s.normal[2]) > 0.48) continue;
      const outward: V3 = norm([s.normal[0], s.normal[1], 0]);
      const p = add(s.p, scl(outward, 0.008 + rng() * 0.02));
      if (coversSeam(p)) continue;
      return {
        p,
        tangent: outward,
        normal: outward,
        length: lerp(0.55, 0.95, rng()),
        rough: lerp(0.18, 0.4, rng()),
        ao: 1,
        width: 0.55,
        thin: 0.42,
        seamFlag: 0,
      };
    }
    return null;
  }
  if (name === "seam") {
    const t = rng();
    const i = Math.min(SEAM_PTS.length - 2, Math.floor(t * (SEAM_PTS.length - 1)));
    const f = t * (SEAM_PTS.length - 1) - i;
    const p = add(SEAM_PTS[i], scl(sub(SEAM_PTS[i + 1], SEAM_PTS[i]), f));
    p[0] += (rng() - 0.5) * 0.01;
    p[1] += (rng() - 0.5) * 0.008;
    p[2] = 0.145 + (rng() - 0.5) * 0.012;
    const tangent = norm(sub(SEAM_PTS[Math.min(i + 1, SEAM_PTS.length - 1)], SEAM_PTS[i]));
    return {
      p,
      tangent,
      normal: [0, 0, 1],
      length: lerp(1.15, 1.55, rng()),
      rough: 0.22,
      ao: 1,
      width: 0.85,
      thin: 0.7,
      seamFlag: 1,
    };
  }
  return null;
}

export function sampleSwarm(count: number, seed = SWARM_SEED): Shard[] {
  const rng = mulberry32(seed);
  const quotas = allocate(count);
  const shards: Shard[] = [];
  for (let part = 0; part < WEIGHTS.length; part++) {
    let made = 0;
    let guard = 0;
    while (made < quotas[part] && guard < quotas[part] * 24) {
      guard += 1;
      const built = buildOne(WEIGHTS[part].name, rng);
      if (!built) continue;
      shards.push(finish(built, rng));
      made += 1;
    }
  }
  while (shards.length < count) {
    const built = buildOne("shellTorso", rng);
    if (!built) continue;
    shards.push(finish(built, rng));
  }
  return shards.slice(0, count);
}

export function asciiSilhouette(shards: { home: V3 }[], cols = 72, rows = 32) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of shards) {
    minX = Math.min(minX, s.home[0]);
    maxX = Math.max(maxX, s.home[0]);
    minY = Math.min(minY, s.home[1]);
    maxY = Math.max(maxY, s.home[1]);
  }
  const grid = Array.from({ length: rows }, () => Array(cols).fill(" "));
  const occ = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (const s of shards) {
    const x = Math.floor(((s.home[0] - minX) / Math.max(1e-6, maxX - minX)) * (cols - 1));
    const y = Math.floor(((s.home[1] - minY) / Math.max(1e-6, maxY - minY)) * (rows - 1));
    const row = rows - 1 - y;
    occ[row][x] += 1;
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n = occ[y][x];
      grid[y][x] = n > 8 ? "#" : n > 2 ? "+" : n > 0 ? "." : " ";
    }
  }
  return { text: grid.map((row) => row.join("")).join("\n"), minX, maxX, minY, maxY, occ };
}

export function gridForWidth(width: number) {
  return width < 760 ? MOBILE_GRID : DESKTOP_GRID;
}

export function countForWidth(width: number) {
  const grid = gridForWidth(width);
  return grid.x * grid.y;
}
