import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = "/opt/cursor/artifacts/video/journey-preview";
const desktopDir = "/tmp/journey-desktop";
const mobileDir = "/tmp/journey-mobile";
await mkdir(root, { recursive: true });
await mkdir(`${root}/frames`, { recursive: true });
await mkdir(desktopDir, { recursive: true });
await mkdir(mobileDir, { recursive: true });

const fps = 30;
const seconds = 48;
const desktopFrames = fps * seconds;
const mobileFrames = fps * 15;
const stations = [0, 1, 2, 3, 4, 5, 7, 8];

async function shoot(width, height, count, dir, keys) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto("http://localhost:3000/lab/journey?capture=1", { waitUntil: "commit", timeout: 30000 });
  await page.waitForFunction(() => window.__journey, { timeout: 30000 });
  const cdp = await page.context().newCDPSession(page);
  const started = Date.now();
  for (let frame = 0; frame < count; frame += 1) {
    const progress = frame / (desktopFrames - 1);
    const time = (frame / fps) * 1000;
    await page.evaluate(({ progress, time }) => window.__journey.setFrame(progress, time), { progress, time });
    const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
    const name = String(frame).padStart(4, "0");
    await writeFile(`${dir}/frame-${name}.jpg`, Buffer.from(shot.data, "base64"));
    if (keys && stations.some((index) => frame === Math.round((index / 8) * (desktopFrames - 1)))) {
      const png = await cdp.send("Page.captureScreenshot", { format: "png" });
      const station = stations.find((index) => frame === Math.round((index / 8) * (desktopFrames - 1)));
      await writeFile(`${root}/frames/station-${station}.png`, Buffer.from(png.data, "base64"));
    }
    if (frame % 60 === 0) console.log(width, frame, `${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
  await browser.close();
}

await shoot(1440, 900, desktopFrames, desktopDir, true);
await shoot(390, 844, mobileFrames, mobileDir, false);

const desktop = spawnSync("ffmpeg", [
  "-y", "-framerate", String(fps), "-i", `${desktopDir}/frame-%04d.jpg`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-preset", "veryfast",
  "-movflags", "+faststart", "-an", `${root}/journey-desktop.mp4`,
], { stdio: "inherit" });
const mobile = spawnSync("ffmpeg", [
  "-y", "-framerate", String(fps), "-i", `${mobileDir}/frame-%04d.jpg`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-preset", "veryfast",
  "-movflags", "+faststart", "-an", `${root}/journey-mobile.mp4`,
], { stdio: "inherit" });
if (desktop.status !== 0 || mobile.status !== 0) process.exit(1);
console.log("encoded");
