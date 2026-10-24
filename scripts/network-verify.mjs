import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const out = "/opt/cursor/artifacts/network";
const stillDir = "/tmp/network-spec/refs/stills";
const verifyDir = "/tmp/network-spec/refs/verify";
const times = [6, 9, 15, 20, 24.1, 31, 34, 44, 52, 60];
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
const verifyName = {
  9: "hero_compare_t08.png",
  24.1: "layers_verify_v7_sheet_r2_t24.1.png",
  34: "attn_compare_t34.png",
  44: "loss_compare_t44.png",
  52: "emb_compare_t52.png",
};

await mkdir(out, { recursive: true });

function tag(text, width) {
  return Buffer.from(
    `<svg width="${width}" height="32"><rect width="100%" height="32" fill="#F3EDE1"/><text x="10" y="22" font-family="sans-serif" font-size="16" fill="#222222">${text}</text></svg>`,
  );
}

async function labeled(image, text, width, height) {
  const frame = await sharp(image).resize(width, height, { fit: "fill" }).png().toBuffer();
  return sharp({
    create: { width, height: height + 32, channels: 3, background: "#F3EDE1" },
  })
    .composite([
      { input: tag(text, width), top: 0, left: 0 },
      { input: frame, top: 32, left: 0 },
    ])
    .png()
    .toBuffer();
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
  const diffPng = await sharp(diff, { raw: { width: 960, height: 600, channels: 3 } }).png().toBuffer();
  return { mean: sum / a.length, max, diffPng };
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

async function shoot(viewport, mobile) {
  const page = await browser.newPage({ viewport });
  const q = new URLSearchParams({
    shot: "1",
    t: "6",
    w: String(viewport.width),
    h: String(viewport.height),
    src: "ktx",
  });
  if (mobile) q.set("mobile", "1");
  page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => window.__network && window.__network.done, null, { timeout: 180000 });
  const report = await page.evaluate(() => window.__network);
  const frames = [];
  for (const t of times) {
    await page.evaluate((time) => window.__seek(time), t);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const file = `${out}/${mobile ? "m" : "d"}-t${String(t).replace(".", "_")}.png`;
    await page.locator("canvas").screenshot({ path: file });
    frames.push(file);
    console.log("shot", mobile ? "mobile" : "desktop", t);
  }
  await page.close();
  return { report, frames };
}

const desktop = await shoot({ width: 1440, height: 900 }, false);
const mobile = await shoot({ width: 390, height: 844 }, true);

const stats = [];
for (const t of times) {
  const id = String(t).replace(".", "_");
  const shot = `${out}/d-t${id}.png`;
  const still = stillName[t] ? `${stillDir}/${stillName[t]}` : null;
  if (still) {
    const score = await mae(shot, still);
    const panels = [
      await labeled(still, stillName[t] === `t${id}.png` ? `animatic ${stillName[t]}` : `animatic ${stillName[t]} (nearest)`, 960, 600),
      await labeled(shot, `three.js t=${t} 1440×900`, 960, 600),
      await labeled(score.diffPng, `abs ×8  mean ${score.mean.toFixed(2)}  max ${score.max}`, 960, 600),
    ];
    await sharp({
      create: { width: 960 * 3, height: 632, channels: 3, background: "#F3EDE1" },
    })
      .composite(panels.map((input, i) => ({ input, left: i * 960, top: 0 })))
      .png()
      .toFile(`${out}/compare-t${id}-desktop.png`);
    stats.push({ t, viewport: "1440x900", mean: score.mean, max: score.max, still: stillName[t] });
  }
  if (verifyName[t]) {
    const sheet = await labeled(`${verifyDir}/${verifyName[t]}`, verifyName[t], 1450, 480);
    const ours = await labeled(shot, `three.js t=${t}`, 960, 600);
    await sharp({
      create: { width: 1450, height: 32 + 480 + 632, channels: 3, background: "#F3EDE1" },
    })
      .composite([
        { input: sheet, left: 0, top: 0 },
        { input: ours, left: 0, top: 512 },
      ])
      .png()
      .toFile(`${out}/compare-t${id}-verify.png`);
  }
  await sharp(`${out}/m-t${id}.png`).png().toFile(`${out}/mobile-t${id}.png`);
}

const thumbs = [];
for (const file of desktop.frames) {
  thumbs.push(await sharp(file).resize(320, 200, { fit: "fill" }).png().toBuffer());
}
await sharp({
  create: { width: 320 * thumbs.length, height: 200, channels: 3, background: "#E4D8C4" },
})
  .composite(thumbs.map((input, i) => ({ input, left: i * 320, top: 0 })))
  .png()
  .toFile(`${out}/strip-desktop.png`);

const live = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await live.goto(base, { waitUntil: "domcontentloaded", timeout: 120000 });
await live.waitForSelector("h1", { timeout: 180000 });
await live.screenshot({ path: `${out}/page-hero.png` });
await live.evaluate(() => window.scrollTo(0, document.querySelector("[data-network-spacer]").getBoundingClientRect().height * 0.42));
await live.waitForTimeout(700);
await live.screenshot({ path: `${out}/page-mid.png` });
await live.close();
await browser.close();

await writeFile(
  `${out}/numbers.json`,
  JSON.stringify({ desktop: desktop.report, mobile: mobile.report, stats }, null, 2),
);
console.log(JSON.stringify(stats, null, 2));
