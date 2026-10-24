import { mkdir, rename, rm } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const root = "/opt/cursor/artifacts/network/round7";
const probe = process.env.PROBE === "1";
const only = (process.env.ONLY || "").split(",").filter(Boolean);
const views = [
  { id: "desktop", width: 1440, height: 900, mobile: false },
  { id: "mobile", width: 390, height: 844, mobile: true },
].filter((view) => !process.env.VIEW || process.env.VIEW === view.id);

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
  await page.waitForFunction(() => window.__network && window.__network.done && window.__points && window.__proof, null, { timeout: 180000 });
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
  return list.filter((item) => {
    const box = item.box;
    if (!box) return item.visible && item.x > 8 && item.y > 8 && item.x < width - 8 && item.y < height - 8;
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

function stack(dir, id) {
  const files = ["before", "mid", "after"].map((name) => `${dir}/${id}-${name}.png`);
  const out = `${dir}/${id}-compare.png`;
  const result = spawnSync("ffmpeg", ["-y", "-i", files[0], "-i", files[1], "-i", files[2], "-filter_complex", "hstack=inputs=3", out], { stdio: "ignore" });
  return result.status === 0 ? out : "";
}

const summary = [];

for (const view of views) {
  await mkdir(`${root}/${view.id}`, { recursive: true });
  const want = (id) => !only.length || only.includes(id);
  const clip = !probe && only.length === 1 && only[0] !== "hovers" ? only[0] : "";
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    recordVideo: clip ? { dir: "/tmp/r7-video", size: { width: view.width, height: view.height } } : undefined,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(view.id, "PAGEERROR", error.message));
  const q = new URLSearchParams({ shot: "1", ui: "1", src: "ktx", w: String(view.width), h: String(view.height), t: "8" });
  if (view.mobile) q.set("mobile", "1");
  console.log(view.id, "open");
  await page.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await ready(page);

  if (want("hero")) {
    await seek(page, 8);
    const copy = await page.locator(".net-copy").boundingBox();
    const nodes = onScreen(await page.evaluate(() => window.__points("HERO_n")), view.width, view.height).filter((item) => {
      if (item.name.startsWith("HERO_n3")) return false;
      if (!copy) return true;
      const at = aim(item, view.width, view.height);
      return at.x < copy.x || at.x > copy.x + copy.width || at.y < copy.y || at.y > copy.y + copy.height;
    });
    const node = nodes.sort((a, b) => Math.abs(a.y - view.height * 0.42) - Math.abs(b.y - view.height * 0.42))[0];
    await page.screenshot({ path: `${root}/${view.id}/hero-before.png` });
    if (!node) {
      summary.push({ view: view.id, id: "hero", ok: false, reason: "no node" });
    } else {
      const from = aim(node, view.width, view.height);
      const dy = view.height * 0.2 * (from.y > view.height * 0.5 ? -1 : 1);
      await drag(page, from.x, from.y, from.x + view.width * 0.04, from.y + dy, 8, 6);
      const mid = (await page.evaluate(() => window.__points("HERO_n"))).find((item) => item.name === node.name);
      const proof = await page.evaluate(() => window.__proof());
      const frac = mid ? Math.hypot(mid.x - node.x, mid.y - node.y) / view.height : 0;
      await page.screenshot({ path: `${root}/${view.id}/hero-mid.png` });
      await page.mouse.up();
      let after = await page.evaluate(() => window.__proof());
      for (let i = 0; i < 40; i += 1) {
        await frames(page, 1);
        after = await page.evaluate(() => window.__proof());
        if (after.pulse > 0 && after.home < 0.08 && after.squash?.length && after.age >= 1.7) break;
        if (after.age > 2.3 && after.pulse > 0) break;
      }
      await page.screenshot({ path: `${root}/${view.id}/hero-after.png` });
      const row = { view: view.id, id: "hero", ok: frac >= 0.15 && proof.bend > 0.05 && after.pulse > 0, frac: Number(frac.toFixed(3)), bend: Number(proof.bend.toFixed(3)), pull: Number(proof.pull.toFixed(3)), pulse: after.pulse, jobs: after.jobs, bead: after.bead, rod: Number(proof.rod.toFixed(3)), age: Number((after.age || 0).toFixed(3)), home: Number((after.home || 0).toFixed(3)), squash: after.squash, node: node.name };
      summary.push(row);
      console.log(view.id, "hero", JSON.stringify(row));
      stack(`${root}/${view.id}`, "hero");
    }
  }

  if (want("layers")) {
    await seek(page, 24);
    await page.screenshot({ path: `${root}/${view.id}/layers-before.png` });
    const blocks = onScreen(await page.evaluate(() => window.__points("LAYERS_blk")), view.width, view.height);
    const block = blocks.sort((a, b) => b.y - a.y)[0];
    if (block) {
      const from = aim(block, view.width, view.height);
      await drag(page, from.x, from.y, from.x, Math.max(40, from.y - view.height * 0.28), 8, 4);
    }
    const labels = await page.evaluate(() =>
      [...document.querySelectorAll(".net-callout")].filter((node) => node.getAttribute("data-hidden") !== "1").map((node) => {
        const style = getComputedStyle(node);
        const text = getComputedStyle(node.querySelector(".net-call") || node);
        return { text: node.innerText.replace(/\s+/g, " "), color: text.color, background: style.backgroundColor };
      }),
    );
    const proof = await page.evaluate(() => window.__proof());
    await page.screenshot({ path: `${root}/${view.id}/layers-mid.png` });
    await page.mouse.up();
    await frames(page, 6);
    await page.screenshot({ path: `${root}/${view.id}/layers-after.png` });
    const row = { view: view.id, id: "layers", ok: proof.spread > 0.4 && labels.every((label) => label.color === "rgb(34, 34, 34)"), spread: proof.spread, labels };
    summary.push(row);
    console.log(view.id, "layers", JSON.stringify(row));
    stack(`${root}/${view.id}`, "layers");
  }

  if (want("loss")) {
    await seek(page, 44);
    const text = await page.locator(".net-copy").innerText();
    await page.screenshot({ path: `${root}/${view.id}/loss-before.png` });
    const ball = onScreen(await page.evaluate(() => window.__points("LOSS_ball")), view.width, view.height)[0];
    if (ball) {
      const from = aim(ball, view.width, view.height);
      await drag(page, from.x, from.y, from.x + view.width * 0.16, from.y + view.height * 0.1, 8, 0);
    }
    const mid = await page.evaluate(() => window.__proof());
    await page.screenshot({ path: `${root}/${view.id}/loss-mid.png` });
    await page.mouse.up();
    let settled = mid;
    for (let i = 0; i < 120; i += 1) {
      await frames(page, 1);
      settled = await page.evaluate(() => window.__proof());
      if (settled.ball && settled.ball.speed < 0.12 && settled.ball.basin >= 0 && settled.ball.basin < 0.55) break;
    }
    await page.screenshot({ path: `${root}/${view.id}/loss-after.png` });
    const empty = /placeholder|hours saved|error rate|response time/i.test(text);
    const rolled = mid.ball && settled.ball ? Math.hypot(mid.ball.x - settled.ball.x, mid.ball.z - settled.ball.z) : 0;
    const seen = Boolean(settled.ball) && settled.ball.sx > 48 && settled.ball.sy > 48 && settled.ball.sx < view.width - 48 && settled.ball.sy < view.height - 48;
    const row = {
      view: view.id,
      id: "loss",
      ok: Boolean(ball) && !empty && seen && settled.ball.basin >= 0 && settled.ball.basin < 0.55 && settled.ball.speed < 0.15 && Math.abs(settled.ball.gap) < 0.02 && rolled > 0.4,
      moved: Number(rolled.toFixed(3)),
      empty,
      before: ball ? { x: ball.x, y: ball.y } : null,
      mid: mid.ball,
      after: settled.ball,
    };
    summary.push(row);
    console.log(view.id, "loss", JSON.stringify(row));
    stack(`${root}/${view.id}`, "loss");
  }

  const video = clip ? page.video() : null;
  await context.close();
  if (video) {
    const src = await video.path();
    if (src) {
      const dest = `${root}/${view.id}/${clip}.webm`;
      const packed = spawnSync("ffmpeg", ["-y", "-i", src, "-c:v", "libvpx", "-b:v", "420k", "-an", "-deadline", "realtime", dest], { stdio: "ignore" });
      if (packed.status === 0) await rm(src, { force: true });
      else await rename(src, dest);
      console.log(view.id, "clip", `${clip}.webm`);
    }
  }

  if (want("hovers")) {
    const hoverContext = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    const hover = await hoverContext.newPage();
    hover.on("pageerror", (error) => console.log(view.id, "HOVER", error.message));
    await hover.goto(`${base}?${q}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await ready(hover);
    const shots = [
      ["input", 15, "INPUT_fg"],
      ["threads", 34, "ATTN_th"],
      ["pebbles", 52, "EMB_peb"],
    ];
    for (const [id, t, prefix] of shots) {
      await seek(hover, t);
      const items = onScreen(await hover.evaluate((name) => window.__points(name), prefix), view.width, view.height);
      const item = items[Math.min(2, items.length - 1)];
      if (item) {
        const at = aim(item, view.width, view.height);
        await hover.mouse.move(at.x, at.y);
        await frames(hover, 10);
      }
      await hover.screenshot({ path: `${root}/${view.id}/hover-${id}.png` });
      const bend = await hover.evaluate(() => window.__bend());
      console.log(view.id, "hover", id, items.length, bend);
    }
    await seek(hover, 34);
    const spheres = onScreen(await hover.evaluate(() => window.__points("ATTN_")), view.width, view.height);
    const sphere = spheres.find((item) => ["ATTN_chain", "ATTN_coil", "ATTN_tile22"].includes(item.name)) || spheres[0];
    if (sphere) {
      const at = aim(sphere, view.width, view.height);
      await hover.mouse.click(at.x, at.y);
      for (let i = 0; i < 24; i += 1) {
        await frames(hover, 1);
        const u = await hover.evaluate(() => Number(getComputedStyle(document.querySelector(".net-veil")).opacity));
        if (u > 0.72) break;
      }
    }
    await hover.screenshot({ path: `${root}/${view.id}/hover-dive.png` });
    const sheet = `${root}/${view.id}/hovers.png`;
    spawnSync(
      "ffmpeg",
      ["-y", "-i", `${root}/${view.id}/hover-input.png`, "-i", `${root}/${view.id}/hover-threads.png`, "-i", `${root}/${view.id}/hover-pebbles.png`, "-i", `${root}/${view.id}/hover-dive.png`, "-filter_complex", "xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0", sheet],
      { stdio: "ignore" },
    );
    await hoverContext.close();
    summary.push({ view: view.id, id: "hovers", sheet });
  }
}

await browser.close();
console.log(JSON.stringify(summary, null, 2));
const failed = summary.some((row) => row.ok === false);
if (failed) process.exit(1);
