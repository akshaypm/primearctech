import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const out = "/opt/cursor/artifacts/network";
const frames = [6, 9, 12, 15, 20, 24.1, 31, 34, 37, 44, 52, 60];
const views = [
  { width: 390, height: 844, mobile: true, shoot: "all", id: "m" },
  { width: 1440, height: 900, mobile: false, shoot: [20, 37], id: "d" },
  { width: 1280, height: 800, mobile: false, shoot: [], id: "1280" },
  { width: 1920, height: 1080, mobile: false, shoot: [], id: "1920" },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

function luminance(r, g, b) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const report = [];
for (const view of views) {
  const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
  page.on("pageerror", (error) => console.log("PAGEERROR", view.id, error.message));
  const q = new URLSearchParams({ shot: "1", ui: "1", t: "6", w: String(view.width), h: String(view.height), src: "ktx" });
  if (view.mobile) q.set("mobile", "1");
  console.log("open", view.id);
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__network && window.__network.done, null, { timeout: 600000 });
  const bare = [];
  const covered = [];
  const contrastFail = [];
  const labelOverflow = [];
  for (let t = 0; t <= 61.5; t += 0.5) {
    const time = Math.round(t * 10) / 10;
    const measured = await page.evaluate(async (value) => {
      window.__seek(value);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const copy = document.querySelector(".net-copy");
      const canvas = document.querySelector("canvas");
      const safe = window.__safe;
      if (!copy || !canvas) return { safe, contrast: null, overflow: [] };
      const rect = copy.getBoundingClientRect();
      const gl = canvas.getContext("webgl2");
      const samples = [];
      if (gl && rect.width > 4 && rect.height > 4) {
        const dpr = canvas.width / Math.max(1, canvas.clientWidth);
        const scaleY = canvas.height / Math.max(1, canvas.clientHeight);
        let x0 = Math.floor(rect.left * dpr);
        let x1 = Math.ceil(rect.right * dpr);
        let y0 = Math.floor((canvas.clientHeight - rect.bottom) * scaleY);
        let y1 = Math.ceil((canvas.clientHeight - rect.top) * scaleY);
        x0 = Math.max(0, Math.min(canvas.width - 1, x0));
        x1 = Math.max(x0 + 1, Math.min(canvas.width, x1));
        y0 = Math.max(0, Math.min(canvas.height - 1, y0));
        y1 = Math.max(y0 + 1, Math.min(canvas.height, y1));
        const pw = x1 - x0;
        const ph = y1 - y0;
        const buf = new Uint8Array(pw * ph * 4);
        gl.readPixels(x0, y0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const step = Math.max(1, Math.round(8 * dpr));
        const channel = (c) => {
          const s = c / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        const luma = (r, g, b) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        let bestL = 2;
        let best = [228, 216, 196];
        const consider = (col, row) => {
          const i = (row * pw + col) * 4;
          const rgb = [buf[i], buf[i + 1], buf[i + 2]];
          const L = luma(rgb[0], rgb[1], rgb[2]);
          if (L < bestL) {
            bestL = L;
            best = rgb;
          }
        };
        for (let row = 0; row < ph; row += step) {
          for (let col = 0; col < pw; col += step) consider(col, row);
        }
        consider(0, 0);
        consider(pw - 1, 0);
        consider(0, ph - 1);
        consider(pw - 1, ph - 1);
        samples.push(best);
      }
      const scrim = copy.dataset.scrim === "1";
      const overflow = [...document.querySelectorAll(".net-product[data-hidden='0'] .net-product-body, .net-callout[data-hidden='0']")].flatMap((node) => {
        const box = node.getBoundingClientRect();
        const issues = [];
        if (box.left < 15) issues.push("left");
        if (box.right > window.innerWidth - 15) issues.push("right");
        if (box.bottom > window.innerHeight - 8) issues.push("bottom");
        if (box.top < 0) issues.push("top");
        return issues.length ? [{ id: node.dataset.anchor || node.parentElement?.dataset.anchor, issues, left: Math.round(box.left), right: Math.round(box.right), bottom: Math.round(box.bottom) }] : [];
      });
      return { safe, scrim, samples, overflow, w: Math.round(rect.width), h: Math.round(rect.height) };
    }, time);
    let worst = 21;
    const scrim = Boolean(measured.scrim);
    for (const sample of measured.samples || []) {
      const bg = scrim
        ? [Math.round(0xef * 0.92 + sample[0] * 0.08), Math.round(0xe6 * 0.92 + sample[1] * 0.08), Math.round(0xd6 * 0.92 + sample[2] * 0.08)]
        : sample;
      const L1 = luminance(34, 34, 34);
      const L2 = luminance(bg[0], bg[1], bg[2]);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      worst = Math.min(worst, ratio);
    }
    const row = { t: time, beat: measured.safe?.beat, contrast: Number(worst.toFixed(2)), scrim, x: measured.safe?.x, y: measured.safe?.y };
    if (measured.safe?.overlaps?.length && !measured.safe.scrim) bare.push({ t: time, beat: measured.safe.beat, n: measured.safe.overlaps.length });
    if (measured.safe?.overlaps?.length && measured.safe.scrim) covered.push({ t: time, beat: measured.safe.beat, n: measured.safe.overlaps.length });
    if (worst < 4.5) contrastFail.push(row);
    if (measured.overflow?.length) labelOverflow.push({ t: time, items: measured.overflow });
  }
  const shootTimes = view.shoot === "all" ? frames : view.shoot;
  for (const time of shootTimes) {
    await page.evaluate(async (value) => {
      window.__seek(value);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, time);
    const name = `ui-${view.id}-t${String(time).replace(".", "_")}.png`;
    await page.screenshot({ path: `${out}/${name}` });
    console.log("frame", name);
  }
  if (view.mobile) {
    await page.setViewportSize({ width: 828, height: 1792 });
    await page.evaluate(async () => {
      document.querySelector(".net")?.setAttribute("data-shot", "true");
      window.__seek(6);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.locator("canvas").screenshot({ path: "/tmp/poster-mobile.png" });
    console.log("poster canvas");
  }
  report.push({
    view: view.id,
    width: view.width,
    height: view.height,
    bare: bare.length,
    covered: covered.length,
    contrastFail,
    labelOverflow,
    coveredTimes: covered,
  });
  console.log(view.id, "bare", bare.length, "covered", covered.length, "contrastFail", contrastFail.length, "labelOverflow", labelOverflow.length);
  if (contrastFail.length) console.log(JSON.stringify(contrastFail.slice(0, 12)));
  if (labelOverflow.length) console.log(JSON.stringify(labelOverflow.slice(0, 8)));
  await page.close();
}
await writeFile(`${out}/contrast-sweep.json`, JSON.stringify(report, null, 2));
console.log("sweep written");
await browser.close();
