import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const out = "/opt/cursor/artifacts/network";
const frames = [6, 9, 12, 15, 20, 24.1, 31, 34, 37, 44, 52, 60];
const views = [
  { width: 1440, height: 900, mobile: false, shoot: true, id: "d" },
  { width: 390, height: 844, mobile: true, shoot: true, id: "m" },
  { width: 1280, height: 800, mobile: false, shoot: false, id: "1280" },
  { width: 1920, height: 1080, mobile: false, shoot: false, id: "1920" },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

const report = [];
for (const view of views) {
  const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
  page.on("pageerror", (error) => console.log("PAGEERROR", view.id, error.message));
  const q = new URLSearchParams({ shot: "1", ui: "1", t: "6", w: String(view.width), h: String(view.height), src: "ktx" });
  if (view.mobile) q.set("mobile", "1");
  console.log("open", view.id);
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__network && window.__network.done, null, { timeout: 240000 });
  const bare = [];
  const covered = [];
  for (let t = 0; t <= 61.5; t += 0.5) {
    const time = Math.round(t * 10) / 10;
    await page.evaluate(async (value) => {
      window.__seek(value);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, time);
    const safe = await page.evaluate(() => window.__safe);
    if (safe?.overlaps?.length && !safe.scrim) bare.push({ t: time, ...safe, nodes: undefined, anchors: undefined });
    if (safe?.overlaps?.length && safe.scrim) covered.push({ t: time, beat: safe.beat, n: safe.overlaps.length });
  }
  if (view.shoot) {
    for (const time of frames) {
      await page.evaluate(async (value) => {
        window.__seek(value);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, time);
      const safe = await page.evaluate(() => window.__safe);
      const name = `ui-${view.id}-t${String(time).replace(".", "_")}.png`;
      await page.screenshot({ path: `${out}/${name}` });
      console.log("frame", name, safe?.scrim ? "scrim" : "clear", safe?.overlaps?.length || 0, safe?.beat);
    }
  }
  report.push({ view: view.id, width: view.width, height: view.height, bare, covered });
  console.log(view.id, "bare", bare.length, "covered", covered.length);
  await page.close();
}
await writeFile(`${out}/safe-sweep.json`, JSON.stringify(report, null, 2));
console.log("sweep written");
await browser.close();
