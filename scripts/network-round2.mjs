import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const out = "/opt/cursor/artifacts/network";
const stillDir = "/tmp/network-spec/refs/stills";
const times = [6, 9, 12, 15, 20, 24.1, 31, 34, 44, 52, 60];
const stillName = {
  6: "t06.png",
  9: "t09.png",
  15: "t15.png",
  24.1: "t24.png",
  34: "t34.png",
  44: "t44.png",
  52: "t52.png",
  60: "t60.png",
};

await mkdir(out, { recursive: true });

function idOf(t) {
  return String(t).replace(".", "_");
}

async function mae(shot, still) {
  const a = await sharp(shot).resize(960, 600, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const b = await sharp(still).resize(960, 600, { fit: "fill" }).removeAlpha().raw().toBuffer();
  let sum = 0;
  let max = 0;
  const diff = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    if (d > max) max = d;
    diff[i] = Math.min(255, d * 8);
  }
  return { mean: sum / a.length, max, diff };
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

async function shoot({ width, height, mobile, ui }) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
  const q = new URLSearchParams({ shot: "1", t: "6", w: String(width), h: String(height), src: "ktx" });
  if (mobile) q.set("mobile", "1");
  if (ui) q.set("ui", "1");
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__network && window.__network.done, null, { timeout: 240000 });
  const prefix = ui ? (mobile ? "ui-m" : "ui-d") : mobile ? "m" : "d";
  const frames = [];
  for (const t of times) {
    await page.evaluate((time) => window.__seek(time), t);
    if (ui) {
      await page.waitForFunction(
        (time) => {
          const copy = document.querySelector(".net-copy");
          const op = copy ? Number(copy.style.opacity) : 0;
          return window.__network && Math.abs(window.__network.t - time) < 0.02 && op > 0.85;
        },
        t,
        { timeout: 20000 },
      );
    }
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = `${out}/${prefix}-t${idOf(t)}.png`;
    if (ui) await page.screenshot({ path: file });
    else await page.locator("canvas").screenshot({ path: file });
    frames.push(file);
    console.log("shot", prefix, t);
  }
  const report = await page.evaluate(() => window.__network);
  await page.close();
  return { report, frames };
}

const desktop = await shoot({ width: 1440, height: 900, mobile: false, ui: false });
const mobile = await shoot({ width: 390, height: 844, mobile: true, ui: false });
const uiDesktop = await shoot({ width: 1440, height: 900, mobile: false, ui: true });
const uiMobile = await shoot({ width: 390, height: 844, mobile: true, ui: true });

const stats = [];
for (const t of times) {
  const id = idOf(t);
  if (!stillName[t]) continue;
  const score = await mae(`${out}/d-t${id}.png`, `${stillDir}/${stillName[t]}`);
  const diffPng = await sharp(score.diff, { raw: { width: 960, height: 600, channels: 3 } }).png().toBuffer();
  const panels = await Promise.all([
    sharp(`${stillDir}/${stillName[t]}`).resize(960, 600, { fit: "fill" }).png().toBuffer(),
    sharp(`${out}/d-t${id}.png`).resize(960, 600, { fit: "fill" }).png().toBuffer(),
    diffPng,
  ]);
  await sharp({ create: { width: 2880, height: 600, channels: 3, background: "#E4D8C4" } })
    .composite(panels.map((input, i) => ({ input, left: i * 960, top: 0 })))
    .png()
    .toFile(`${out}/compare-t${id}-desktop.png`);
  stats.push({ t, mean: score.mean, max: score.max, still: stillName[t] });
  console.log("mae", t, score.mean.toFixed(2));
}

const thumbs = [];
for (const t of times) {
  thumbs.push(await sharp(`${out}/ui-d-t${idOf(t)}.png`).resize(320, 200, { fit: "fill" }).png().toBuffer());
}
await sharp({ create: { width: 320 * thumbs.length, height: 200, channels: 3, background: "#E4D8C4" } })
  .composite(thumbs.map((input, i) => ({ input, left: i * 320, top: 0 })))
  .png()
  .toFile(`${out}/strip-desktop.png`);

const streamPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const streamQ = new URLSearchParams({ shot: "1", stream: "1", t: "6", w: "1440", h: "900", src: "ktx" });
await streamPage.goto(`${base}?${streamQ}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await streamPage.waitForFunction(() => window.__network && window.__network.done, null, { timeout: 240000 });
const stream = [];
for (const t of [6, 24, 34, 52]) {
  await streamPage.evaluate((time) => window.__seek(time), t);
  await streamPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const row = await streamPage.evaluate(() => ({ t: window.__network.t, mem: window.__network.mem, resident: window.__network.resident }));
  stream.push(row);
  console.log("stream", JSON.stringify(row));
}
await streamPage.close();

const throttled = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const client = await throttled.context().newCDPSession(throttled);
await client.send("Network.enable");
await client.send("Network.setCacheDisabled", { cacheDisabled: true });
await client.send("Network.emulateNetworkConditions", {
  offline: false,
  downloadThroughput: (1.6 * 1000 * 1000) / 8,
  uploadThroughput: (750 * 1000) / 8,
  latency: 150,
});
const navStart = Date.now();
await throttled.goto(base, { waitUntil: "domcontentloaded", timeout: 180000 });
await throttled.waitForFunction(() => window.__boot && window.__boot.first3d > 0, null, { timeout: 240000 });
const boot = await throttled.evaluate(() => window.__boot);
console.log("boot", JSON.stringify(boot), "wall", Date.now() - navStart);
await throttled.close();
await browser.close();

const list = times.map((t) => `file '${out}/ui-d-t${idOf(t)}.png'`).join("\n");
await writeFile("/tmp/strip-list.txt", list);
await writeFile(
  `${out}/numbers.json`,
  JSON.stringify({ desktop: desktop.report, mobile: mobile.report, uiDesktop: uiDesktop.report, uiMobile: uiMobile.report, stats, stream, boot }, null, 2),
);
console.log("ROUND2_DONE");
