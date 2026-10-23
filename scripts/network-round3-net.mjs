import { chromium } from "@playwright/test";

const base = process.env.NETWORK_URL || "http://127.0.0.1:3460/lab/network";
const profiles = [
  { id: "fast-4g", downMbps: 9, upKbps: 1500, latency: 50 },
  { id: "slow-4g", downMbps: 1.6, upKbps: 750, latency: 150 },
];

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

for (const profile of profiles) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => console.log("PAGEERROR", profile.id, error.message));
  await page.addInitScript(() => {
    window.__lcp = { t: 0, tag: "", url: "" };
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (!last) return;
      window.__lcp = {
        t: last.startTime,
        tag: last.element ? last.element.tagName : "",
        url: last.url || "",
      };
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (profile.downMbps * 1e6) / 8,
    uploadThroughput: (profile.upKbps * 1000) / 8,
    latency: profile.latency,
  });
  const started = Date.now();
  await page.goto(base, { waitUntil: "commit", timeout: 180000 });
  await page.waitForFunction(() => window.__boot && window.__boot.heroFrame > 0, null, { timeout: 180000 });
  const report = await page.evaluate(() => {
    const boot = window.__boot;
    const entries = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    const rows = entries
      .filter((entry) => entry.responseEnd > 0 && entry.responseEnd <= boot.heroFrame + 30)
      .map((entry) => ({
        name: entry.name.replace(location.origin, "").split("?")[0],
        bytes: entry.transferSize || 0,
        encoded: entry.encodedBodySize || 0,
        end: Math.round(entry.responseEnd),
      }));
    const sum = rows.reduce((total, row) => total + row.bytes, 0);
    const unique = new Map();
    for (const row of rows) {
      const prev = unique.get(row.name);
      if (!prev || row.bytes > prev) unique.set(row.name, row.bytes);
    }
    const uniqueBytes = [...unique.values()].reduce((total, bytes) => total + bytes, 0);
    const networkEnd = rows.reduce((max, row) => Math.max(max, row.end), 0);
    const poster = rows.filter((row) => row.name.includes("/poster/"));
    return {
      firstPaint: Math.round(boot.firstPaint || 0),
      heroReady: Math.round(boot.heroReady || 0),
      heroFrame: Math.round(boot.heroFrame || 0),
      playLoader: Boolean(boot.playLoader),
      lcp: window.__lcp,
      nav: nav ? Math.round(nav.responseEnd) : 0,
      bytes: sum,
      uniqueBytes,
      poster,
      networkEnd,
      count: rows.length,
      rows: rows.sort((a, b) => b.bytes - a.bytes).slice(0, 40),
    };
  });
  console.log(
    JSON.stringify({
      profile: profile.id,
      downBps: (profile.downMbps * 1e6) / 8,
      upBps: (profile.upKbps * 1000) / 8,
      latencyMs: profile.latency,
      wallMs: Date.now() - started,
      ...report,
    }),
  );
  await page.close();
}

await browser.close();
