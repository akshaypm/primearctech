import { chromium } from "@playwright/test";

const shots = [
  ["hero", 8, "hero"],
  ["input", 15, "input"],
  ["layers", 24, "layers"],
  ["products", 34, "products"],
  ["loss", 44, "loss"],
  ["pebbles", 52, "pebbles"],
  ["ripple", 60, "ripple"],
];

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

async function run(name, viewport, query) {
  const dir = `/opt/cursor/artifacts/network/round5/${name}`;
  const context = await browser.newContext({ viewport, recordVideo: { dir, size: viewport } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(name, "PAGEERROR", error.message));
  console.log(name, "open");
  await page.goto(`http://localhost:3456/lab/network?${query}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForFunction(() => window.__network && window.__network.done && window.__hands, null, { timeout: 300000 });
  console.log(name, "ready", JSON.stringify(await page.evaluate(() => window.__network.mem)));
  for (const [id, t, kind] of shots) {
    await page.evaluate((time) => window.__seek(time), t);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/${id}-before.png` });
    await page.evaluate((gesture) => window.__hands.play(gesture), kind);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${dir}/${id}-mid.png` });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${dir}/${id}-after.png` });
    const info = await page.evaluate(() => ({
      t: window.__network?.t,
      gpu: window.__network?.mem?.gpuResident,
      textures: window.__network?.mem?.textures,
    }));
    console.log(name, id, JSON.stringify(info));
  }
  await page.waitForTimeout(400);
  await context.close();
  console.log(name, "closed");
}

await run("desktop", { width: 1440, height: 900 }, "shot=1&ui=1&src=ktx&w=1440&h=900&t=8");
await run("mobile", { width: 390, height: 844 }, "shot=1&ui=1&src=ktx&mobile=1&w=390&h=844&t=8");
await browser.close();
console.log("round5 recordings done");
