import { describe, expect, it } from "vitest";
import { cameraBlend, easeTravel, holdDrift, textReveal } from "@/app/home/v3/journey/clock";

describe("journey clock", () => {
  it("holds the hero at rest and the demo at the end", () => {
    expect(cameraBlend(0)).toMatchObject({ travel: false, u: 0, from: "hero" });
    expect(cameraBlend(1)).toMatchObject({ travel: false, u: 1, to: "demo" });
  });

  it("eases the travel with a flat start and end", () => {
    expect(easeTravel(0)).toBe(0);
    expect(easeTravel(1)).toBe(1);
    expect(easeTravel(0.02)).toBeLessThan(0.0001);
    expect(1 - easeTravel(0.98)).toBeLessThan(0.0001);
    const mid = cameraBlend(0.39);
    expect(mid.travel).toBe(true);
    expect(mid.u).toBeGreaterThan(0.2);
    expect(mid.u).toBeLessThan(0.8);
  });

  it("does not drift the hero rest pose", () => {
    expect(holdDrift(4200, "hero", false)).toEqual({ x: 0, y: 0, z: 0 });
    expect(holdDrift(4200, "demo", true)).toEqual({ x: 0, y: 0, z: 0 });
    const drift = holdDrift(4200, "demo", false);
    expect(Math.hypot(drift.x, drift.y, drift.z)).toBeGreaterThan(0);
    expect(Math.hypot(drift.x, drift.y, drift.z)).toBeLessThan(0.03);
  });

  it("reveals demo type only on arrival", () => {
    expect(textReveal(0).hero).toBe(1);
    expect(textReveal(0).demo).toBe(0);
    expect(textReveal(0.39).hero).toBe(0);
    expect(textReveal(0.39).demo).toBe(0);
    expect(textReveal(1).demo).toBe(1);
  });
});
