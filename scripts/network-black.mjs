import { inflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

function samplePng(png) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let color = 2;
  const parts = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.subarray(pos + 4, pos + 8).toString();
    const chunk = png.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      color = chunk[9];
    } else if (type === "IDAT") parts.push(chunk);
    else if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const bpp = color === 6 ? 4 : 3;
  const stride = width * bpp;
  let prev = Buffer.alloc(stride);
  let i = 0;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const filter = raw[i];
    i += 1;
    const row = Buffer.from(raw.subarray(i, i + stride));
    i += stride;
    if (filter === 1) {
      for (let x = 0; x < stride; x += 1) row[x] = (row[x] + (x >= bpp ? row[x - bpp] : 0)) & 255;
    } else if (filter === 2) {
      for (let x = 0; x < stride; x += 1) row[x] = (row[x] + prev[x]) & 255;
    } else if (filter === 3) {
      for (let x = 0; x < stride; x += 1) row[x] = (row[x] + (((x >= bpp ? row[x - bpp] : 0) + prev[x]) >> 1)) & 255;
    } else if (filter === 4) {
      const paeth = (a, b, c) => {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      };
      for (let x = 0; x < stride; x += 1) {
        const a = x >= bpp ? row[x - bpp] : 0;
        const b = prev[x];
        const c = x >= bpp ? prev[x - bpp] : 0;
        row[x] = (row[x] + paeth(a, b, c)) & 255;
      }
    }
    prev = row;
    rows.push(row);
  }
  const grid = [];
  for (let row = 1; row <= 6; row += 1) {
    for (let col = 1; col <= 8; col += 1) {
      const x = Math.min(width - 1, Math.floor((col / 9) * width));
      const y = Math.min(height - 1, Math.floor((row / 7) * height));
      const index = x * bpp;
      grid.push([rows[y][index], rows[y][index + 1], rows[y][index + 2]]);
    }
  }
  return grid;
}

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const out = "/opt/cursor/artifacts/network/round6/black-frames.json";
const views = [
  { id: "desktop", width: 1440, height: 900, query: "" },
  { id: "desktop-shot", width: 1440, height: 900, query: "shot=1&ui=1&src=ktx&w=1440&h=900&t=8" },
  { id: "mobile", width: 390, height: 844, query: "" },
  { id: "mobile-shot", width: 390, height: 844, query: "shot=1&ui=1&src=ktx&mobile=1&w=390&h=844&t=8" },
];

function nearBlack(samples) {
  if (!samples.length) return true;
  const dark = samples.filter((sample) => sample[0] < 18 && sample[1] < 18 && sample[2] < 18).length;
  return dark / samples.length > 0.35;
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

const report = [];
for (const view of views) {
  const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
  page.on("pageerror", (error) => console.log(view.id, "PAGEERROR", error.message));
  const url = view.query ? `${base}?${view.query}` : base;
  console.log("open", view.id);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.evaluate(() => {
    const start = performance.now();
    const host = window;
    host.__pixelLog = [];
    const tick = () => {
      const ms = performance.now() - start;
      if (ms > 20000) return;
      const poster = document.querySelector(".net-poster");
      const opacity = poster ? Number(getComputedStyle(poster).opacity) : 1;
      let shot = [];
      if (typeof host.__pixels === "function") {
        try {
          shot = host.__pixels();
        } catch {
          shot = [];
        }
      }
      host.__pixelLog.push({ ms: Math.round(ms), opacity, shot });
    };
    tick();
    host.__pixelTimer = setInterval(tick, 250);
  });
  await page.waitForTimeout(20500);
  const log = await page.evaluate(() => {
    clearInterval(window.__pixelTimer);
    return window.__pixelLog || [];
  });
  const png = await page.screenshot({ type: "png" });
  const shownDark = nearBlack(samplePng(png));
  let failed = shownDark;
  let gap = 0;
  let prev = 0;
  const badFrames = [];
  for (const sample of log) {
    gap = Math.max(gap, sample.ms - prev);
    prev = sample.ms;
    const canvasDark = sample.shot.length > 0 && nearBlack(sample.shot);
    const covered = sample.opacity >= 0.85;
    const bad = (canvasDark && !covered) || (shownDark && sample.ms > 18000);
    if (bad) {
      failed = true;
      badFrames.push({ ms: sample.ms, poster: sample.opacity, canvasDark });
    }
    if (sample.ms % 2000 < 260) console.log(view.id, sample.ms, "poster", sample.opacity.toFixed(2), "canvas", canvasDark, "n", sample.shot.length);
  }
  report.push({ id: view.id, failed, frames: badFrames, samples: log.length, dark: badFrames.length, maxGapMs: gap, endShownDark: shownDark });
  console.log(view.id, failed ? "FAIL" : "PASS", "dark", report.at(-1).dark);
  await page.close();
}

await writeFile(out, JSON.stringify(report, null, 2));
await browser.close();
const failed = report.filter((row) => row.failed);
if (failed.length) {
  console.log("BLACK FRAMES", JSON.stringify(failed.map((row) => ({ id: row.id, dark: row.dark, first: row.frames[0] }))));
  process.exit(1);
}
console.log("black-frame check passed");
