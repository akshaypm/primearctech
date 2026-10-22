import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COPY_NOTE, CTA_HREF, CTA_LABEL, HERO_H1, SECTION_PLACEHOLDERS, STILLS, assemblyScale, bootLine } from "../app/lab/network/engine/copy";
import { isCursorLabel, stepCursor } from "../app/lab/network/engine/cursor";
import { PALETTE, claySheen, srgbHue } from "../app/lab/network/engine/palette";
import {
  BEATS,
  HERO_POSE,
  PARALLAX_MAX_DEG,
  PATH_DURATION,
  beatAt,
  damp,
  indexLabel,
  parallaxRadians,
  parseCameraPath,
  posesClose,
  samplePose,
  timeAtProgress,
  verticalFovForAspect,
} from "../app/lab/network/engine/path";
import { clampedDpr, stepQuality } from "../app/lab/network/engine/quality";
import { cyclePixels, wrapScroll } from "../app/lab/network/engine/scroll";
import { createSceneSfx } from "../app/lab/network/engine/sfx";

function linear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = linear((n >> 16) & 255);
    const g = linear((n >> 8) & 255);
    const bl = linear(n & 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("network palette", () => {
  it("keeps terracotta in a dark red-brown hue and out of salmon", () => {
    for (const hex of [PALETTE.terracotta, PALETTE.terracottaDeep, PALETTE.darkClay, PALETTE.rods]) {
      const { h, s, l } = srgbHue(hex);
      expect(h).toBeGreaterThan(4);
      expect(h).toBeLessThan(18);
      expect(s).toBeGreaterThan(0.35);
      expect(l).toBeLessThan(0.42);
    }
    expect(srgbHue(PALETTE.darkClay).l).toBeLessThan(srgbHue(PALETTE.terracotta).l);
    expect(srgbHue(PALETTE.rods).l).toBeLessThan(srgbHue(PALETTE.darkClay).l);
    const sheen = srgbHue(claySheen(PALETTE.terracotta));
    expect(sheen.h).toBeGreaterThan(4);
    expect(sheen.h).toBeLessThan(18);
    expect(sheen.l).toBeLessThan(0.5);
    const glaze = srgbHue(PALETTE.glaze);
    expect(glaze.l).toBeGreaterThan(0.9);
    expect(glaze.s).toBeLessThan(0.55);
    expect(glaze.h).toBeGreaterThan(20);
    expect(glaze.h).toBeLessThan(55);
    expect(contrast(PALETTE.ink, PALETTE.sand)).toBeGreaterThan(7);
  });
});

describe("network camera path", () => {
  const path = parseCameraPath(JSON.parse(readFileSync("public/lab/network/camera-path.json", "utf8")));

  it("loops the approved path back onto the hero frame", () => {
    expect(path.samples.length).toBe(1501);
    expect(path.duration).toBe(PATH_DURATION);
    const start = samplePose(path, 0);
    const end = samplePose(path, path.duration);
    expect(posesClose(start, HERO_POSE, 1e-6)).toBe(true);
    expect(posesClose(end, start, 1e-6)).toBe(true);
    expect(timeAtProgress(0)).toBe(0);
    expect(timeAtProgress(1)).toBe(0);
    expect(posesClose(samplePose(path, timeAtProgress(0.999)), start, 0.35)).toBe(true);
    expect(posesClose(samplePose(path, timeAtProgress(0.99)), start, 0.4)).toBe(true);
  });

  it("keeps the beat proportions and the epoch return", () => {
    expect(beatAt(0).label).toBe("HERO");
    expect(beatAt(6).label).toBe("HERO");
    expect(beatAt(10.5).label).toBe("INPUT");
    expect(beatAt(19.5).label).toBe("LAYERS");
    expect(beatAt(30).label).toBe("ATTENTION");
    expect(beatAt(39).label).toBe("LOSS");
    expect(beatAt(48).label).toBe("EMBEDDING");
    expect(beatAt(56).label).toBe("BOOK");
    expect(beatAt(61.4).label).toBe("HERO");
    expect(indexLabel(BEATS[0])).toBe("01 / HERO");
    expect(indexLabel(beatAt(44))).toBe("05 / LOSS");
    const input = (10.5 - 0) / PATH_DURATION;
    expect(beatAt(timeAtProgress(input)).label).toBe("INPUT");
    expect(timeAtProgress(0.95)).toBe(60);
  });

  it("damps without crossing the target and caps pointer parallax at 1.5 degrees", () => {
    let value = 0;
    for (let i = 0; i < 40; i++) {
      const next = damp(value, 10, 4, 1 / 60);
      expect(next).toBeGreaterThanOrEqual(value);
      expect(next).toBeLessThan(10);
      value = next;
    }
    expect(value).toBeGreaterThan(8);
    const max = (PARALLAX_MAX_DEG * Math.PI) / 180;
    expect(Math.abs(parallaxRadians(2, -2, true).yaw)).toBeLessThanOrEqual(max + 1e-9);
    expect(parallaxRadians(1, 0, false)).toEqual({ yaw: 0, pitch: 0 });
    expect(verticalFovForAspect(29.323, 1.6)).toBeCloseTo(29.323, 5);
    const phone = verticalFovForAspect(29.323, 390 / 844);
    expect(phone).toBeGreaterThan(40);
    expect(phone).toBeLessThan(58);
  });
});

describe("network scroll, quality, cursor, boot", () => {
  it("wraps a scroll cycle back to the same progress", () => {
    const view = 900;
    const cycle = cyclePixels(view);
    expect(wrapScroll(0, view).progress).toBe(0);
    expect(wrapScroll(cycle, view)).toEqual({ scrollY: 0, progress: 0, wrapped: true });
    expect(wrapScroll(cycle + 90, view).progress).toBeCloseTo(90 / cycle, 6);
  });

  it("clamps device pixel ratio at 1.5 and drops a tier only after sustained slow frames", () => {
    expect(clampedDpr(2, 0)).toBe(1.5);
    expect(clampedDpr(1.2, 0)).toBe(1.2);
    expect(clampedDpr(3, 2)).toBe(1);
    let tier: 0 | 1 | 2 = 0;
    let slow = 0;
    for (let i = 0; i < 14; i++) {
      const next = stepQuality(tier, 28, slow);
      tier = next.tier;
      slow = next.slow;
    }
    expect(tier).toBe(0);
    const dropped = stepQuality(tier, 28, slow);
    expect(dropped.tier).toBe(1);
  });

  it("assembles nodes across the boot and types the layer readout from progress", () => {
    expect(bootLine(0)).toBe("initialising layer 1/4…");
    expect(bootLine(0.5)).toBe("initialising layer 3/4…");
    expect(bootLine(1)).toBe("initialising layer 4/4…");
    expect(assemblyScale(0, 8, 0)).toBe(0);
    expect(assemblyScale(7, 8, 0.2)).toBe(0);
    expect(assemblyScale(7, 8, 1)).toBe(1);
    let previous = 0;
    for (let step = 0; step <= 10; step++) {
      const scale = assemblyScale(3, 8, step / 10);
      expect(scale).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = scale;
    }
  });

  it("snaps the clay cursor to a mono label", () => {
    const next = stepCursor({ x: 0, y: 0, label: null }, 10, 10, { x: 40, y: 12, label: "OPEN" }, 1 / 60);
    expect(next.label).toBe("OPEN");
    expect(next.x).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(40);
    expect(isCursorLabel("DRAG")).toBe(true);
    expect(isCursorLabel("WAIT")).toBe(false);
  });

  it("records a positional scene hook without a second audio context", () => {
    const marks: string[] = [];
    const sfx = createSceneSfx({
      mark: (name, detail) => marks.push(`${name}:${detail}`),
    });
    sfx.at("LOSS", { x: 59, y: 1.2, z: -24 });
    expect(sfx.calls).toEqual([{ beat: "LOSS", x: 59, y: 1.2, z: -24 }]);
    expect(marks[0]).toContain("scene-sfx");
    expect(marks[0]).toContain("LOSS");
  });
});

describe("network route copy and assets", () => {
  it("ships the hero line, the audit link, and marked placeholder copy", () => {
    expect(COPY_NOTE).toContain("PLACEHOLDER");
    expect(HERO_H1).toBe("We build AI systems that complete real work.");
    expect(CTA_LABEL).toBe("Get free AI audit");
    expect(CTA_HREF).toBe("/build-brief");
    for (const [label, line] of Object.entries(SECTION_PLACEHOLDERS)) {
      if (label === "HERO") expect(line).toBe("");
      else expect(line).toContain("PLACEHOLDER");
    }
    const page = readFileSync("app/lab/network/NetworkExperience.tsx", "utf8");
    const css = readFileSync("app/lab/network/network.css", "utf8");
    const blockout = readFileSync("app/lab/network/engine/worldScene.ts", "utf8");
    expect(page).toContain("{HERO_H1}");
    expect(page).toContain("{CTA_LABEL}");
    expect(page).toContain('href={CTA_HREF}');
    expect(page).toContain('import("./engine/createWorld")');
    expect(page).not.toContain('from "three"');
    expect(page).toContain("prefers-reduced-motion");
    expect(css.toLowerCase()).not.toContain("d8643e");
    expect(css).not.toContain("box-shadow");
    expect(`${page}\n${css}`).not.toMatch(/Unlock|Elevate|Seamless/);
    expect(blockout).toContain("BLOCKOUT");
    expect(blockout).toContain("world-blockout.glb");
    expect(blockout).toContain("BoneGlaze");
    expect(statSync("public/lab/network/world-blockout.glb").size).toBeGreaterThan(1_000_000);
    expect(readFileSync("app/page.tsx", "utf8")).not.toContain("/lab/network");
    expect(readFileSync("app/lab/network/page.tsx", "utf8")).toContain("index: false");
    for (const still of STILLS) {
      expect(statSync(`public${still.src}`).size).toBeGreaterThan(20_000);
    }
    expect(statSync("public/lab/network/camera-path.json").size).toBeGreaterThan(100_000);
  });
});
