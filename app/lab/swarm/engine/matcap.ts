import * as THREE from "three";

function clamp(v: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

function paint(size: number, rough: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("matcap canvas unavailable");
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const light = normalize([-0.32, 0.62, 0.72]);
  const view = [0, 0, 1];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = 1 - ((y + 0.5) / size) * 2;
      const i = (y * size + x) * 4;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) {
        data[i] = 17;
        data[i + 1] = 19;
        data[i + 2] = 21;
        data[i + 3] = 255;
        continue;
      }
      const nz = Math.sqrt(1 - r2);
      const ndl = clamp(nx * light[0] + ny * light[1] + nz * light[2]);
      const wrap = ndl * 0.55 + 0.45;
      const hx = light[0] + view[0];
      const hy = light[1] + view[1];
      const hz = light[2] + view[2];
      const hl = Math.hypot(hx, hy, hz) || 1;
      const spec = clamp(nx * (hx / hl) + ny * (hy / hl) + nz * (hz / hl)) ** (rough ? 18 : 90);
      const rim = (1 - nz) ** (rough ? 1.8 : 2.8);
      const body = 0.1 + 0.11 * wrap ** 0.8;
      let r = body;
      let g = body + 0.003;
      let b = body + 0.006;
      const specGain = rough ? 0.1 : 0.48;
      r += 0.72 * spec * specGain;
      g += 0.74 * spec * specGain;
      b += 0.76 * spec * specGain;
      const rimGain = rough ? 0.16 : 0.42;
      r += 0.5 * rim * rimGain;
      g += 0.52 * rim * rimGain;
      b += 0.54 * rim * rimGain;
      r += 0.025 * clamp(ny * 0.5 + 0.5);
      g += 0.026 * clamp(ny * 0.5 + 0.5);
      b += 0.028 * clamp(ny * 0.5 + 0.5);
      data[i] = Math.round(clamp(r) * 255);
      data[i + 1] = Math.round(clamp(g) * 255);
      data[i + 2] = Math.round(clamp(b) * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function normalize(v: number[]) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function createMatcaps() {
  return {
    sharp: paint(256, false),
    broad: paint(256, true),
  };
}
