import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const root = "/opt/cursor/artifacts/network/round10";
const previous = "/opt/cursor/artifacts/network/round9";
const only = (process.env.ONLY || "sweep,hero,layers,loss,audio").split(",").filter(Boolean);
const views = [
  { id: "desktop", width: 1440, height: 900, mobile: false },
  { id: "mobile", width: 390, height: 844, mobile: true },
].filter((view) => !process.env.VIEW || process.env.VIEW === view.id);
const sweepTimes = [6, 9, 12, 15, 20, 24.1, 31, 34, 37, 44, 52, 60];
const consoleLog = [];

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

async function cap(context) {
  await context.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      const gl = orig.call(this, type, attrs);
      if (gl && String(type) === "webgl2") {
        const getParameter = gl.getParameter.bind(gl);
        gl.getParameter = (pname) => (pname === 0x8872 ? 16 : getParameter(pname));
      }
      return gl;
    };
  });
}

function watch(page, tag) {
  page.on("console", (msg) => {
    const text = msg.text();
    consoleLog.push({ tag, type: msg.type(), text });
    if (/shader|INVALID_OPERATION|texture image units|3D unavailable|WebGLProgram/i.test(text)) {
      console.log(tag, "CONSOLE", msg.type(), text.slice(0, 500));
    }
  });
  page.on("pageerror", (error) => {
    consoleLog.push({ tag, type: "pageerror", text: error.message });
    console.log(tag, "PAGEERROR", error.message);
  });
}

async function frames(page, count) {
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
}

async function ready(page) {
  await page.waitForFunction(() => window.__scenesReady && window.__network && window.__network.done && window.__samplerAudit, null, { timeout: 240000 });
  await page.waitForFunction(() => {
    const poster = document.querySelector(".net-poster");
    const unavailable = document.querySelector(".net")?.getAttribute("data-unavailable");
    return unavailable === "1" || !poster || Number(getComputedStyle(poster).opacity) < 0.05;
  }, null, { timeout: 120000 }).catch(() => {});
}

async function seek(page, t) {
  await page.evaluate((time) => window.__seek(time), t);
  await frames(page, 3);
}

async function audit(page) {
  return page.evaluate(() => {
    const state = window.__samplerAudit || null;
    const unavailable = document.querySelector(".net")?.getAttribute("data-unavailable") || "";
    const note = document.querySelector(".net-unavailable")?.textContent || "";
    return { state, unavailable, note };
  });
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

async function meanDiff(next, prior) {
  if (!existsSync(prior)) return null;
  const left = await sharp(next).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(prior).resize(left.info.width, left.info.height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  let sum = 0;
  const pixels = left.data.length / 4;
  for (let i = 0; i < left.data.length; i += 4) {
    sum += Math.abs(left.data[i] - right[i]) + Math.abs(left.data[i + 1] - right[i + 1]) + Math.abs(left.data[i + 2] - right[i + 2]);
  }
  return Number((sum / (pixels * 3)).toFixed(3));
}

async function sheet(dir, files, out) {
  const cellW = 480;
  const cellH = 300;
  const cols = 4;
  const buffers = await Promise.all(files.map((file) => sharp(`${dir}/${file}`).resize(cellW, cellH, { fit: "cover" }).png().toBuffer()));
  const rows = Math.ceil(buffers.length / cols);
  await sharp({
    create: { width: cols * cellW, height: rows * cellH, channels: 3, background: "#efe6d6" },
  })
    .composite(buffers.map((input, index) => ({ input, left: (index % cols) * cellW, top: Math.floor(index / cols) * cellH })))
    .png()
    .toFile(out);
}

const summary = [];
if (only.includes("sweep") || only.includes("hero") || only.includes("layers") || only.includes("loss") || only.includes("probe")) {
  for (const view of views) {
    if (view.id === "mobile" && !only.includes("sweep") && !only.includes("probe")) continue;
    await mkdir(`${root}/${view.id}`, { recursive: true });
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    await cap(context);
    const page = await context.newPage();
    watch(page, view.id);
    const q = new URLSearchParams({ shot: "1", ui: "1", src: "ktx", w: String(view.width), h: String(view.height), t: "6" });
    if (view.mobile) q.set("mobile", "1");
    console.log(view.id, "open");
    await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await ready(page);
    const first = await audit(page);
    console.log(view.id, "audit", JSON.stringify({
      maxUnits: first.state?.maxUnits,
      budget: first.state?.budget,
      fault: first.state?.fault,
      programs: (first.state?.programs || []).map((row) => ({ name: row.name, count: row.count, linked: row.linked })),
      unavailable: first.unavailable,
    }));
    summary.push({ view: view.id, id: "audit-open", maxUnits: first.state?.maxUnits, budget: first.state?.budget, fault: first.state?.fault, programs: first.state?.programs || [], unavailable: first.unavailable });
    if (only.includes("probe") && !only.includes("sweep")) {
      await seek(page, 24);
      await page.screenshot({ path: `${root}/${view.id}/probe-t24.png`, timeout: 120000 });
      const later = await audit(page);
      console.log(view.id, "probe-later", JSON.stringify({
        max: later.state?.programs?.reduce((m, row) => Math.max(m, row.count), 0),
        fault: later.state?.fault,
        names: later.state?.programs?.map((row) => `${row.count}:${row.samplers?.slice(0, 4).join("+")}`),
      }));
      await context.close();
      continue;
    }

    if (only.includes("sweep")) {
      const ball = [];
      for (const t of sweepTimes) {
        await seek(page, t);
        const signal = await page.evaluate(() => window.__points?.("SIGNAL_ball") || []);
        const file = `sweep-t${String(t).replace(".", "_")}.png`;
        await page.screenshot({ path: `${root}/${view.id}/${file}`, timeout: 120000 });
        const prior = `${previous}/${view.id}/${file}`;
        const diff = await meanDiff(`${root}/${view.id}/${file}`, prior);
        const at = signal[0] ? { x: Math.round(signal[0].x), y: Math.round(signal[0].y) } : null;
        ball.push({ t, at });
        const row = { view: view.id, id: "sweep", t, signal: at, diff };
        summary.push(row);
        console.log(view.id, "sweep", t, JSON.stringify(row));
      }
      await sheet(root + "/" + view.id, sweepTimes.map((t) => `sweep-t${String(t).replace(".", "_")}.png`), `${root}/${view.id}/sweep-sheet.png`);
      const moved = ball.filter((item) => item.at).length >= 3 && new Set(ball.filter((item) => item.at).map((item) => `${item.at.x},${item.at.y}`)).size > 1;
      summary.push({ view: view.id, id: "ball", moved, ball });
      const done = await audit(page);
      summary.push({
        view: view.id,
        id: "audit",
        maxUnits: done.state?.maxUnits,
        budget: done.state?.budget,
        fault: done.state?.fault,
        worst: (done.state?.programs || []).reduce((m, row) => Math.max(m, row.count), 0),
        programs: done.state?.programs || [],
        unavailable: done.unavailable,
      });
      console.log(view.id, "audit-done", JSON.stringify({ maxUnits: done.state?.maxUnits, worst: summary.at(-1).worst, fault: done.state?.fault, moved }));
    }

    if (view.id === "desktop" && only.includes("hero")) {
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
        for (let i = 0; i < 48; i += 1) {
          await frames(page, 1);
          after = await page.evaluate(() => window.__proof());
          if (after.age > 1.05 && after.squash?.length && after.beadOpacity < 0.45) break;
        }
        await page.screenshot({ path: `${root}/${view.id}/hero-after.png`, timeout: 120000 });
        const row = { view: view.id, id: "hero", ok: frac >= 0.15 && proof.bend > 0.05 && (after.squash?.length || 0) > 0 && after.beadOpacity < 0.85, frac: Number(frac.toFixed(3)), bend: Number(proof.bend.toFixed(3)), beadOpacity: after.beadOpacity };
        summary.push(row);
        console.log(view.id, "hero", JSON.stringify(row));
      }
    }

    if (view.id === "desktop" && only.includes("layers")) {
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

    if (view.id === "desktop" && only.includes("loss")) {
      await seek(page, 44);
      await page.screenshot({ path: `${root}/${view.id}/loss-before.png`, timeout: 120000 });
      const ball = onScreen(await page.evaluate(() => window.__points("LOSS_ball")), view.width, view.height)[0]
        || onScreen(await page.evaluate(() => window.__points("SIGNAL_ball")), view.width, view.height)[0];
      if (ball) {
        const from = aim(ball, view.width, view.height);
        await drag(page, from.x, from.y, from.x + view.width * 0.16, from.y + view.height * 0.08, 8, 0);
      }
      await page.screenshot({ path: `${root}/${view.id}/loss-mid.png`, timeout: 120000 });
      await page.mouse.up();
      let settled = await page.evaluate(() => window.__proof());
      let at25 = null;
      for (let i = 0; i < 70; i += 1) {
        await frames(page, 1);
        settled = await page.evaluate(() => window.__proof());
        if (i === 50) at25 = settled.ball;
        if (settled.ball && settled.ball.speed < 0.08 && band(settled.ball, view.width, view.height)) break;
      }
      await page.screenshot({ path: `${root}/${view.id}/loss-after.png`, timeout: 120000 });
      const after = settled.ball;
      const row = { view: view.id, id: "loss", ok: Boolean(ball) && band(after, view.width, view.height) && after && after.speed < 0.08, at25, after };
      summary.push(row);
      console.log(view.id, "loss", JSON.stringify(row));
    }

    await context.close();
  }
}

if (only.includes("audio")) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await cap(context);
  const page = await context.newPage();
  watch(page, "audio");
  console.log("audio", "open");
  await page.goto(`${base}?ui=1&src=ktx`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__audio && window.__seek && window.__samplerAudit, null, { timeout: 240000 });
  await page.click(".net-sound");
  let fired = [];
  for (let i = 0; i < 40 && !fired.includes("ambient-loop"); i += 1) {
    await frames(page, 2);
    fired = await page.evaluate(() => window.__audio.fired());
  }
  for (const t of [23.5, 24.7, 26.4, 28, 29.6, 37.2, 44, 48.4, 61]) {
    await seek(page, t);
    await frames(page, 4);
  }
  fired = await page.evaluate(() => window.__audio.fired());
  const state = await audit(page);
  const row = { id: "audio", fired, maxUnits: state.state?.maxUnits, fault: state.state?.fault };
  summary.push(row);
  console.log("audio", JSON.stringify(row));
  await context.close();
}

const shaderErrors = consoleLog.filter((row) => /shader error|useProgram|texture image units|VALIDATE_STATUS|3D unavailable/i.test(row.text));
await mkdir(root, { recursive: true });
await writeFile(`${root}/summary.json`, JSON.stringify({ summary, shaderErrors, consoleLog: consoleLog.filter((row) => row.type === "error" || row.type === "pageerror" || /audio |shader|sampler|unavailable/i.test(row.text)) }, null, 2));
await writeFile(`${root}/console.txt`, consoleLog.map((row) => `${row.tag} ${row.type} ${row.text}`).join("\n"));
console.log("shader-errors", shaderErrors.length);
await browser.close();
if (shaderErrors.length) process.exitCode = 1;
