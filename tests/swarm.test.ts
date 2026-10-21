import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COPY_NOTE, NEXT_SECTION_COPY, bootLine } from "../app/lab/swarm/engine/copy";
import { DESKTOP_GRID, MOBILE_GRID, asciiSilhouette, shardsFromBake } from "../app/lab/swarm/engine/creature";
import { stepSpring } from "../app/lab/swarm/engine/motion";

function loadBake() {
  const file = readFileSync("public/lab/swarm/falcon.bin");
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

describe("swarm creature", () => {
  it("uses desktop and mobile shard counts inside the brief", () => {
    const desktop = DESKTOP_GRID.x * DESKTOP_GRID.y;
    const mobile = MOBILE_GRID.x * MOBILE_GRID.y;
    expect(desktop).toBeGreaterThanOrEqual(10_000);
    expect(desktop).toBeLessThanOrEqual(14_000);
    expect(mobile).toBeGreaterThanOrEqual(4_000);
    expect(mobile).toBeLessThanOrEqual(6_000);
    const bake = loadBake();
    expect(bake.byteLength).toBeLessThanOrEqual(1024 * 1024);
    expect(shardsFromBake(bake, mobile, 11)).toHaveLength(mobile);
    expect(shardsFromBake(bake, desktop, 11)).toHaveLength(desktop);
  });

  it("reads as a spread-wing raptor, with feathers lying on the surface", () => {
    const shards = shardsFromBake(loadBake(), 12288, 11);
    const xs = shards.map((shard) => shard.home[0]);
    const ys = shards.map((shard) => shard.home[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const picture = asciiSilhouette(shards, 78, 28).text;
    expect(spanX, picture).toBeGreaterThan(spanY * 0.9);
    const at = (shard: (typeof shards)[number]) => ({
      x: (shard.home[0] - minX) / spanX,
      y: (shard.home[1] - minY) / spanY,
    });
    const head = shards.filter((shard) => {
      const p = at(shard);
      return p.x < 0.5 && p.y > 0.84;
    });
    expect(head.length, picture).toBeGreaterThan(40);
    const wingTip = shards.filter((shard) => {
      const p = at(shard);
      return p.x > 0.72 && p.y < 0.55;
    });
    expect(wingTip.length, picture).toBeGreaterThan(80);
    const seam = shards.filter((shard) => shard.seamFlag > 0.5).length / shards.length;
    expect(seam).toBeGreaterThan(0.01);
    expect(seam).toBeLessThan(0.02);
    const wings = shards.filter((shard) => shard.wing > 0.5).length / shards.length;
    expect(wings).toBeGreaterThan(0.45);
    let align = 0;
    for (const shard of shards) {
      const tangent = Math.hypot(...shard.tangent);
      expect(tangent).toBeGreaterThan(0.9);
      expect(tangent).toBeLessThan(1.1);
      align += Math.abs(
        shard.tangent[0] * shard.normal[0] + shard.tangent[1] * shard.normal[1] + shard.tangent[2] * shard.normal[2],
      );
      expect(Number.isFinite(shard.home[0] + shard.length + shard.rough)).toBe(true);
    }
    expect(align / shards.length).toBeLessThan(0.12);
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
    const assets = readFileSync("public/lab/swarm/ASSETS.md", "utf8");
    expect(assets).toContain("CC0");
    expect(assets).toContain("https://opengameart.org/content/animated-animales-low-poly");
    expect(assets).toContain("Quaternius");
  });
});
