import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const root = "artifacts/swarm";
await mkdir(root, { recursive: true });

const chromeArgs = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
  "--disable-gpu-sandbox",
];

function shots(name) {
  return {
    loader: `${root}/${name}-loader.png`,
    hero: `${root}/${name}-hero.png`,
    scatter: `${root}/${name}-scatter.png`,
    pulse: `${root}/${name}-pulse.png`,
  };
}

async function waitLive(page) {
  await page.waitForFunction(() => window.__SWARM__ && window.__SWARM__.phase === "live", null, { timeout: 45000 });
  await page.waitForTimeout(700);
}

async function runSequence(page, box) {
  const file = shots(box.name);
  await page.goto("http://localhost:4173/lab/swarm", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => (document.querySelector(".swarm-readout")?.textContent || "").includes("routing"),
    null,
    { timeout: 12000 },
  );
  const loader = await page.evaluate(() => ({
    text: document.querySelector(".swarm-readout")?.textContent || "",
    bar: getComputedStyle(document.querySelector(".swarm-hairline span")).transform,
  }));
  await page.screenshot({ path: file.loader });
  await waitLive(page);
  await page.screenshot({ path: file.hero });

  const aim = await page.evaluate(() => window.__SWARM__.aim);
  const sweep = {
    x0: Math.max(16, aim.x - box.half),
    x1: Math.min(box.width - 16, aim.x + box.half),
    y: Math.max(48, aim.y - 28),
  };
  await page.mouse.move(sweep.x0, sweep.y);
  for (let i = 1; i <= 7; i++) {
    await page.mouse.move(sweep.x0 + ((sweep.x1 - sweep.x0) * i) / 14, sweep.y + Math.sin(i) * 14, { steps: 2 });
  }
  await page.waitForTimeout(240);
  await page.screenshot({ path: file.scatter });
  for (let i = 8; i <= 14; i++) {
    await page.mouse.move(sweep.x0 + ((sweep.x1 - sweep.x0) * i) / 14, sweep.y + Math.sin(i) * 10, { steps: 2 });
  }
  await page.mouse.click(aim.x, aim.y);
  await page.waitForFunction(() => {
    const pulse = window.__SWARM__ && window.__SWARM__.pulse;
    return typeof pulse === "number" && pulse > 0.05 && pulse < 0.58;
  }, null, { timeout: 8000 });
  await page.screenshot({ path: file.pulse });
  await page.mouse.wheel(0, 520);
  await page.waitForTimeout(700);
  await page.mouse.wheel(0, -520);
  await page.waitForTimeout(500);

  return { loader, state: await readStats(page) };
}

async function readStats(page) {
  return page.evaluate(() => {
    const swarm = window.__SWARM__;
    const frames = swarm?.frames ? [...swarm.frames] : [];
    const sorted = [...frames].sort((a, b) => a - b);
    const avg = frames.reduce((sum, value) => sum + value, 0) / Math.max(1, frames.length);
    return {
      phase: swarm?.phase,
      count: swarm?.count,
      dpr: swarm?.dpr,
      grid: swarm?.grid,
      renderer: swarm?.renderer,
      fps: swarm?.fps,
      sampleMs: swarm?.sampleMs,
      error: swarm?.error,
      frameCount: frames.length,
      avgFrameMs: avg,
      p50FrameMs: sorted[Math.floor(sorted.length * 0.5)] ?? null,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? null,
      maxFrameMs: sorted.at(-1) ?? null,
    };
  });
}

const browser = await chromium.launch({ channel: "chrome", args: chromeArgs });
const logs = [];
const perf = {};

const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: process.env.STILLS_ONLY ? undefined : { dir: "/tmp/swarm-video", size: { width: 1440, height: 900 } },
});
const desktopPage = await desktop.newPage();
desktopPage.on("pageerror", (error) => logs.push(`desktop ${error.message}`));
desktopPage.on("console", (msg) => {
  if (msg.type() === "error") logs.push(`desktop ${msg.text()}`);
});
perf.desktop = await runSequence(desktopPage, {
  name: "1440",
  width: 1440,
  half: 190,
});
if (!process.env.STILLS_ONLY) {
  const video = desktopPage.video();
  await desktopPage.close();
  await video.saveAs(`${root}/swarm-1440.webm`);
}
await desktop.close();

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: process.env.STILLS_ONLY ? undefined : { dir: "/tmp/swarm-video", size: { width: 390, height: 844 } },
  hasTouch: true,
});
const mobilePage = await mobile.newPage();
mobilePage.on("pageerror", (error) => logs.push(`mobile ${error.message}`));
perf.mobile = await runSequence(mobilePage, {
  name: "390",
  width: 390,
  half: 80,
});
if (!process.env.STILLS_ONLY) {
  const video = mobilePage.video();
  await mobilePage.close();
  await video.saveAs(`${root}/swarm-390.webm`);
}
await mobile.close();

const hi = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const hiPage = await hi.newPage();
await hiPage.goto("http://localhost:4173/lab/swarm", { waitUntil: "domcontentloaded" });
await hiPage.waitForFunction(() => window.__SWARM__ && window.__SWARM__.phase === "live" && window.__SWARM__.count > 0, null, { timeout: 45000 });
perf.dprCap = await hiPage.evaluate(() => ({ dpr: window.__SWARM__.dpr, count: window.__SWARM__.count }));
await hi.close();

const posterPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await posterPage.goto("http://localhost:4173/lab/swarm", { waitUntil: "domcontentloaded" });
await waitLive(posterPage);
await posterPage.evaluate(() => {
  for (const selector of [".swarm-hero", ".swarm-sound", ".swarm-next", ".swarm-grain", ".swarm-loader"]) {
    const node = document.querySelector(selector);
    if (node) node.style.display = "none";
  }
});
await posterPage.waitForTimeout(200);
const raw = await posterPage.screenshot({ type: "png" });
await posterPage.close();

let quality = 68;
let poster = await sharp(raw).webp({ quality }).toBuffer();
while (poster.length > 200 * 1024 && quality > 32) {
  quality -= 6;
  poster = await sharp(raw).webp({ quality }).toBuffer();
}
await writeFile("public/lab/swarm/poster.webp", poster);
perf.poster = { bytes: poster.length, quality };

const still = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const stillPage = await still.newPage();
await stillPage.goto("http://localhost:4173/lab/swarm", { waitUntil: "networkidle" });
await stillPage.waitForTimeout(500);
await stillPage.screenshot({ path: `${root}/1440-reduced-motion.png` });
perf.reduced = await stillPage.evaluate(() => ({
  className: document.querySelector(".swarm")?.className,
  canvas: getComputedStyle(document.querySelector(".swarm-canvas")).display,
  loader: getComputedStyle(document.querySelector(".swarm-loader")).display,
}));
await still.close();
await browser.close();

perf.logs = logs;
await writeFile(`${root}/perf.json`, JSON.stringify(perf, null, 2));
console.log(JSON.stringify(perf, null, 2));
