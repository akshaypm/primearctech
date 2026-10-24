import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const root = "/opt/cursor/artifacts/network/round8";
const only = (process.env.ONLY || "sweep,hero,layers,loss,ride,audio").split(",").filter(Boolean);
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
  await page.waitForFunction(() => window.__scenesReady && window.__network && window.__network.done && window.__points && window.__proof && window.__kiln, null, {
    timeout: 240000,
  });
  await page.waitForFunction(() => {
    const poster = document.querySelector(".net-poster");
    return !poster || Number(getComputedStyle(poster).opacity) < 0.05;
  }, null, { timeout: 120000 }).catch(() => {});
}

async function seek(page, t) {
  await page.evaluate((time) => window.__seek(time), t);
  await frames(page, 3);
}

function onScreen(list, width, height) {
  return (list || []).filter((item) => {
    const box = item.box;
    if (!box) return item.x > 8 && item.y > 8 && item.x < width - 8 && item.y < height - 8;
    const ix = Math.min(box.x1, width - 8) - Math.max(box.x0, 8);
    const iy = Math.min(box.y1, height - 8) - Math.max(box.y0, 8);
    return ix > 8 && iy > 8;
  });
}

function aim(item, width, height) {
  const box = item.box;
  const x = box ? (box.x0 + box.x1) / 2 : item.x;
  const y = box ? (box.y0 + box.y1) / 2 : item.y;
  return { x: Math.min(width - 16, Math.max(16, x)), y: Math.min(height - 16, Math.max(16, y)) };
}

async function drag(page, x0, y0, x1, y1, steps, hold) {
  await page.mouse.move(x0, y0);
  await frames(page, 1);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    const u = i / steps;
    await page.mouse.move(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u);
    await frames(page, 1);
  }
  await frames(page, hold);
}

function band(ball, width, height) {
  if (!ball) return false;
  const nx = ball.sx / width;
  const ny = ball.sy / height;
  return nx >= 0.28 && nx <= 0.72 && ny >= 0.48 && ny <= 0.78;
}

async function sample(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return null;
    const px = Math.round((x / Math.max(1, canvas.clientWidth)) * canvas.width);
    const py = Math.round((1 - y / Math.max(1, canvas.clientHeight)) * canvas.height);
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.max(0, px), Math.max(0, py), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [pixel[0], pixel[1], pixel[2]];
  }, { x, y });
}

const summary = [];
const audioLog = [];

function watchAudio(page, tag) {
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.startsWith("audio ")) audioLog.push({ tag, text, at: Date.now() });
  });
}

for (const view of views) {
  await mkdir(`${root}/${view.id}`, { recursive: true });
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(view.id, "PAGEERROR", error.message));
  watchAudio(page, view.id);
  const q = new URLSearchParams({ shot: "1", ui: "1", src: "ktx", w: String(view.width), h: String(view.height), t: "6" });
  if (view.mobile) q.set("mobile", "1");
  console.log(view.id, "open");
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await ready(page);
  await page.evaluate(() => {
    window.localStorage.setItem("network-sound", "on");
    document.querySelector(".net-sound")?.click();
  });
  await frames(page, 2);

  if (only.includes("sweep")) {
    for (const t of sweepTimes) {
      await seek(page, t);
      const kiln = await page.evaluate(() => window.__kiln);
      const signal = onScreen(await page.evaluate(() => window.__points("SIGNAL_ball")), view.width, view.height);
      const loss = onScreen(await page.evaluate(() => window.__points("LOSS_ball")), view.width, view.height);
      const name = `sweep-t${String(t).replace(".", "_")}.png`;
      await page.screenshot({ path: `${root}/${view.id}/${name}`, timeout: 120000 });
      const at = (signal[0] || loss[0]) ? aim(signal[0] || loss[0], view.width, view.height) : null;
      const pixel = at ? await sample(page, at.x, at.y) : null;
      const row = { view: view.id, id: "sweep", t, kiln, signal: signal.length, loss: loss.length, pixel, file: name };
      summary.push(row);
      console.log(view.id, "sweep", t, JSON.stringify({ kiln, signal: signal.length, loss: loss.length, pixel }));
    }
  }

  if (only.includes("hero")) {
    await seek(page, 8);
    const copy = await page.locator(".net-copy").boundingBox();
    const nodes = onScreen(await page.evaluate(() => window.__points("HERO_n")), view.width, view.height).filter((item) => {
      if (item.name.startsWith("HERO_n3")) return false;
      if (!copy) return true;
      const at = aim(item, view.width, view.height);
      return at.x < copy.x || at.x > copy.x + copy.width || at.y < copy.y || at.y > copy.y + copy.height;
    });
    const node = nodes.sort((a, b) => Math.abs(a.y - view.height * 0.42) - Math.abs(b.y - view.height * 0.42))[0];
    await page.screenshot({ path: `${root}/${view.id}/hero-before.png`, timeout: 120000 });
    if (!node) summary.push({ view: view.id, id: "hero", ok: false, reason: "no node" });
    else {
      const from = aim(node, view.width, view.height);
      const dy = view.height * 0.2 * (from.y > view.height * 0.5 ? -1 : 1);
      await drag(page, from.x, from.y, from.x + view.width * 0.04, from.y + dy, 8, 6);
      const mid = (await page.evaluate(() => window.__points("HERO_n"))).find((item) => item.name === node.name);
      const proof = await page.evaluate(() => window.__proof());
      const frac = mid ? Math.hypot(mid.x - node.x, mid.y - node.y) / view.height : 0;
      await page.screenshot({ path: `${root}/${view.id}/hero-mid.png`, timeout: 120000 });
      await page.mouse.up();
      let after = proof;
      let flight = false;
      for (let i = 0; i < 48; i += 1) {
        await frames(page, 1);
        after = await page.evaluate(() => window.__proof());
        if (!flight && after.pulse > 2 && after.age > 0.45 && after.age < 1.15) {
          flight = true;
          await page.screenshot({ path: `${root}/${view.id}/hero-beads.png`, timeout: 120000 });
        }
        if (after.age > 1.05 && after.squash?.length && after.beadOpacity < 0.45) break;
      }
      await page.screenshot({ path: `${root}/${view.id}/hero-after.png`, timeout: 120000 });
      const row = {
        view: view.id,
        id: "hero",
        ok: frac >= 0.15 && proof.bend > 0.05 && (after.squash?.length || 0) > 0 && after.beadOpacity < 0.85,
        frac: Number(frac.toFixed(3)),
        bend: Number(proof.bend.toFixed(3)),
        pulse: after.pulse,
        beadOpacity: after.beadOpacity,
        bead: after.bead,
        squash: after.squash,
        age: Number((after.age || 0).toFixed(3)),
      };
      summary.push(row);
      console.log(view.id, "hero", JSON.stringify(row));
    }
  }

  if (only.includes("layers")) {
    await seek(page, 24);
    await page.screenshot({ path: `${root}/${view.id}/layers-before.png`, timeout: 120000 });
    const blocks = onScreen(await page.evaluate(() => window.__points("LAYERS_blk")), view.width, view.height);
    const block = blocks.sort((a, b) => b.y - a.y)[0];
    if (block) {
      const from = aim(block, view.width, view.height);
      await drag(page, from.x, from.y, from.x, Math.max(40, from.y - view.height * 0.28), 8, 4);
    }
    const proof = await page.evaluate(() => window.__proof());
    await page.screenshot({ path: `${root}/${view.id}/layers-mid.png`, timeout: 120000 });
    await page.mouse.up();
    await frames(page, 6);
    await page.screenshot({ path: `${root}/${view.id}/layers-after.png`, timeout: 120000 });
    const row = { view: view.id, id: "layers", ok: proof.spread > 0.4, spread: proof.spread };
    summary.push(row);
    console.log(view.id, "layers", JSON.stringify(row));
  }

  if (only.includes("loss")) {
    await seek(page, 44);
    await page.screenshot({ path: `${root}/${view.id}/loss-before.png`, timeout: 120000 });
    const ball = onScreen(await page.evaluate(() => window.__points("LOSS_ball")), view.width, view.height)[0]
      || onScreen(await page.evaluate(() => window.__points("SIGNAL_ball")), view.width, view.height)[0];
    if (ball) {
      const from = aim(ball, view.width, view.height);
      await drag(page, from.x, from.y, from.x + view.width * 0.16, from.y + view.height * 0.08, 8, 0);
    }
    const mid = await page.evaluate(() => window.__proof());
    await page.screenshot({ path: `${root}/${view.id}/loss-mid.png`, timeout: 120000 });
    await page.mouse.up();
    let settled = mid;
    let at25 = null;
    for (let i = 0; i < 70; i += 1) {
      await frames(page, 1);
      settled = await page.evaluate(() => window.__proof());
      if (i === 50) at25 = settled.ball;
      if (settled.ball && settled.ball.speed < 0.08 && band(settled.ball, view.width, view.height)) break;
    }
    await page.screenshot({ path: `${root}/${view.id}/loss-after.png`, timeout: 120000 });
    const after = settled.ball;
    const seen = band(after, view.width, view.height);
    const row = {
      view: view.id,
      id: "loss",
      ok: Boolean(ball) && seen && after && after.speed < 0.08 && after.basin >= 0 && after.basin < 0.8 && Math.abs(after.gap) < 0.02 && (!at25 || at25.speed < 0.12),
      at25,
      after,
      seen,
    };
    summary.push(row);
    console.log(view.id, "loss", JSON.stringify(row));
  }

  if (only.includes("ride")) {
    await mkdir(`${root}/${view.id}/ride`, { recursive: true });
    for (const t of rideTimes) {
      await seek(page, t);
      const file = `${root}/${view.id}/ride/t${String(t).replace(".", "_")}.png`;
      await page.screenshot({ path: file, timeout: 120000 });
      const kiln = await page.evaluate(() => window.__kiln);
      summary.push({ view: view.id, id: "ride", t, kiln, file: file.split("/").slice(-2).join("/") });
      console.log(view.id, "ride", t, JSON.stringify(kiln));
    }
  }

  await context.close();
}

if (only.includes("audio")) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log("audio", "PAGEERROR", error.message));
  watchAudio(page, "live");
  console.log("audio", "open");
  await page.goto(`${base}?ui=1`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__audio && window.__seek, null, { timeout: 180000 });
  await page.click(".net-sound");
  await frames(page, 8);
  const story = [23.5, 24.7, 26.4, 28, 29.6, 37.2, 44, 48.4, 61];
  for (const t of story) {
    await seek(page, t);
    await frames(page, 4);
  }
  await seek(page, 8);
  const hero = onScreen(await page.evaluate(() => window.__points("HERO_n")), 1440, 900).find((item) => !item.name.startsWith("HERO_n3"));
  if (hero) {
    const from = aim(hero, 1440, 900);
    await drag(page, from.x, from.y, from.x, from.y - 140, 6, 2);
    await page.mouse.up();
    await frames(page, 8);
  }
  await seek(page, 24);
  const block = onScreen(await page.evaluate(() => window.__points("LAYERS_blk")), 1440, 900).sort((a, b) => b.y - a.y)[0];
  if (block) {
    const from = aim(block, 1440, 900);
    await drag(page, from.x, from.y, from.x, from.y - 180, 6, 2);
    await page.mouse.up();
    await frames(page, 4);
  }
  await seek(page, 34);
  const sphere = onScreen(await page.evaluate(() => window.__points("ATTN_")), 1440, 900).find((item) => ["ATTN_chain", "ATTN_coil", "ATTN_tile22"].includes(item.name));
  if (sphere) {
    const at = aim(sphere, 1440, 900);
    await page.mouse.move(at.x, at.y);
    await frames(page, 2);
    await page.mouse.click(at.x, at.y);
    await frames(page, 6);
    await page.keyboard.press("Escape");
    await frames(page, 4);
  }
  await seek(page, 44);
  const loss = onScreen(await page.evaluate(() => window.__points("LOSS_ball")), 1440, 900)[0];
  if (loss) {
    const from = aim(loss, 1440, 900);
    await drag(page, from.x, from.y, from.x + 180, from.y + 40, 6, 0);
    await page.mouse.up();
    await frames(page, 20);
  }
  await page.click("body");
  const fired = await page.evaluate(() => window.__audio.fired());
  summary.push({ id: "audio", fired, console: audioLog.map((row) => row.text) });
  console.log("audio", JSON.stringify(fired));
  await context.close();
}

await browser.close();
await mkdir(root, { recursive: true });
await writeFile(`${root}/summary.json`, JSON.stringify({ summary, audioLog }, null, 2));
console.log("wrote", `${root}/summary.json`);
