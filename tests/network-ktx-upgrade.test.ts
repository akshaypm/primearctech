import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { describe, it } from "vitest";
import { chromium, type ConsoleMessage, type Page } from "@playwright/test";

const chrome = "/usr/bin/google-chrome";
const outDir = "/opt/cursor/artifacts/network/round11";

function cap() {
  const orig = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, attrs?: unknown) => WebGL2RenderingContext | null;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: CanvasRenderingContext2DSettings) {
    const gl = orig.call(this, type, attrs);
    if (gl && String(type) === "webgl2") {
      const getParameter = gl.getParameter.bind(gl);
      gl.getParameter = ((pname: number) => (pname === 0x8872 ? 16 : getParameter(pname))) as WebGL2RenderingContext["getParameter"];
    }
    return gl;
  } as HTMLCanvasElement["getContext"];
}

async function frames(page: Page, count: number) {
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
}

async function stateOf(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector(".net");
    const poster = document.querySelector(".net-poster");
    const points = window.__points?.("HERO_n") || [];
    return {
      intro: root?.getAttribute("data-intro") || "",
      beat: root?.getAttribute("data-beat") || "",
      poster: root?.getAttribute("data-poster") || "",
      unavailable: root?.getAttribute("data-unavailable") || "",
      opacity: poster ? Number(getComputedStyle(poster).opacity) : -1,
      points: points.filter((point) => point.visible).length,
      hooked: Boolean(window.__points),
      scenes: Boolean(window.__scenesReady),
      audit: window.__textureAudit?.done === true,
      auditCount: window.__textureAudit?.count || 0,
    };
  });
}

describe("network boot texture upgrade and hero pick", () => {
  it("uploads full-tier KTX and bends the hero from the post-load drag", async () => {
    assert.ok(existsSync(chrome), "chrome is required to compile the boot upgrade");
    mkdirSync(`${outDir}/desktop`, { recursive: true });
    const warnings: string[] = [];
    const errors: string[] = [];
    const browser = await chromium.launch({
      executablePath: chrome,
      headless: true,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(cap);
    page.on("console", (msg: ConsoleMessage) => {
      const text = msg.text();
      if (/glCompressedTexSubImage2D|compressedTexSubImage2D|subregion dimensions|Texture level does not exist/i.test(text)) warnings.push(text);
      if (msg.type() === "error") errors.push(text.slice(0, 300));
    });
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 300)));
    await page.goto("http://localhost:3456/lab/network", { waitUntil: "domcontentloaded", timeout: 120000 });
    const readyDeadline = Date.now() + 240000;
    let ready = false;
    let last = "";
    while (Date.now() < readyDeadline) {
      const state = await stateOf(page);
      const line = JSON.stringify(state);
      if (line !== last) {
        console.log("hero", line);
        last = line;
      }
      ready = state.opacity < 0.05 && state.intro === "0" && state.beat === "hero" && state.points > 0 && state.hooked && state.unavailable !== "1";
      if (ready) break;
      await page.waitForTimeout(1000);
    }
    assert.ok(ready, `hero never became interactive: ${last}; errors ${errors.slice(0, 4).join(" | ")}`);
    const nearest = await page.evaluate(() => {
      const points = window.__points!("HERO_n").filter((point) => point.visible);
      return points
        .map((point) => {
          const box = point.box;
          const inside = box ? 820 >= box.x0 - 28 && 820 <= box.x1 + 28 && 330 >= box.y0 - 28 && 330 <= box.y1 + 28 : false;
          return { name: point.name, x: Math.round(point.x), y: Math.round(point.y), d: Math.round(Math.hypot(point.x - 820, point.y - 330)), inside, box };
        })
        .sort((a, b) => a.d - b.d)
        .slice(0, 8);
    });
    console.log("nearest", JSON.stringify(nearest));
    await page.screenshot({ path: `${outDir}/desktop/hero-before.png` });
    await page.mouse.move(820, 330);
    await page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i += 1) {
      const u = i / steps;
      await page.mouse.move(820 + (700 - 820) * u, 330 + (500 - 330) * u);
      await frames(page, 1);
    }
    const held = await page.evaluate(() => window.__proof!());
    console.log("held", JSON.stringify(held));
    await page.screenshot({ path: `${outDir}/desktop/hero-after.png` });
    await page.mouse.up();
    await page.evaluate(() => window.__seek?.(8));
    const auditDeadline = Date.now() + 360000;
    let settled = false;
    while (Date.now() < auditDeadline) {
      const state = await stateOf(page);
      const line = JSON.stringify(state);
      if (line !== last) {
        console.log("audit", line);
        last = line;
      }
      settled = state.audit && state.scenes && state.auditCount > 0;
      if (settled) break;
      await page.waitForTimeout(1000);
    }
    await frames(page, 8);
    const audit = await page.evaluate(() => window.__textureAudit!);
    await browser.close();
    assert.ok(settled, `texture upgrade did not finish: ${last}; errors ${errors.slice(0, 4).join(" | ")}`);
    assert.deepEqual(warnings, [], warnings.slice(0, 4).join("\n"));
    assert.equal(audit.mismatches.length, 0, JSON.stringify(audit.mismatches.slice(0, 6)));
    assert.ok(audit.count > 0, "no compressed maps were audited");
    assert.ok(held.bend > 0.01 || held.pull > 0.02, `no bend from (820,330) to (700,500); nearest ${JSON.stringify(nearest)}; proof ${JSON.stringify(held)}`);
  }, 720000);
});

declare global {
  interface Window {
    __points?: (prefix: string) => { name: string; x: number; y: number; visible: boolean; box: { x0: number; y0: number; x1: number; y1: number } | null }[];
    __proof?: () => { bend: number; pull: number; home: number };
    __textureAudit?: { done: boolean; count: number; mismatches: { url: string; width: number; expected: number; boot: boolean }[] };
    __scenesReady?: boolean;
    __seek?: (time: number) => void;
  }
}
