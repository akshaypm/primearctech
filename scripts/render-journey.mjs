import { chromium } from "playwright";
import { mkdir, writeFile, stat, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = "/opt/cursor/artifacts/video/journey-preview-v2";
const desktopDir = "/tmp/journey-v2-desktop";
const mobileDir = "/tmp/journey-v2-mobile";
const stillsOnly = process.argv.includes("--stills");
const fps = 30;
const mobileSeconds = 20;

await rm(desktopDir, { recursive: true, force: true });
await rm(mobileDir, { recursive: true, force: true });
await mkdir(root, { recursive: true });
await mkdir(`${root}/frames`, { recursive: true });
await mkdir(desktopDir, { recursive: true });
await mkdir(mobileDir, { recursive: true });

async function shoot(width, height, count, desktopFrames, dir, marks) {
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
  const frameOf = new Map(marks.map((mark) => [Math.round(mark.progress * (desktopFrames - 1)), mark]));
  const frames = stillsOnly ? [...frameOf.keys()].sort((a, b) => a - b) : [...Array(count).keys()];
  const started = Date.now();
  for (const frame of frames) {
    const progress = frame / (desktopFrames - 1);
    const time = (frame / fps) * 1000;
    await page.evaluate(({ progress, time }) => window.__journey.setFrame(progress, time), { progress, time });
    const mark = frameOf.get(frame);
    if (!stillsOnly) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 76 });
      await writeFile(`${dir}/frame-${String(frame).padStart(4, "0")}.jpg`, Buffer.from(shot.data, "base64"));
    }
    if (mark) {
      const png = await cdp.send("Page.captureScreenshot", { format: "png" });
      const prefix = width < 700 ? "mobile" : "desktop";
      await writeFile(`${root}/frames/${prefix}-${mark.kind}-${mark.id}.png`, Buffer.from(png.data, "base64"));
    }
    if (!stillsOnly && frame % 60 === 0) console.log(width, frame, `${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (stillsOnly) console.log("still", width, frame, mark?.id ?? "", `${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => console.log("pageerror", error.message));
await page.goto("http://localhost:3000/lab/journey?capture=1", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => window.__journey, { timeout: 45000 });
const meta = await page.evaluate(() => ({ seconds: window.__journey.seconds, marks: window.__journey.marks }));
await page.close();
await browser.close();
console.log("seconds", meta.seconds.toFixed(2), "marks", meta.marks.length);

const desktopFrames = Math.round(meta.seconds * fps);
const mobileFrames = Math.round(mobileSeconds * fps);
const mobileMarks = meta.marks.filter((mark) => mark.progress * meta.seconds <= mobileSeconds + 0.05);

if (stillsOnly) {
  await shoot(1440, 900, desktopFrames, desktopFrames, desktopDir, meta.marks);
  await shoot(390, 844, mobileFrames, desktopFrames, mobileDir, mobileMarks);
  console.log("stills done");
  process.exit(0);
}

await shoot(1440, 900, desktopFrames, desktopFrames, desktopDir, meta.marks);
await shoot(390, 844, mobileFrames, desktopFrames, mobileDir, mobileMarks);

const desktop = spawnSync("ffmpeg", [
  "-y", "-framerate", String(fps), "-i", `${desktopDir}/frame-%04d.jpg`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "25", "-preset", "veryfast",
  "-movflags", "+faststart", "-an", `${root}/journey-desktop.mp4`,
], { stdio: "inherit" });
const mobile = spawnSync("ffmpeg", [
  "-y", "-framerate", String(fps), "-i", `${mobileDir}/frame-%04d.jpg`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "veryfast",
  "-movflags", "+faststart", "-an", `${root}/journey-mobile.mp4`,
], { stdio: "inherit" });
if (desktop.status !== 0 || mobile.status !== 0) process.exit(1);
const desktopStat = await stat(`${root}/journey-desktop.mp4`);
const mobileStat = await stat(`${root}/journey-mobile.mp4`);
console.log("encoded", desktopStat.size, mobileStat.size);
process.exit(0);
