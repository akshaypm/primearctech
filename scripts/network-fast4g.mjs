import { chromium } from "@playwright/test";

const base = process.env.NETWORK_URL || "http://localhost:3456/lab/network";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
const client = await page.context().newCDPSession(page);
await client.send("Network.enable");
await client.send("Network.setCacheDisabled", { cacheDisabled: true });
await client.send("Network.emulateNetworkConditions", {
  offline: false,
  downloadThroughput: (1.6 * 1000 * 1000) / 8,
  uploadThroughput: (750 * 1000) / 8,
  latency: 150,
});
await page.goto(base, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForFunction(() => window.__boot && window.__boot.first3d > 0, null, { timeout: 240000 });
const first = await page.evaluate(() => window.__boot);
console.log("first", JSON.stringify(first));
await page.waitForFunction(() => window.__boot && window.__boot.heroReady > 0, null, { timeout: 240000 });
const boot = await page.evaluate(() => window.__boot);
console.log("hero", JSON.stringify(boot));
await browser.close();
