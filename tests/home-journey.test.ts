import { describe, expect, it } from "vitest";
import {
  capDpr,
  chooseRenderPolicy,
  journeyTimeline,
  resolveJourneyState,
  resolveLayout,
  type ChapterBounds,
} from "@/app/home/journey/progress";

const bounds: ChapterBounds[] = [
  { id: "input", start: 100, end: 400 },
  { id: "assembly", start: 400, end: 700 },
  { id: "operation", start: 700, end: 1000 },
];

describe("resolveJourneyState", () => {
  it("clamps before the first span to the input rest pose", () => {
    expect(resolveJourneyState(0, bounds)).toEqual({ chapter: "input", progress: 0 });
    expect(resolveJourneyState(100, bounds)).toEqual({ chapter: "input", progress: 0 });
  });

  it("maps the middle and the end of a span", () => {
    expect(resolveJourneyState(250, bounds)).toEqual({ chapter: "input", progress: 0.5 });
    expect(resolveJourneyState(400, bounds)).toEqual({ chapter: "assembly", progress: 0 });
  });

  it("gives a shared boundary to the later chapter", () => {
    expect(resolveJourneyState(700, bounds)).toEqual({ chapter: "operation", progress: 0 });
  });

  it("clamps after the last span to the operation end pose", () => {
    expect(resolveJourneyState(1000, bounds)).toEqual({ chapter: "operation", progress: 1 });
    expect(resolveJourneyState(1400, bounds)).toEqual({ chapter: "operation", progress: 1 });
  });

  it("ignores zero and negative spans", () => {
    const broken: ChapterBounds[] = [
      { id: "input", start: 50, end: 50 },
      { id: "assembly", start: 80, end: 40 },
      { id: "operation", start: 200, end: 500 },
    ];
    expect(resolveJourneyState(0, broken)).toEqual({ chapter: "operation", progress: 0 });
    expect(resolveJourneyState(350, broken)).toEqual({ chapter: "operation", progress: 0.5 });
  });

  it("returns the input rest pose when no span is usable", () => {
    expect(resolveJourneyState(10, [{ id: "assembly", start: 5, end: 5 }])).toEqual({
      chapter: "input",
      progress: 0,
    });
    expect(resolveJourneyState(10, [])).toEqual({ chapter: "input", progress: 0 });
  });

  it("is a pure function of scroll position, including reverse and direct jumps", () => {
    const forward = [120, 400, 880, 20, 1000];
    const first = forward.map((y) => resolveJourneyState(y, bounds));
    const second = [...forward].reverse().map((y) => resolveJourneyState(y, bounds));
    expect(first).toEqual(forward.map((y) => resolveJourneyState(y, bounds)));
    expect(second[0]).toEqual(resolveJourneyState(1000, bounds));
    expect(second.at(-1)).toEqual(first[0]);
  });
});

describe("resolveLayout", () => {
  it("treats a short viewport as short before it considers width", () => {
    expect(resolveLayout(1440, 649)).toBe("short");
    expect(resolveLayout(390, 649)).toBe("short");
    expect(resolveLayout(1440, 650)).toBe("desktop");
  });

  it("splits width only after the height check", () => {
    expect(resolveLayout(767, 800)).toBe("mobile");
    expect(resolveLayout(768, 800)).toBe("tablet");
    expect(resolveLayout(1199, 800)).toBe("tablet");
    expect(resolveLayout(1200, 800)).toBe("desktop");
  });
});

describe("chooseRenderPolicy", () => {
  it("keeps Save-Data and missing WebGL on the poster", () => {
    expect(chooseRenderPolicy({ reducedMotion: false, saveData: true, webglAvailable: true })).toBe("poster");
    expect(chooseRenderPolicy({ reducedMotion: true, saveData: true, webglAvailable: true })).toBe("poster");
    expect(chooseRenderPolicy({ reducedMotion: false, saveData: false, webglAvailable: false })).toBe("poster");
    expect(chooseRenderPolicy({ reducedMotion: true, saveData: false, webglAvailable: false })).toBe("poster");
  });

  it("holds a static frame for reduced motion when WebGL is available", () => {
    expect(chooseRenderPolicy({ reducedMotion: true, saveData: false, webglAvailable: true })).toBe("static");
  });

  it("animates only when the device can spare the motion", () => {
    expect(chooseRenderPolicy({ reducedMotion: false, saveData: false, webglAvailable: true })).toBe("animated");
  });
});

describe("capDpr", () => {
  it("caps desktop at 1.5 and mobile at 1.25 without inventing a low-res stretch", () => {
    expect(capDpr(2, "desktop")).toBe(1.5);
    expect(capDpr(1.25, "desktop")).toBe(1.25);
    expect(capDpr(3, "mobile")).toBe(1.25);
    expect(capDpr(1, "mobile")).toBe(1);
    expect(capDpr(Number.NaN, "desktop")).toBe(1);
  });
});

describe("journeyTimeline", () => {
  it("starts closed, with floating plates and no output", () => {
    const pose = journeyTimeline({ chapter: "input", progress: 0 });
    expect(pose.t).toBe(0);
    expect(pose.open).toBe(0);
    expect(pose.plate).toBe(0);
    expect(pose.fly).toBe(0);
    expect(pose.output).toBe(0);
  });

  it("is continuous across the input/assembly boundary", () => {
    expect(journeyTimeline({ chapter: "input", progress: 1 })).toEqual(
      journeyTimeline({ chapter: "assembly", progress: 0 }),
    );
  });

  it("opens the arch through assembly and flies through before the halves close", () => {
    const early = journeyTimeline({ chapter: "assembly", progress: 0.15 });
    const mid = journeyTimeline({ chapter: "assembly", progress: 0.85 });
    const fly = journeyTimeline({ chapter: "operation", progress: 0.15 });
    const end = journeyTimeline({ chapter: "operation", progress: 1 });
    expect(early.open).toBeGreaterThan(0.4);
    expect(mid.open).toBeGreaterThan(0.85);
    expect(mid.fly).toBeGreaterThan(0.45);
    expect(fly.open).toBeGreaterThan(0.85);
    expect(fly.fly).toBeGreaterThan(0.7);
    expect(end.open).toBe(0);
    expect(end.fly).toBe(0);
    expect(end.output).toBe(1);
    expect(end.plate).toBe(2);
  });

  it("does not depend on previous calls", () => {
    const end = journeyTimeline({ chapter: "operation", progress: 1 });
    const start = journeyTimeline({ chapter: "input", progress: 0 });
    expect(start.open).toBe(0);
    expect(end.output).toBe(1);
  });
});
