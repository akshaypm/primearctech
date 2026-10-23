import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const out = process.env.JITTER_OUT || "/tmp/network-jitter-before.json";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const client = await page.context().newCDPSession(page);
await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
await page.addInitScript(() => {
  const rows = [];
  let last = 0;
  const tick = (now) => {
    if (last) rows.push({ now, dt: now - last, t: window.__safe?.t ?? null, beat: window.__safe?.beat ?? null, live: Boolean(window.__safe?.live) });
    last = now;
    if (rows.length < 4000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__frames = rows;
});
console.log("open");
await page.goto(`${base}?src=ktx`, { waitUntil: "domcontentloaded", timeout: 420000 });
await page.waitForFunction(() => window.__safe && window.__safe.live === true && typeof window.__safe.t === "number", null, { timeout: 420000 });
console.log("live", await page.evaluate(() => ({ t: window.__safe?.t, beat: window.__safe?.beat, play: window.__boot?.playLoader })));
await page.waitForFunction(() => {
  const rows = (window.__frames || []).filter((row) => row.live && typeof row.t === "number" && row.t >= 3.4);
  if (!rows.length) return false;
  const last = window.__frames[window.__frames.length - 1];
  return last.now - rows[0].now > 2200;
}, null, { timeout: 420000 });
await page.waitForTimeout(400);
const frames = await page.evaluate(() => (window.__frames || []).filter((row) => row.live));
const band = frames.filter((row) => typeof row.t === "number" && row.t >= 3 && row.t <= 5);
const longest = band.reduce((best, row) => (row.dt > best.dt ? row : best), { dt: 0, t: null });
const sorted = band.map((row) => row.dt).sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
const first = frames.find((row) => typeof row.t === "number");
const opening = first ? frames.filter((row) => row.now - first.now < 4000) : frames.slice(0, 120);
const openLong = opening.reduce((best, row) => (row.dt > best.dt ? row : best), { dt: 0, t: null });
const report = {
  throttle: 4,
  samples: frames.length,
  band: band.length,
  longestMs: Number(longest.dt.toFixed(2)),
  longestT: longest.t,
  medianMs: Number(median.toFixed(2)),
  over50: band.filter((row) => row.dt >= 50).map((row) => ({ t: row.t, dt: Number(row.dt.toFixed(1)) })),
  openingLongestMs: Number(openLong.dt.toFixed(2)),
  openingT: openLong.t,
  firstT: first?.t ?? null,
  timeline: frames.filter((_, i) => i % 8 === 0).slice(0, 24).map((row) => ({ t: row.t, dt: Number(row.dt.toFixed(1)) })),
};
await writeFile(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
