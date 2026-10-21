import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { sampleSwarm, SWARM_SEED, type V3 } from "../app/lab/swarm/engine/creature.ts";
import { frameFor } from "../app/lab/swarm/engine/frame.ts";

const width = 1440;
const height = 900;

function project(point: V3) {
  const frame = frameFor(width, height);
  const c = Math.cos(frame.yaw);
  const s = Math.sin(frame.yaw);
  const x0 = point[0] * frame.scale;
  const y0 = point[1] * frame.scale;
  const z0 = point[2] * frame.scale;
  const x = x0 * c + z0 * s + frame.x;
  const y = y0 + frame.y;
  const z = -x0 * s + z0 * c;
  const focal = 1 / Math.tan((frame.fov * Math.PI) / 360);
  const depth = Math.max(0.2, frame.camZ - z);
  const ndcX = ((x - frame.lookX) * focal) / depth / (width / height);
  const ndcY = ((y - frame.lookY) * focal) / depth;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (1 - (ndcY * 0.5 + 0.5)) * height,
  };
}

function plot(data: Uint8Array, x: number, y: number, r: number, g: number, b: number, a: number) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
  const o = (iy * width + ix) * 4;
  const keep = 1 - a;
  data[o] = Math.round(data[o] * keep + r * a);
  data[o + 1] = Math.round(data[o + 1] * keep + g * a);
  data[o + 2] = Math.round(data[o + 2] * keep + b * a);
  data[o + 3] = 255;
}

const shards = sampleSwarm(24000, SWARM_SEED);
const data = new Uint8Array(width * height * 4);
for (let i = 0; i < data.length; i += 4) {
  const y = Math.floor(i / 4 / width) / height;
  const shade = 16 + Math.round((1 - y) * 6);
  data[i] = shade;
  data[i + 1] = shade + 1;
  data[i + 2] = shade + 2;
  data[i + 3] = 255;
}

for (const shard of shards) {
  const length = 10 + shard.length * 16;
  const end = project(shard.home);
  const tip = project([
    shard.home[0] + shard.tangent[0] * shard.length * 0.09,
    shard.home[1] + shard.tangent[1] * shard.length * 0.09,
    shard.home[2] + shard.tangent[2] * shard.length * 0.09,
  ]);
  const dx = tip.x - end.x;
  const dy = tip.y - end.y;
  const mag = Math.hypot(dx, dy) || 1;
  const light = Math.max(0.25, Math.min(1, shard.normal[1] * 0.35 + shard.normal[2] * 0.8 + 0.45));
  const steps = Math.max(2, Math.round(length));
  for (let step = 0; step < steps; step++) {
    const t = step / (steps - 1);
    const x = end.x + (dx / mag) * t * length;
    const y = end.y + (dy / mag) * t * length;
    if (shard.seamFlag > 0.5) plot(data, x, y, 216, 100, 62, 0.9);
    else plot(data, x, y, 28 + light * 70, 30 + light * 72, 33 + light * 74, 0.55);
  }
}

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const nx = (x / width - 0.68) / 0.55;
    const ny = (y / height - 0.46) / 0.62;
    const v = Math.min(1, nx * nx + ny * ny);
    const o = (y * width + x) * 4;
    const dim = 1 - v * 0.28;
    data[o] = Math.round(data[o] * dim);
    data[o + 1] = Math.round(data[o + 1] * dim);
    data[o + 2] = Math.round(data[o + 2] * dim);
  }
}

await mkdir("public/lab/swarm", { recursive: true });
let quality = 68;
let webp = await sharp(data, { raw: { width, height, channels: 4 } }).webp({ quality }).toBuffer();
while (webp.length > 200 * 1024 && quality > 28) {
  quality -= 6;
  webp = await sharp(data, { raw: { width, height, channels: 4 } }).webp({ quality }).toBuffer();
}
await writeFile("public/lab/swarm/poster.webp", webp);

const grain = Buffer.alloc(128 * 128);
for (let i = 0; i < grain.length; i++) grain[i] = 118 + Math.round((Math.random() - 0.5) * 70);
const grainPng = await sharp(grain, { raw: { width: 128, height: 128, channels: 1 } }).png().toBuffer();
await writeFile("public/lab/swarm/grain.png", grainPng);
console.log(`poster ${webp.length} bytes q${quality}; grain ${grainPng.length} bytes`);
