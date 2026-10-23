import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { copyMotion, productFocus } from "../app/lab/network/engine/copy";
import { largestEmptyRect } from "../app/lab/network/engine/safe";
import { buildTau, createSpring, plateau, pxPerSecond, RATE_A, springTo, tauAt, timeAtTau } from "../app/lab/network/engine/scroll";

describe("network scroll map", () => {
  it("adds 1.5 s across the layers to attention stretch", () => {
    const table = buildTau(61.4);
    const tau = tauAt(table, 61.4);
    assert.ok(Math.abs(tau - 62.9) < 1e-6, `τ(61.4) = ${tau}`);
    assert.ok(Math.abs(tauAt(buildTau(61.5), 61.5) - 63) < 1e-6);
  });

  it("inverts τ back to animatic time", () => {
    const table = buildTau();
    for (const t of [0, 3.5, 8, 24.1, 30, 33, 36.2, 44, 61.5]) {
      const back = timeAtTau(table, tauAt(table, t));
      assert.ok(Math.abs(back - t) < 1e-4, `${t} -> ${back}`);
    }
  });

  it("plateau integrates to 6.5 s so a * integral is 1.5 s", () => {
    let acc = 0;
    const dt = 1 / 480;
    for (let t = 0; t < 61.5; t += dt) acc += plateau(t + dt / 2) * dt;
    assert.ok(Math.abs(acc - 6.5) < 1e-3, `plateau integral ${acc}`);
    assert.ok(Math.abs(RATE_A * 6.5 - 1.5) < 1e-9);
  });

  it("uses half a viewport per second on desktop", () => {
    assert.equal(pxPerSecond(900, false), 450);
    assert.equal(pxPerSecond(844, true), 506.4);
  });

  it("hands the hero copy off before the input beat", () => {
    const hero = copyMotion(9);
    assert.equal(hero.beat.id, "hero");
    assert.equal(hero.opacity, 1);
    const leaving = copyMotion(10.35);
    assert.equal(leaving.beat.id, "hero");
    assert.ok(leaving.opacity < 0.6 && leaving.y < 0);
    const gone = copyMotion(10.5);
    assert.equal(gone.beat.id, "input");
    assert.equal(gone.opacity, 0);
    const input = copyMotion(12);
    assert.equal(input.beat.id, "input");
    assert.equal(input.opacity, 1);
  });

  it("focuses one product at a time across the attention beat", () => {
    assert.equal(productFocus(31), "fieldrelay");
    assert.equal(productFocus(34), "counter");
    assert.equal(productFocus(37), "roster");
    assert.equal(productFocus(29.9), null);
  });

  it("places copy in the largest gap beside clay", () => {
    const empty = largestEmptyRect(1440, 900, [{ x0: 80, y0: 200, x1: 700, y1: 760 }], 64, 16);
    assert.ok(empty.x0 > 680, `x0 ${empty.x0}`);
    assert.ok(empty.x1 - empty.x0 > 500, `width ${empty.x1 - empty.x0}`);
  });

  it("critically damped follow settles without a long tail", () => {
    const spring = createSpring(0);
    for (let i = 0; i < 30; i += 1) springTo(spring, 10, 16, 1 / 60);
    assert.ok(spring.x > 9.5 && spring.x < 10.2, `x=${spring.x}`);
    assert.ok(Math.abs(spring.v) < 2, `v=${spring.v}`);
  });
});
