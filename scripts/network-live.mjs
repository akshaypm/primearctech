import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") console.log(msg.type(), msg.text().slice(0, 300));
});
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
page.on("requestfailed", (req) => console.log("FAIL", req.url(), req.failure()?.errorText));
await page.goto("http://localhost:3456/lab/network", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(20000);
const early = await page.evaluate(() => ({
  text: document.body.innerText.slice(0, 400),
  canvases: document.querySelectorAll("canvas").length,
  h1: document.querySelector("h1")?.textContent || null,
}));
console.log("EARLY", JSON.stringify(early));
await page.screenshot({ path: "/opt/cursor/artifacts/network/page-boot.png" });
await page.waitForSelector("h1", { timeout: 90000 });
await page.screenshot({ path: "/opt/cursor/artifacts/network/page-hero.png" });
const hero = await page.locator("h1").innerText();
console.log("H1", hero);
await page.evaluate(() => {
  const spacer = document.querySelector("[data-network-spacer]");
  window.scrollTo(0, spacer.getBoundingClientRect().height * 0.45);
});
await page.waitForTimeout(800);
await page.screenshot({ path: "/opt/cursor/artifacts/network/page-mid.png" });
const routes = ["/fieldrelay", "/build-brief", "/privacy", "/terms", "/security", "/lab/swarm"];
for (const route of routes) {
  const res = await page.goto(`http://localhost:3456${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log(route, res?.status(), (await page.title()).slice(0, 80));
}
await browser.close();
