import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const out = "/opt/cursor/artifacts/network";
const times = [15, 24.1];

async function mae(aPath, bPath) {
  const a = await sharp(aPath).resize(960, 600, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const b = await sharp(bPath).resize(960, 600, { fit: "fill" }).removeAlpha().raw().toBuffer();
  let sum = 0;
  let max = 0;
  let over = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    if (d > max) max = d;
    if (d > 8) over += 1;
  }
  return { mean: sum / a.length, max, over8: over / (a.length / 3) };
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

async function grab(src) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => console.log("PAGEERROR", src, error.message));
  const q = new URLSearchParams({ shot: "1", t: "15", w: "1440", h: "900", src });
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__network && window.__network.done, null, { timeout: 240000 });
  const mem = await page.evaluate(() => window.__network.mem);
  console.log("loaded", src, JSON.stringify(mem));
  const files = {};
  for (const t of times) {
    await page.evaluate((time) => window.__seek(time), t);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = `${out}/src-${src}-t${String(t).replace(".", "_")}.png`;
    await page.locator("canvas").screenshot({ path: file });
    const report = await page.evaluate(() => window.__network);
    files[t] = file;
    console.log("shot", src, t, "mem", JSON.stringify(report.mem));
  }
  await page.close();
  return files;
}

const ktx = await grab("ktx");
const original = await grab("original");
const rows = [];
for (const t of times) {
  const score = await mae(ktx[t], original[t]);
  rows.push({ t, ...score });
  console.log("DIFF", t, score);
}
await browser.close();
console.log(JSON.stringify(rows));
