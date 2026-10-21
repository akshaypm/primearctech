import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COPY_NOTE, NEXT_SECTION_COPY, bootLine } from "../app/lab/swarm/engine/copy";
import { DESKTOP_SHARDS, MOBILE_SHARDS, maskUrlForWidth, modelUrlForWidth, orangeMask, shardCountForWidth } from "../app/lab/swarm/engine/creature";
import { stepSpring } from "../app/lab/swarm/engine/motion";

describe("swarm creature", () => {
  it("uses the client falcon meshes and the brief's blade counts", () => {
    expect(DESKTOP_SHARDS).toBe(2000);
    expect(MOBILE_SHARDS).toBe(900);
    expect(shardCountForWidth(1440)).toBe(DESKTOP_SHARDS);
    expect(shardCountForWidth(390)).toBe(MOBILE_SHARDS);
    expect(modelUrlForWidth(1440)).toBe("/lab/swarm/falcon-web.glb");
    expect(modelUrlForWidth(390)).toBe("/lab/swarm/falcon-mobile.glb");
    expect(maskUrlForWidth(1440)).toBe("/lab/swarm/falcon-mask.jpg");
    expect(maskUrlForWidth(390)).toBe("/lab/swarm/falcon-mask-mobile.jpg");
    const web = statSync("public/lab/swarm/falcon-web.glb");
    const mobile = statSync("public/lab/swarm/falcon-mobile.glb");
    expect(statSync("public/lab/swarm/falcon-mask.jpg").size).toBeGreaterThan(50_000);
    expect(statSync("public/lab/swarm/draco/draco-worker.js").size).toBeGreaterThan(1000);
    expect(web.size).toBeGreaterThan(mobile.size);
    expect(web.size).toBeGreaterThan(500_000);
    expect(mobile.size).toBeGreaterThan(100_000);
    expect(statSync("public/lab/swarm/draco/draco_decoder.wasm").size).toBeGreaterThan(1000);
  });

  it("keeps orange on saturated wing-edge texels and off the chrome", () => {
    expect(orangeMask(216 / 255, 100 / 255, 62 / 255)).toBe(true);
    expect(orangeMask(0.7, 0.48, 0.38)).toBe(false);
    expect(orangeMask(0xe8 / 255, 0xe8 / 255, 0xe8 / 255)).toBe(false);
    expect(orangeMask(0.07, 0.075, 0.08)).toBe(false);
    expect(orangeMask(0.2, 0.55, 0.25)).toBe(false);
    expect(orangeMask(0.85, 0.82, 0.78)).toBe(false);
  });
});

describe("swarm motion", () => {
  it("settles an offset in about 1.2s without crossing home", () => {
    let pos = 1;
    let vel = 0;
    const samples: number[] = [];
    for (let frame = 0; frame < 90; frame++) {
      const next = stepSpring(pos, vel, 0, 1 / 60, 0);
      pos = next.pos;
      vel = next.vel;
      samples.push(pos);
    }
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1e-4);
    expect(samples.at(-1)).toBeGreaterThan(-0.001);
    expect(Math.abs(samples[71])).toBeLessThan(0.08);
  });
});

describe("swarm copy and assets", () => {
  it("marks the boot readout and the next section as placeholder copy", () => {
    expect(COPY_NOTE).toContain("PLACEHOLDER");
    expect(bootLine(0, 0)).toBe("PRIMEARC / SYSTEMS");
    expect(bootLine(1, 64)).toContain("064%");
    expect(bootLine(2, 0)).toContain("routing");
    expect(NEXT_SECTION_COPY).toContain("Placeholder");
    const source = readFileSync("app/lab/swarm/engine/copy.ts", "utf8");
    expect(source).toContain("PLACEHOLDER COPY");
    const css = readFileSync("app/lab/swarm/swarm.css", "utf8");
    expect(css.toLowerCase()).not.toContain("d8643e");
    const page = readFileSync("app/lab/swarm/SwarmExperience.tsx", "utf8");
    expect(page).toContain("We build AI systems that complete real work.");
    expect(page).toContain('href="/build-brief"');
    expect(page).toContain("Get free AI audit");
  });

  it("ships a poster at or under 200KB and a sound licence", () => {
    const poster = statSync("public/lab/swarm/poster.webp");
    expect(poster.size).toBeGreaterThan(8_000);
    expect(poster.size).toBeLessThanOrEqual(200 * 1024);
    const sounds = readFileSync("public/lab/swarm/SOUNDS.md", "utf8");
    expect(sounds).toContain("Krea");
    expect(sounds).toContain("Business");
    expect(sounds).toContain("Web Audio");
    expect(sounds).not.toContain("CC0");
    const assets = readFileSync("public/lab/swarm/ASSETS.md", "utf8");
    expect(assets).toContain("falcon-web.glb");
    expect(assets).toContain("falcon-mobile.glb");
    expect(assets).toContain("Draco");
    expect(assets).toContain("mask");
    expect(assets).not.toContain("Quaternius");
  });
});
