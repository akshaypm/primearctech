import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const root = "/opt/cursor/artifacts/network/round9";
const views = [
  { id: "desktop", width: 1440, height: 900, mobile: false },
  { id: "mobile", width: 390, height: 844, mobile: true },
].filter((view) => !process.env.VIEW || process.env.VIEW === view.id);
const sweepTimes = [6, 9, 12, 15, 20, 24.1, 31, 34, 37, 44, 52, 60];
const rideTimes = [19.5, 21, 23, 25, 27, 29, 31, 32.2, 36];

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

async function frames(page, count) {
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
}

async function ready(page) {
  await page.waitForFunction(() => window.__scenesReady && window.__network && window.__network.done, null, { timeout: 240000 });
  await page.waitForFunction(() => {
    const poster = document.querySelector(".net-poster");
    return !poster || Number(getComputedStyle(poster).opacity) < 0.05;
  }, null, { timeout: 120000 }).catch(() => {});
}

async function seek(page, t) {
  await page.evaluate((time) => window.__seek(time), t);
  await frames(page, 3);
}

async function layout(page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".net-nav")?.getBoundingClientRect();
    const copyEl = document.querySelector(".net-copy");
    const copy = copyEl?.getBoundingClientRect();
    const style = copyEl ? getComputedStyle(copyEl) : null;
    const body = copyEl?.querySelector("p:not(.net-kicker)");
    const bodyStyle = body ? getComputedStyle(body) : null;
    const minTop = (nav?.bottom || 0) + 12;
    const products = [...document.querySelectorAll(".net-product[data-hidden='0'][data-focus='1'] .net-product-body")].map((node) => {
      const rect = node.getBoundingClientRect();
      const overlap =
        style &&
        Number(style.opacity) > 0.15 &&
        copy &&
        rect.left < copy.right &&
        rect.right > copy.left &&
        rect.top < copy.bottom &&
        rect.bottom > copy.top;
      return {
        id: node.closest(".net-product")?.dataset.anchor || "",
        text: (node.querySelector(".net-name")?.textContent || "").trim(),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        overlap: Boolean(overlap),
        underNav: rect.top < minTop - 0.5,
      };
    });
    return {
      beat: document.querySelector(".net")?.getAttribute("data-beat"),
      kicker: (copyEl?.querySelector(".net-kicker")?.textContent || "").trim(),
      compact: copyEl?.getAttribute("data-compact"),
      band: copyEl?.getAttribute("data-band"),
      body: bodyStyle?.display || "missing",
      copy: copy
        ? { x: Math.round(copy.left), y: Math.round(copy.top), w: Math.round(copy.width), h: Math.round(copy.height), opacity: Number(style?.opacity || 0) }
        : null,
      navBottom: Math.round(nav?.bottom || 0),
      minTop: Math.round(minTop),
      products,
    };
  });
}

function sheet(dir) {
  const names = rideTimes.map((t) => `ride/t${String(t).replace(".", "_")}.png`);
  return new Promise((resolve, reject) => {
    const args = ["-y"];
    for (const name of names) args.push("-i", `${dir}/${name}`);
    args.push(
      "-filter_complex",
      "xstack=inputs=9:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0|0_h0+h1|w0_h0+h1|w0+w1_h0+h1,scale=1440:-1",
      `${dir}/ride-sheet.png`,
    );
    const child = spawn("ffmpeg", args, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
}

const summary = [];
for (const view of views) {
  await mkdir(`${root}/${view.id}/ride`, { recursive: true });
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(view.id, "PAGEERROR", error.message));
  const q = new URLSearchParams({ shot: "1", ui: "1", src: "ktx", w: String(view.width), h: String(view.height), t: "6" });
  if (view.mobile) q.set("mobile", "1");
  console.log(view.id, "open");
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await ready(page);

  for (const t of sweepTimes) {
    await seek(page, t);
    const row = { view: view.id, id: "sweep", t, ...(await layout(page)) };
    summary.push(row);
    const name = `sweep-t${String(t).replace(".", "_")}.png`;
    await page.screenshot({ path: `${root}/${view.id}/${name}`, timeout: 120000 });
    console.log(view.id, "sweep", t, JSON.stringify({ beat: row.beat, kicker: row.kicker, compact: row.compact, band: row.band, copy: row.copy, products: row.products }));
  }

  for (const t of rideTimes) {
    await seek(page, t);
    const row = { view: view.id, id: "ride", t, ...(await layout(page)) };
    summary.push(row);
    const file = `${root}/${view.id}/ride/t${String(t).replace(".", "_")}.png`;
    await page.screenshot({ path: file, timeout: 120000 });
    console.log(view.id, "ride", t, JSON.stringify({ beat: row.beat, kicker: row.kicker, compact: row.compact, band: row.band, body: row.body, copy: row.copy }));
  }
  await context.close();
  await sheet(`${root}/${view.id}`);
}

await browser.close();
await writeFile(`${root}/summary.json`, JSON.stringify(summary, null, 2));
console.log("wrote", `${root}/summary.json`);
