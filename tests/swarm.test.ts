import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COPY_NOTE, NEXT_SECTION_COPY, bootLine } from "../app/lab/swarm/engine/copy";
import { DESKTOP_GRID, MOBILE_GRID, asciiSilhouette, creatureSdf, sampleSwarm } from "../app/lab/swarm/engine/creature";
import { stepSpring } from "../app/lab/swarm/engine/motion";

describe("swarm creature", () => {
  it("uses desktop and mobile shard counts inside the brief", () => {
    const desktop = DESKTOP_GRID.x * DESKTOP_GRID.y;
    const mobile = MOBILE_GRID.x * MOBILE_GRID.y;
    expect(desktop).toBeGreaterThanOrEqual(20_000);
    expect(desktop).toBeLessThanOrEqual(40_000);
    expect(mobile).toBeGreaterThanOrEqual(6_000);
    expect(mobile).toBeLessThanOrEqual(10_000);
    expect(sampleSwarm(mobile, 11)).toHaveLength(mobile);
  });

  it("reads as one hound, with a gap between the legs and a thin seam", () => {
    const shards = sampleSwarm(8000, 11);
    const xs = shards.map((shard) => shard.home[0]);
    const ys = shards.map((shard) => shard.home[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const density = (x0: number, x1: number, y0: number, y1: number) => {
      let count = 0;
      for (const shard of shards) {
        const x = (shard.home[0] - minX) / (maxX - minX);
        const y = (shard.home[1] - minY) / (maxY - minY);
        if (x >= x0 && x < x1 && y >= y0 && y < y1) count += 1;
      }
      return count / shards.length;
    };
    const picture = asciiSilhouette(shards, 78, 32).text;
    expect(density(0.02, 0.34, 0.5, 0.86), picture).toBeGreaterThan(0.1);
    expect(density(0.34, 0.72, 0.4, 0.75), picture).toBeGreaterThan(0.12);
    expect(density(0.24, 0.42, 0.5, 0.78), picture).toBeGreaterThan(0.015);
    expect(density(0.22, 0.42, 0.88, 1), picture).toBeGreaterThan(0.004);
    expect(density(0.82, 1, 0.55, 1), picture).toBeGreaterThan(0.004);
    const leg = density(0.28, 0.42, 0, 0.35) + density(0.68, 0.92, 0, 0.35);
    const gap = density(0.5, 0.66, 0, 0.28);
    expect(gap, picture).toBeLessThan(leg * 0.45);
    const seam = shards.filter((shard) => shard.seamFlag > 0.5).length / shards.length;
    expect(seam).toBeGreaterThan(0.012);
    expect(seam).toBeLessThan(0.04);
    for (const shard of shards) {
      const tangent = Math.hypot(...shard.tangent);
      expect(tangent).toBeGreaterThan(0.9);
      expect(tangent).toBeLessThan(1.1);
      expect(Number.isFinite(shard.home[0] + shard.length + shard.rough)).toBe(true);
    }
  });

  it("keeps the body solid and the space between the legs empty", () => {
    expect(creatureSdf([0, 0.3, 0])).toBeLessThan(0);
    expect(creatureSdf([-0.5, 0.5, 0.02])).toBeLessThan(0);
    expect(creatureSdf([-1.38, 0.5, 0.04])).toBeLessThan(0.05);
    expect(creatureSdf([0.06, -0.5, 0])).toBeGreaterThan(0);
    expect(creatureSdf([0, 0.85, 0])).toBeGreaterThan(0);
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
    expect(sounds).toContain("CC0");
    expect(sounds).toContain("Web Audio");
  });
});
