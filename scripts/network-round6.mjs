import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const root = "/opt/cursor/artifacts/network/round6";
const probe = process.env.PROBE === "1";
const only = process.env.ONLY || "";
const views = [
  { id: "desktop", width: 1440, height: 900, mobile: false },
  { id: "mobile", width: 390, height: 844, mobile: true },
].filter((view) => !process.env.VIEW || process.env.VIEW === view.id);

const shots = [
  ["hero", 8],
  ["input", 15],
  ["layers", 24],
  ["products", 34],
  ["loss", 44],
  ["pebbles", 52],
  ["ripple", 60],
].filter((row) => !only || only.split(",").includes(row[0]));

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

async function frames(page, count = 1) {
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
}

async function points(page, prefix) {
  return page.evaluate((name) => window.__points(name), prefix);
}

function intersects(item, width, height) {
  const box = item.box;
  if (box && box.x1 > box.x0 && box.y1 > box.y0) {
    const ix = Math.min(box.x1, width - 8) - Math.max(box.x0, 8);
    const iy = Math.min(box.y1, height - 8) - Math.max(box.y0, 8);
    return ix > 10 && iy > 10;
  }
  return item.visible && item.x > 8 && item.y > 8 && item.x < width - 8 && item.y < height - 8;
}

function onScreen(list, width, height) {
  return list.filter((item) => intersects(item, width, height));
}

function aim(item, width, height) {
  if (item.box && item.box.x1 > item.box.x0) {
    return {
      x: Math.min(width - 12, Math.max(12, (item.box.x0 + item.box.x1) / 2)),
      y: Math.min(height - 12, Math.max(12, (item.box.y0 + item.box.y1) / 2)),
    };
  }
  return {
    x: Math.min(width - 12, Math.max(12, item.x)),
    y: Math.min(height - 12, Math.max(12, item.y)),
  };
}

function brief(list) {
  return list.slice(0, 6).map((item) => ({
    name: item.name,
    x: Math.round(item.x),
    y: Math.round(item.y),
    visible: item.visible,
    box: item.box ? [Math.round(item.box.x0), Math.round(item.box.y0), Math.round(item.box.x1), Math.round(item.box.y1)] : null,
  }));
}

async function drag(page, x0, y0, x1, y1, steps) {
  await page.mouse.move(x0, y0);
  await frames(page, 1);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    const u = i / steps;
    await page.mouse.move(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u);
    await frames(page, 1);
  }
}

async function gesture(page, id, view, snap) {
  const { width, height } = view;
  if (id === "hero") {
    const nodes = onScreen(await points(page, "HERO_n"), width, height);
    const node = nodes.sort((a, b) => Math.hypot(a.x - width / 2, a.y - height / 2) - Math.hypot(b.x - width / 2, b.y - height / 2))[0];
    if (!node) return { ok: false, reason: "no hero node" };
    const before = node;
    const from = aim(node, width, height);
    await drag(page, from.x, from.y, from.x + Math.min(220, width * 0.28), from.y - 30, 6);
    const mid = (await points(page, "HERO_n")).find((item) => item.name === node.name);
    if (snap) await snap("mid");
    await page.mouse.up();
    await frames(page, 2);
    const moved = mid ? Math.hypot(mid.wx - before.wx, mid.wy - before.wy, mid.wz - before.wz) : 0;
    return { ok: moved > 0.25, moved: Number(moved.toFixed(3)), name: node.name };
  }
  if (id === "input") {
    const allSheets = await points(page, "INPUT_fg");
    const allFeeds = await points(page, "INPUT_feed");
    const sheets = onScreen(allSheets, width, height);
    const feeds = onScreen(allFeeds, width, height);
    const sheet = sheets[0];
    const feed = feeds[0];
    if (!sheet || !feed) return { ok: false, reason: "missing sheet or feed", sheets: brief(allSheets), feeds: brief(allFeeds) };
    const from = aim(sheet, width, height);
    const to = aim(feed, width, height);
    await drag(page, from.x, from.y, to.x, to.y, 7);
    if (snap) await snap("mid");
    await page.mouse.up();
    await frames(page, 3);
    const after = (await points(page, "INPUT_fg")).find((item) => item.name === sheet.name);
    const moved = after ? Math.hypot(after.wx - sheet.wx, after.wy - sheet.wy, after.wz - sheet.wz) : 0;
    return { ok: moved > 0.4, moved: Number(moved.toFixed(3)), name: sheet.name, feed: feed.name };
  }
  if (id === "layers") {
    const blocks = onScreen(await points(page, "LAYERS_blk"), width, height);
    const block = blocks.sort((a, b) => a.y - b.y)[Math.min(1, blocks.length - 1)] || blocks[0];
    if (!block) return { ok: false, reason: "no layer block", raw: brief(await points(page, "LAYERS_blk")) };
    const from = aim(block, width, height);
    await drag(page, from.x, from.y, from.x, Math.max(70, from.y - height * 0.34), 7);
    const mid = (await points(page, "LAYERS_blk")).find((item) => item.name === block.name);
    if (snap) await snap("mid");
    await page.mouse.up();
    const moved = mid ? mid.wy - block.wy : 0;
    return { ok: Math.abs(moved) > 0.2, moved: Number(moved.toFixed(3)), name: block.name };
  }
  if (id === "products") {
    const threads = onScreen(await points(page, "ATTN_th"), width, height);
    if (threads.length < 2) return { ok: false, reason: "threads", count: threads.length, raw: brief(await points(page, "ATTN_th")) };
    const ordered = [...threads].sort((a, b) => a.x - b.x);
    const a = aim(ordered[0], width, height);
    const b = aim(ordered[ordered.length - 1], width, height);
    await page.mouse.move(a.x, a.y);
    await frames(page, 1);
    let bend = 0;
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      const u = i / steps;
      await page.mouse.move(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
      await frames(page, 1);
      bend = Math.max(bend, await page.evaluate(() => window.__bend()));
    }
    if (snap) await snap("mid");
    const spheres = onScreen(await points(page, "ATTN_"), width, height).filter((item) => ["ATTN_coil", "ATTN_chain", "ATTN_tile22"].includes(item.name));
    const sphere = spheres.find((item) => item.name === "ATTN_coil") || spheres.find((item) => item.name === "ATTN_chain") || spheres[0];
    if (sphere) {
      const at = aim(sphere, width, height);
      await page.mouse.click(at.x, at.y);
      await frames(page, 4);
    }
    return { ok: bend >= 0.3 && Boolean(sphere), bend: Number(bend.toFixed(3)), sphere: sphere?.name || "" };
  }
  if (id === "loss") {
    const all = await points(page, "LOSS_ball");
    const balls = onScreen(all, width, height);
    const ball = balls[0] || all[0];
    if (!ball) return { ok: false, reason: "no ball", count: all.length };
    const span = ball.box ? Math.max(ball.box.x1 - ball.box.x0, ball.box.y1 - ball.box.y0) : 0;
    const fraction = span / Math.min(width, height);
    const from = aim(ball, width, height);
    const landX = Math.min(width - 28, Math.max(28, from.x + width * 0.36));
    const landY = Math.min(height - 28, Math.max(80, from.y - height * 0.16));
    await drag(page, from.x, from.y, landX, landY, 10);
    const mid = (await points(page, "LOSS_ball"))[0];
    if (snap) await snap("mid");
    await page.mouse.up();
    await frames(page, 4);
    const after = (await points(page, "LOSS_ball"))[0];
    const moved = after ? Math.hypot((after.wx || 0) - ball.wx, (after.wz || 0) - ball.wz) : 0;
    return {
      ok: fraction < 0.22 && fraction > 0.008 && moved > 0.35,
      fraction: Number(fraction.toFixed(3)),
      moved: Number(moved.toFixed(3)),
      at: brief([ball]),
      mid: mid ? [Number(mid.wx.toFixed(2)), Number(mid.wz.toFixed(2))] : null,
    };
  }
  if (id === "pebbles") {
    const all = await points(page, "EMB_peb");
    const pebbles = onScreen(all, width, height);
    if (pebbles.length < 4) return { ok: false, reason: "pebbles", count: pebbles.length, raw: brief(all) };
    const cluster = [...pebbles].sort((a, b) => a.x - b.x).slice(0, 8);
    const before = all;
    const start = aim(cluster[0], width, height);
    await page.mouse.move(start.x, start.y);
    await frames(page, 1);
    for (const pebble of cluster) {
      const at = aim(pebble, width, height);
      await page.mouse.move(at.x, at.y);
      await frames(page, 1);
    }
    if (snap) await snap("mid");
    const after = await points(page, "EMB_peb");
    let max = 0;
    for (const item of after) {
      const was = before.find((row) => row.name === item.name);
      if (!was) continue;
      max = Math.max(max, Math.hypot(item.wx - was.wx, item.wy - was.wy, item.wz - was.wz));
    }
    return { ok: max >= 0.5, moved: Number(max.toFixed(3)), count: pebbles.length };
  }
  const x = width * 0.5;
  const y = height * 0.62;
  await page.mouse.click(x, y);
  await frames(page, 1);
  if (snap) await snap("mid");
  await frames(page, 1);
  return { ok: true, x, y };
}

const summary = [];
for (const view of views) {
  await mkdir(`${root}/${view.id}`, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    recordVideo: probe ? undefined : { dir: `${root}/${view.id}`, size: { width: view.width, height: view.height } },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(view.id, "PAGEERROR", error.message));
  const q = new URLSearchParams({ shot: "1", ui: "1", src: "ktx", w: String(view.width), h: String(view.height), t: "8" });
  if (view.mobile) q.set("mobile", "1");
  const opened = Date.now();
  console.log(view.id, "open");
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForFunction(() => window.__network && window.__network.done && window.__points, null, { timeout: 300000 });
  await page.waitForFunction(() => {
    const poster = document.querySelector(".net-poster");
    return !poster || Number(getComputedStyle(poster).opacity) < 0.05;
  }, null, { timeout: 120000 }).catch(() => console.log(view.id, "poster still up"));
  const cuts = [];
  for (const [id, t] of shots) {
    const start = (Date.now() - opened) / 1000;
    await page.evaluate((time) => window.__seek(time), t);
    await frames(page, 2);
    await page.screenshot({ path: `${root}/${view.id}/${id}-before.png` });
    const result = await gesture(page, id, view, async (phase) => {
      if (phase === "mid") await page.screenshot({ path: `${root}/${view.id}/${id}-mid.png` });
    });
    if (!result || result.ok === false) {
      /* mid shot is skipped when the gesture returns early */
    }
    await frames(page, 2);
    await page.screenshot({ path: `${root}/${view.id}/${id}-after.png` });
    const end = (Date.now() - opened) / 1000;
    cuts.push({ id, start: Math.max(0, start - 0.15), end: end + 0.25, result });
    console.log(view.id, id, JSON.stringify(result));
    summary.push({ view: view.id, id, ...result });
  }
  await context.close();
  if (!probe) {
    const video = page.video();
    const src = video ? await video.path() : "";
    console.log(view.id, "video", src, JSON.stringify(cuts));
    if (src) {
      const { spawnSync } = await import("node:child_process");
      for (const cut of cuts) {
        const target = `${root}/${view.id}/${cut.id}.webm`;
        const run = spawnSync("ffmpeg", ["-y", "-ss", String(cut.start), "-to", String(cut.end), "-i", src, "-an", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", target], { stdio: "inherit" });
        if (run.status !== 0) console.log("ffmpeg failed", cut.id, run.status);
      }
    }
  }
}

await browser.close();
const bad = summary.filter((row) => row.ok === false);
console.log("summary", JSON.stringify(summary, null, 2));
if (bad.length) process.exit(1);
