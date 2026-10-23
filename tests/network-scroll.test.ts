import assert from "node:assert/strict";
import { describe, it } from "vitest";
import * as THREE from "three";
import { createAnim } from "../app/lab/network/engine/anim";
import { stepVec, vecSpring } from "../app/lab/network/engine/clay";
import { copyMotion, productFocus } from "../app/lab/network/engine/copy";
import { cueFile } from "../app/lab/network/engine/manifest";
import { clampLabel, contrastRatio, largestEmptyRect, minInkContrast } from "../app/lab/network/engine/safe";
import { fittedFov } from "../app/lab/network/engine/camera";
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

  it("keeps ink on terracotta under 4.5 and sand over it", () => {
    const clay = minInkContrast([[105, 44, 32]], false);
    const sand = minInkContrast([[228, 216, 196]], false);
    const veiled = minInkContrast([[105, 44, 32]], true);
    assert.ok(clay < 4.5, `clay ${clay}`);
    assert.ok(sand >= 4.5, `sand ${sand}`);
    assert.ok(veiled >= 4.5, `scrim ${veiled}`);
    assert.ok(contrastRatio([34, 34, 34], [239, 230, 214]) > 7);
    const mixed = minInkContrast(
      [
        [228, 216, 196],
        [80, 36, 28],
      ],
      false,
    );
    assert.ok(mixed < 4.5, `mixed ${mixed}`);
    assert.ok(minInkContrast([[80, 36, 28]], true) >= 4.5);
  });

  it("flips a product label that would leave the right margin", () => {
    const box = clampLabel(300, 400, 220, 96, 390, 844, true, false);
    assert.equal(box.flip, true);
    assert.ok(box.left >= 16, `left ${box.left}`);
    assert.ok(box.left + box.width <= 374, `right ${box.left + box.width}`);
    assert.ok(box.top + box.height <= 828, `bottom ${box.top + box.height}`);
  });

  it("zooms a small portrait subject toward 70% of the width", () => {
    const fov = fittedFov(50, 390, 844, 120, 140);
    assert.ok(fov < 50, `fov ${fov}`);
    assert.ok(fov > 18, `fov ${fov}`);
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

  it("springs a clay offset toward the grab and snaps when motion is reduced", () => {
    const spring = vecSpring();
    const target = new THREE.Vector3(1, 0, 0);
    stepVec(spring, target, 14, 1 / 60, false);
    assert.ok(spring.offset.x > 0 && spring.offset.x < 1, `x=${spring.offset.x}`);
    stepVec(spring, target, 14, 1 / 60, true);
    assert.ok(Math.abs(spring.offset.x - 1) < 1e-6);
    assert.equal(spring.vel.length(), 0);
  });

  it("resolves a cue from the manifest and falls back to webm, opus, then mp3", () => {
    const file = cueFile({ cues: { click: { src: ["click.webm", "click.mp3"], gain: 0.4, loop: false } } }, "click");
    assert.deepEqual(file.urls, ["/network/audio/click.webm", "/network/audio/click.mp3"]);
    assert.equal(file.gain, 0.4);
    assert.equal(file.loop, false);
    const ambient = cueFile({ cues: { ambient: { src: ["room.webm"], gain: 0.2, loop: true } } }, "ambient");
    assert.deepEqual(ambient.urls, ["/network/audio/room.webm"]);
    assert.equal(ambient.gain, 0.2);
    assert.equal(ambient.loop, true);
    const missing = cueFile(null, "ambient");
    assert.deepEqual(missing.urls, ["/network/audio/ambient.webm", "/network/audio/ambient.ogg", "/network/audio/ambient.mp3"]);
    assert.equal(missing.gain, 0.35);
  });

  it("accepts an animation track whose node is not in the scene yet", () => {
    const anim = createAnim();
    anim.addPack(
      {
        fps: 8,
        bin: "signal.bin",
        tracks: [
          {
            name: "SIGNAL_ball",
            f0: 0,
            f1: 1,
            p: [{ c: 1 }, { c: 2 }, { c: 3 }],
            q: [{ c: 0 }, { c: 0 }, { c: 0 }, { c: 1 }],
            s: [{ c: 1 }, { c: 1 }, { c: 1 }],
          },
        ],
        scalars: [],
      },
      new ArrayBuffer(0),
    );
    anim.apply(0, {});
    const trs = anim.world("SIGNAL_ball", 0);
    assert.equal(trs?.p[0], 1);
    assert.equal(trs?.p[1], 2);
    assert.equal(anim.span("SIGNAL_ball")?.t0, 0);
    assert.equal(anim.span("SIGNAL_ball")?.t1, 1 / 8);
    assert.equal(anim.span("MISSING"), null);
    assert.equal(anim.world("LAYERS_ride", 0), null);
  });
});
