/**
 * Peregrine-type hawk sampled from the CC0 rough-legged buzzard scan.
 * Positions and normals live in public/lab/swarm/falcon.bin. See ASSETS.md.
 * Shards point out along the surface normal, with a tilt wide enough that neighbours separate.
 */

export const SWARM_SEED = 11;
export const DESKTOP_GRID = { x: 128, y: 96 };
export const MOBILE_GRID = { x: 80, y: 64 };
export const BAKE_MAGIC = 0x434c4146;

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
  wing: number;
};

type Rng = () => number;

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
function scl(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
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

function tilt(normal: V3, rng: Rng): V3 {
  const helper: V3 = Math.abs(normal[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const bitangent = norm(cross(normal, helper));
  const tangent = norm(cross(normal, bitangent));
  const a = (rng() * 2 - 1) * 0.3;
  const c = (rng() * 2 - 1) * 0.3;
  return norm(add(normal, add(scl(bitangent, a), scl(tangent, c))));
}

export function shardsFromBake(buffer: ArrayBuffer, count: number, seed = SWARM_SEED): Shard[] {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== BAKE_MAGIC) throw new Error("bad falcon bake");
  const baked = view.getUint32(8, true);
  if (baked < 1) throw new Error("empty falcon bake");
  const rng = mulberry32(seed);
  const shards: Shard[] = [];
  for (let i = 0; i < count; i++) {
    const index = count >= baked ? i % baked : Math.min(baked - 1, Math.floor(((i + 0.5) * baked) / count));
    const o = 16 + index * 32;
    const home: V3 = [view.getFloat32(o, true), view.getFloat32(o + 4, true), view.getFloat32(o + 8, true)];
    const normal = norm([view.getFloat32(o + 12, true), view.getFloat32(o + 16, true), view.getFloat32(o + 20, true)]);
    const length = view.getFloat32(o + 24, true);
    const seamFlag = view.getUint8(o + 28) > 0 ? 1 : 0;
    const wing = view.getUint8(o + 29) > 0 ? 1 : 0;
    const fromRight = rng() < 0.78;
    const origin: V3 = fromRight
      ? [home[0] + 2.5 + rng() * 1.7, home[1] + (rng() - 0.35) * 1.5, home[2] + (rng() - 0.5) * 0.8]
      : [home[0] + (rng() - 0.4) * 2.1, home[1] + 1.9 + rng() * 1.1, home[2] + (rng() - 0.5) * 0.6];
    shards.push({
      home,
      origin,
      tangent: tilt(normal, rng),
      normal,
      seam: [home[0] * 0.18, home[1] * 0.22, home[2] * 0.18],
      seamFlag,
      length,
      rough: 0.06 + rng() * 0.2,
      twist: (rng() - 0.5) * 0.4,
      ao: 1,
      delay: rng() * 0.52,
      width: 0.78 + rng() * 0.36,
      thin: 0.42 + rng() * 0.2,
      wing,
    });
  }
  return shards;
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
