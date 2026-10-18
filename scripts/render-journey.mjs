import { chromium } from "playwright";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = "/opt/cursor/artifacts/video/journey-preview";
const desktopDir = "/tmp/journey-desktop";
const mobileDir = "/tmp/journey-mobile";
const stillsOnly = process.argv.includes("--stills");
const fps = 30;
const seconds = 48;
const desktopFrames = fps * seconds;
const mobileFrames = fps * 15;
const stationCount = 9;
const keys = [
  ["hero", 0],
  ["demo", 1],
  ["engagements", 2],
  ["how", 3],
  ["proof", 4],
  ["products", 5],
  ["partners", 6],
  ["book", 8],
];

await mkdir(root, { recursive: true });
await mkdir(`${root}/frames`, { recursive: true });
await mkdir(desktopDir, { recursive: true });
await mkdir(mobileDir, { recursive: true });

function frameFor(index) {
  return Math.round(((index + 0.5) / stationCount) * (desktopFrames - 1));
}

async function shoot(width, height, count, dir, keysOn) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => console.log("pageerror", error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("console", msg.text());
  });
  await page.goto("http://localhost:3000/lab/journey?capture=1", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction(() => window.__journey && document.fonts.status === "loaded", { timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  const started = Date.now();
  const frames = stillsOnly
    ? keys.map(([, index]) => frameFor(index)).concat([
      Math.round((5.45 / 8) * (desktopFrames - 1)),
      Math.round((6.35 / 8) * (desktopFrames - 1)),
    ])
    : [...Array(count).keys()];
  for (const frame of frames) {
    const progress = frame / (desktopFrames - 1);
    const time = (frame / fps) * 1000;
    await page.evaluate(({ progress, time }) => window.__journey.setFrame(progress, time), { progress, time });
    const key = keys.find(([, index]) => frame === frameFor(index));
    if (!stillsOnly) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 78 });
      await writeFile(`${dir}/frame-${String(frame).padStart(4, "0")}.jpg`, Buffer.from(shot.data, "base64"));
    }
    if (keysOn && key) {
      const png = await cdp.send("Page.captureScreenshot", { format: "png" });
      await writeFile(`${root}/frames/station-${key[0]}.png`, Buffer.from(png.data, "base64"));
    } else if (stillsOnly && keysOn) {
      const png = await cdp.send("Page.captureScreenshot", { format: "png" });
      await writeFile(`/tmp/journey-travel-${frame}.png`, Buffer.from(png.data, "base64"));
    }
    if (!stillsOnly && frame % 60 === 0) console.log(width, frame, `${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (stillsOnly) console.log("still", width, frame, key?.[0] ?? "travel", `${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

if (stillsOnly) {
  await shoot(1440, 900, desktopFrames, desktopDir, true);
  console.log("stills done");
  process.exit(0);
}

await shoot(1440, 900, desktopFrames, desktopDir, true);
await shoot(390, 844, mobileFrames, mobileDir, false);

const desktop = spawnSync("ffmpeg", [
  "-y", "-framerate", String(fps), "-i", `${desktopDir}/frame-%04d.jpg`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
  "-movflags", "+faststart", "-an", `${root}/journey-desktop.mp4`,
], { stdio: "inherit" });
const mobile = spawnSync("ffmpeg", [
  "-y", "-framerate", String(fps), "-i", `${mobileDir}/frame-%04d.jpg`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "veryfast",
  "-movflags", "+faststart", "-an", `${root}/journey-mobile.mp4`,
], { stdio: "inherit" });
if (desktop.status !== 0 || mobile.status !== 0) process.exit(1);
const desktopStat = await stat(`${root}/journey-desktop.mp4`);
const mobileStat = await stat(`${root}/journey-mobile.mp4`);
console.log("encoded", desktopStat.size, mobileStat.size);
process.exit(0);
