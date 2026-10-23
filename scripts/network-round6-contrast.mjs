import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const out = "/opt/cursor/artifacts/network/round6";
const views = [
  { id: "m", width: 390, height: 844, mobile: true },
  { id: "d", width: 1440, height: 900, mobile: false },
  { id: "1280", width: 1280, height: 800, mobile: false },
  { id: "1920", width: 1920, height: 1080, mobile: false },
].filter((view) => !process.env.VIEW || process.env.VIEW.split(",").includes(view.id));

function luminance(r, g, b) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(fg, bg) {
  const a = luminance(fg[0], fg[1], fg[2]);
  const b = luminance(bg[0], bg[1], bg[2]);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

const onlyT = process.env.TIMES
  ? new Set(process.env.TIMES.split(",").map((n) => Math.round(Number(n) * 10) / 10))
  : null;
const report = [];
for (const view of views) {
  const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
  page.on("pageerror", (error) => console.log("PAGEERROR", view.id, error.message));
  const q = new URLSearchParams({ shot: "1", ui: "1", t: "6", w: String(view.width), h: String(view.height), src: "ktx" });
  if (view.mobile) q.set("mobile", "1");
  console.log("open", view.id);
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__network && window.__network.done, null, { timeout: 600000 });
  const contrastFail = [];
  const labelOverflow = [];
  const piled = [];
  for (let t = 0; t <= 61.5; t += 0.5) {
    const time = Math.round(t * 10) / 10;
    if (onlyT && !onlyT.has(time)) continue;
    const measured = await page.evaluate((value) => {
      window.__seek(value);
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2");
      const parse = (text) => {
        const match = text.match(/rgba?\(([^)]+)\)/);
        if (!match) return [34, 34, 34];
        const parts = match[1].split(",").map((part) => Number(part.trim()));
        return [parts[0], parts[1], parts[2]];
      };
      const sand = (text) => {
        const color = parse(text);
        return color[0] > 210 && color[1] > 200 && color[2] > 180;
      };
      const sampleAt = (rect) => {
        if (!gl || rect.width < 2 || rect.height < 2) return [228, 216, 196];
        const dpr = canvas.width / Math.max(1, canvas.clientWidth);
        const scaleY = canvas.height / Math.max(1, canvas.clientHeight);
        const buf = new Uint8Array(4);
        let best = [228, 216, 196];
        let bestL = 2;
        const channel = (c) => {
          const s = c / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        const luma = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
        for (const [px, py] of [
          [rect.left + rect.width * 0.5, rect.top + rect.height * 0.5],
          [rect.left + 2, rect.top + 2],
          [rect.right - 3, rect.bottom - 3],
          [rect.left + 2, rect.bottom - 3],
          [rect.right - 3, rect.top + 2],
        ]) {
          const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(px * dpr)));
          const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((canvas.clientHeight - py) * scaleY)));
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          const rgb = [buf[0], buf[1], buf[2]];
          const L = luma(rgb);
          if (L < bestL) {
            bestL = L;
            best = rgb;
          }
        }
        return best;
      };
      const labels = [];
      const nodes = [
        ...document.querySelectorAll(".net-kicker, .net-stat dt, .net-callout[data-hidden='0'], .net-callout[data-hidden='0'] .net-idx, .net-product[data-hidden='0'] .net-name, .net-product[data-hidden='0'] .net-line, .net-product[data-hidden='0'] .net-enter, .net-tag"),
      ];
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.2) continue;
        let faded = false;
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          const parentStyle = getComputedStyle(parent);
          if (parentStyle.display === "none" || parentStyle.visibility === "hidden" || Number(parentStyle.opacity) < 0.2) {
            faded = true;
            break;
          }
        }
        if (faded) continue;
        const plate = node.closest(".net-stats, .net-copy[data-scrim='1'], .net-product-body, .net-foot, .net-callout");
        const plateStyle = plate ? getComputedStyle(plate) : style;
        const plateColor = plate ? parse(plateStyle.backgroundColor) : null;
        const ownColor = parse(style.backgroundColor);
        const painted = sand(plateStyle.backgroundColor) ? plateColor : sand(style.backgroundColor) ? ownColor : null;
        const bg = painted || sampleAt(rect);
        labels.push({
          text: (node.textContent || "").trim().slice(0, 32),
          kind: node.className,
          fg: parse(style.color),
          bg,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
        });
      }
      const products = [...document.querySelectorAll(".net-product[data-hidden='0']")].map((node) => node.dataset.anchor);
      const productBoxes = [...document.querySelectorAll(".net-product[data-hidden='0'] .net-product-body")].map((node) => {
        const rect = node.getBoundingClientRect();
        return { id: node.closest(".net-product")?.dataset.anchor, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      return { beat: document.querySelector(".net")?.getAttribute("data-beat"), labels, products, productBoxes, safe: window.__safe };
    }, time);
    for (const label of measured.labels || []) {
      const contrast = ratio(label.fg, label.bg);
      if (contrast < 4.5) {
        contrastFail.push({ t: time, beat: measured.beat, text: label.text, contrast: Number(contrast.toFixed(2)), fg: label.fg, bg: label.bg });
      }
      if (label.left < 16 || label.right > view.width - 16 || label.top < 0 || label.bottom > view.height - 8) {
        labelOverflow.push({ t: time, text: label.text, left: label.left, right: label.right, top: label.top, bottom: label.bottom });
      }
    }
    if ((measured.products || []).length > 1) piled.push({ t: time, products: measured.products });
    for (const box of measured.productBoxes || []) {
      const anchor = (measured.safe?.anchors || []).find((item) => item.id === box.id && item.visible);
      if (!anchor) continue;
      const hit = box.left < anchor.x1 && box.right > anchor.x0 && box.top < anchor.y1 && box.bottom > anchor.y0;
      if (hit) piled.push({ t: time, overlap: box.id, box, anchor });
    }
  }
  report.push({
    view: view.id,
    width: view.width,
    height: view.height,
    contrastFail: contrastFail.length,
    labelOverflow: labelOverflow.length,
    piled: piled.length,
    fails: contrastFail.slice(0, 24),
    overflow: labelOverflow.slice(0, 16),
    piles: piled.slice(0, 16),
  });
  console.log(view.id, "contrast", contrastFail.length, "overflow", labelOverflow.length, "piled", piled.length);
  if (contrastFail.length) console.log(JSON.stringify(contrastFail.slice(0, 8)));
  await page.close();
}

await writeFile(`${out}/contrast-sweep.json`, JSON.stringify(report, null, 2));
console.log("contrast sweep written");
await browser.close();
const bad = report.some((row) => row.contrastFail || row.piled);
if (bad) process.exit(1);
