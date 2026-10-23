import * as THREE from "three";
import type { BeatId } from "./copy";
import { squashScale, stepVec, vecSpring } from "./clay";

type TRS = { p: number[]; q: number[]; s: number[] };
type Hit = { name: string; object: THREE.Object3D; point: THREE.Vector3 };
type Cue = "click" | "hover" | "dive";

export type HandWorld = {
  camera: THREE.Camera;
  named: (test: (name: string) => boolean) => THREE.Object3D[];
  pick: (x: number, y: number, test?: (name: string) => boolean) => Hit | null;
  sample: (name: string, t: number) => TRS | null;
  trackWindow: (name: string) => { t0: number; t1: number } | null;
  heightAt: (x: number, z: number) => number | null;
  basin: () => THREE.Vector3 | null;
  bendThreads: (point: THREE.Vector3 | null, reach: number) => void;
  screen: (prefix: string) => { name: string; x: number; y: number; box: { x0: number; y0: number; x1: number; y1: number } | null }[];
  attach: (object: THREE.Object3D) => void;
  groundPoint: (x: number, y: number) => THREE.Vector3 | null;
  rayPoint: (x: number, y: number, plane: THREE.Plane) => THREE.Vector3 | null;
};

export type HandFrame = { cursor: "default" | "grab" | "grabbing"; hint: string | null };

const PRODUCT: Record<string, string> = { ATTN_chain: "fieldrelay", ATTN_coil: "counter", ATTN_tile22: "roster" };
const BEAT_OF: Record<string, BeatId> = {
  hero: "hero",
  input: "input",
  layers: "layers",
  products: "attention",
  loss: "loss",
  pebbles: "embedding",
  ripple: "book",
};

function objectName(object: THREE.Object3D) {
  const named = object.userData.name;
  return (typeof named === "string" && named) || object.name || "";
}

type Body = {
  spring: ReturnType<typeof vecSpring>;
  base: THREE.Vector3;
  goal: THREE.Vector3;
  gone: boolean;
  snap: boolean;
  hold: number;
  dwell: number;
};

export function createHands(world: HandWorld, hooks: { dive: (id: string) => void; cue: (name: Cue) => void }) {
  const bodies = new Map<THREE.Object3D, Body>();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const aimDelta = new THREE.Vector3();
  const aimOrigin = new THREE.Vector3();
  const spreadSpring = vecSpring();
  const spreadTarget = new THREE.Vector3();
  const sweep = new THREE.Vector3();
  const parentQuat = new THREE.Quaternion();
  const pointer = { x: 0, y: 0, down: false };
  let holding: THREE.Object3D | null = null;
  let holdName = "";
  let hover = "";
  let lastHover = "";
  let spread = 0;
  let spreadGoal = 0;
  let pulse = 0;
  let ripple = 0;
  let layerDrag = false;
  let sweepValid = false;
  let lastPickX = 0;
  let lastPickY = 0;
  let script: { kind: string; age: number } | null = null;
  const fired = new Set<string>();
  const used = new Set<string>();
  let ball: { obj: THREE.Object3D; x: number; y: number; z: number; ox: number; oz: number; px: number; py: number; vx: number; vz: number; live: boolean; trail: THREE.Vector3[] } | null = null;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 1.85, 64),
    new THREE.MeshBasicMaterial({ color: 0x843829, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide }),
  );
  ring.name = "clay-ripple";
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.frustumCulled = false;
  ring.renderOrder = 20;
  world.attach(ring);

  function bodyOf(object: THREE.Object3D) {
    let item = bodies.get(object);
    if (!item) {
      item = { spring: vecSpring(), base: object.scale.clone(), goal: new THREE.Vector3(), gone: false, snap: false, hold: 0, dwell: 0 };
      bodies.set(object, item);
    }
    return item;
  }

  function seen(beat: string) {
    if (used.has(beat)) return true;
    try {
      return window.sessionStorage.getItem(`network-drag-${beat}`) === "1";
    } catch {
      return false;
    }
  }

  function mark(beat: string) {
    used.add(beat);
    try {
      window.sessionStorage.setItem(`network-drag-${beat}`, "1");
    } catch {
      /* private mode */
    }
  }

  function underPointer(prefix: string, x: number, y: number) {
    let best = "";
    let area = Infinity;
    for (const item of world.screen(prefix)) {
      const box = item.box;
      if (!box || x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1) continue;
      const next = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
      if (next < area) {
        area = next;
        best = item.name;
      }
    }
    return best;
  }

  function interactive(name: string, beat: BeatId) {
    if (beat === "hero" || beat === "book") return name.startsWith("HERO_n");
    if (beat === "input") return name.startsWith("INPUT_fg");
    if (beat === "layers") return name.startsWith("LAYERS_blk");
    if (beat === "attention") return name in PRODUCT;
    if (beat === "loss") return name === "LOSS_ball";
    if (beat === "embedding") return name.startsWith("EMB_peb");
    return false;
  }

  function place(object: THREE.Object3D, x: number, y: number, z: number) {
    aimOrigin.set(x, y, z);
    if (object.parent) object.parent.worldToLocal(aimOrigin);
    object.position.copy(aimOrigin);
  }

  function aim(object: THREE.Object3D) {
    world.camera.getWorldDirection(normal);
    object.getWorldPosition(aimOrigin);
    plane.setFromNormalAndCoplanarPoint(normal, aimOrigin);
    const point = world.rayPoint(pointer.x, pointer.y, plane);
    if (!point) return aimDelta.set(0, 0, 0);
    return aimDelta.copy(point).sub(aimOrigin);
  }

  function couple(center: THREE.Object3D) {
    center.getWorldPosition(aimOrigin);
    const lead = bodyOf(center).goal;
    for (const node of world.named((name) => name.startsWith("HERO_n"))) {
      if (node === center) continue;
      const at = new THREE.Vector3();
      node.getWorldPosition(at);
      const dist = at.distanceTo(aimOrigin);
      if (dist > 2.2) continue;
      bodyOf(node).goal.copy(lead).multiplyScalar((1 - dist / 2.2) * 0.7);
    }
  }

  function firePulse() {
    if (pulse > 0) return;
    pulse = 1;
    hooks.cue("click");
  }

  function snapSheet(object: THREE.Object3D) {
    const from = new THREE.Vector3();
    object.getWorldPosition(from);
    const spots = world.screen("INPUT_feed").filter((item) => item.box && item.box.x1 > item.box.x0 + 4);
    const spot = spots[0];
    let target: THREE.Vector3 | null = null;
    if (spot?.box) {
      const feed = world.named((name) => name === spot.name)[0];
      if (feed) {
        feed.getWorldPosition(aimOrigin);
        world.camera.getWorldDirection(normal);
        plane.setFromNormalAndCoplanarPoint(normal, aimOrigin);
        const hit = world.rayPoint((spot.box.x0 + spot.box.x1) / 2, (spot.box.y0 + spot.box.y1) / 2, plane);
        if (hit) target = hit.clone();
      }
    }
    if (!target) {
      const feed = world.named((name) => name.startsWith("INPUT_feed"))[0];
      if (!feed) return;
      target = new THREE.Vector3();
      feed.getWorldPosition(target);
    }
    const item = bodyOf(object);
    item.snap = true;
    item.dwell = 0;
    item.goal.copy(target).sub(from);
    if (item.goal.length() > 2.4) item.goal.setLength(2.4);
    item.goal.y += 0.45;
    item.spring.vel.copy(item.goal).setLength(Math.min(6, Math.max(2.2, item.goal.length() * 3)));
  }

  function rippleAt(point: THREE.Vector3) {
    ring.position.set(point.x, point.y + 0.05, point.z);
    ring.visible = true;
    ripple = 1;
    hooks.cue("click");
  }

  function apply(dt: number, reduced: boolean) {
    for (const [object, item] of bodies) {
      if (item.gone) {
        object.visible = false;
        continue;
      }
      const flung = objectName(object).startsWith("EMB_peb") && (item.goal.lengthSq() > 0.04 || item.hold > 0);
      const omega = item.snap ? 11 : object === holding ? 24 : flung ? 70 : 8;
      stepVec(item.spring, item.goal, omega, dt, reduced);
      if (item.hold > 0) item.hold = Math.max(0, item.hold - dt);
      if (item.snap && item.spring.offset.distanceTo(item.goal) < 0.15) item.dwell += dt;
      if (item.snap && item.dwell > 0.9) item.gone = true;
      if (object !== holding && item.spring.offset.lengthSq() < 1e-6) item.base.copy(object.scale);
      object.position.add(item.spring.offset);
      squashScale(object.scale, item.base, item.spring.offset.length());
      object.updateMatrixWorld(true);
      if (object !== holding && !item.snap && item.hold <= 0) item.goal.set(0, 0, 0);
    }
  }

  function runScript(dt: number) {
    if (!script) return;
    const current = script;
    current.age += dt;
    const u = Math.min(1, current.age / 0.8);
    if (current.kind === "hero") {
      const nodes = world.named((name) => name.startsWith("HERO_n"));
      const node = nodes[4] || nodes[0];
      if (node && u <= 0.95) {
        holding = node;
        bodyOf(node).goal.set(Math.sin(u * Math.PI) * 0.9, 0.12, 0);
        couple(node);
      } else if (node && !fired.has("pulse")) {
        fired.add("pulse");
        holding = null;
        firePulse();
      }
    } else if (current.kind === "input") {
      const sheet = world.named((name) => name.startsWith("INPUT_fg"))[0];
      if (sheet && u < 0.7) bodyOf(sheet).goal.set(0, 0.2, Math.sin(u * Math.PI) * 0.8);
      else if (sheet && !fired.has("snap")) {
        fired.add("snap");
        snapSheet(sheet);
      }
    } else if (current.kind === "layers") spreadGoal = Math.sin(u * Math.PI);
    else if (current.kind === "products" && current.age > 0.4 && !fired.has("dive")) {
      fired.add("dive");
      hooks.dive("fieldrelay");
    } else if (current.kind === "loss" && !ball) {
      const node = world.named((name) => name === "LOSS_ball")[0];
      if (node) {
        const at = new THREE.Vector3();
        node.getWorldPosition(at);
        ball = { obj: node, x: at.x, y: at.y, z: at.z, ox: at.x, oz: at.z, px: 0, py: 0, vx: 2.4, vz: 0.6, live: true, trail: [at.clone()] };
      }
    } else if (current.kind === "pebbles" && !fired.has("peb")) {
      fired.add("peb");
      const pebble = world.named((name) => name.startsWith("EMB_peb"))[3] || world.named((name) => name.startsWith("EMB_peb"))[0];
      if (pebble) bodyOf(pebble).spring.vel.set(2.4, 0.3, 0.4);
    } else if (current.kind === "ripple" && !fired.has("rip")) {
      fired.add("rip");
      const ground = world.groundPoint(window.innerWidth / 2, window.innerHeight * 0.55);
      if (ground) rippleAt(ground);
    }
    if (current.age > 1.7) {
      holding = null;
      script = null;
    }
  }

  return {
    step(dt: number, beat: BeatId, reduced: boolean): HandFrame {
      const scripting = Boolean(script);
      runScript(dt);
      spreadTarget.set(spreadGoal, 0, 0);
      stepVec(spreadSpring, spreadTarget, 8, dt, reduced);
      spread = spreadSpring.offset.x;
      if (!scripting && holding && pointer.down && (beat === "hero" || beat === "book" || beat === "input")) {
        const delta = aim(holding);
        if (delta.length() > 1.35) delta.setLength(1.35);
        bodyOf(holding).goal.copy(delta);
        if (beat === "hero" || beat === "book") couple(holding);
      }
      apply(dt, reduced);
      if ((beat === "layers" || scripting) && spread > 0.004) {
        for (const block of world.named((name) => /^LAYERS_blk\d/.test(name))) {
          const match = objectName(block).match(/LAYERS_blk(\d+)/);
          block.position.y += spread * (match ? Number(match[1]) : 0) * 0.75;
          block.updateMatrixWorld(true);
        }
      }
      if (beat === "attention") {
        const threads = world.named((name) => name.startsWith("ATTN_th"));
        const anchor = threads[0];
        let point: THREE.Vector3 | null = null;
        if (anchor && (pointer.x !== 0 || pointer.y !== 0)) {
          world.camera.getWorldDirection(normal);
          anchor.getWorldPosition(aimOrigin);
          plane.setFromNormalAndCoplanarPoint(normal, aimOrigin);
          point = world.rayPoint(pointer.x, pointer.y, plane);
        }
        world.bendThreads(point, point ? 2.6 : 0);
      }
      if (beat === "embedding" && (pointer.x !== 0 || pointer.y !== 0)) {
        const movedPx = Math.hypot(pointer.x - sweep.x, pointer.y - sweep.y);
        if (sweepValid && movedPx > 8) {
          world.camera.updateMatrixWorld();
          normal.setFromMatrixColumn(world.camera.matrixWorld, 0);
          aimOrigin.setFromMatrixColumn(world.camera.matrixWorld, 1);
          for (const spot of world.screen("EMB_peb")) {
            const dx = (spot.box ? (spot.box.x0 + spot.box.x1) / 2 : spot.x) - pointer.x;
            const dy = (spot.box ? (spot.box.y0 + spot.box.y1) / 2 : spot.y) - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 140) continue;
            const pebble = world.named((name) => name === spot.name)[0];
            if (!pebble) continue;
            const travel = Math.hypot(pointer.x - sweep.x, pointer.y - sweep.y) || 1;
            const nx = dist < 8 ? (pointer.x - sweep.x) / travel : dx / dist;
            const ny = dist < 8 ? (pointer.y - sweep.y) / travel : dy / dist;
            const item = bodyOf(pebble);
            const mag = Math.max(0.62, Math.min(0.95, dist < 8 ? 0.78 : 1.05 - dist / 180));
            item.goal.copy(normal).multiplyScalar(nx * mag).addScaledVector(aimOrigin, -ny * mag);
            if (pebble.parent) {
              pebble.parent.getWorldQuaternion(parentQuat);
              item.goal.applyQuaternion(parentQuat.invert());
            }
            item.hold = 0.8;
          }
        }
        sweep.set(pointer.x, pointer.y, 0);
        sweepValid = true;
      }
      if (ball?.live) {
        const dtClamped = Math.min(Math.max(dt, 0.001), 0.05);
        const dragging = holding === ball.obj && pointer.down;
        if (dragging) {
          const point = world.groundPoint(pointer.x, pointer.y);
          let nx = ball.x;
          let nz = ball.z;
          const near = point && Math.hypot(point.x - ball.x, point.z - ball.z);
          if (point && near > 0.01 && near < 3.5) {
            const step = Math.min(near, 0.9);
            nx = ball.x + ((point.x - ball.x) / near) * step;
            nz = ball.z + ((point.z - ball.z) / near) * step;
          } else {
            world.camera.updateMatrixWorld();
            normal.setFromMatrixColumn(world.camera.matrixWorld, 0);
            aimOrigin.setFromMatrixColumn(world.camera.matrixWorld, 2);
            const sx = (pointer.x - ball.px) / Math.max(1, window.innerWidth);
            const sy = (pointer.y - ball.py) / Math.max(1, window.innerHeight);
            nx = ball.ox + normal.x * sx * 4.2 + aimOrigin.x * sy * 3.2;
            nz = ball.oz + normal.z * sx * 4.2 + aimOrigin.z * sy * 3.2;
          }
          const span = Math.hypot(nx - ball.ox, nz - ball.oz);
          if (span > 3.2) {
            nx = ball.ox + ((nx - ball.ox) / span) * 3.2;
            nz = ball.oz + ((nz - ball.oz) / span) * 3.2;
          }
          ball.vx = (nx - ball.x) / dtClamped;
          ball.vz = (nz - ball.z) / dtClamped;
          ball.x = nx;
          ball.z = nz;
        } else if (!reduced) {
          const ground = world.heightAt(ball.x, ball.z);
          const hx = world.heightAt(ball.x + 1.1, ball.z);
          const hz = world.heightAt(ball.x, ball.z + 1.1);
          if (ground !== null && hx !== null) ball.vx += (ground - hx) * 36 * dtClamped;
          if (ground !== null && hz !== null) ball.vz += (ground - hz) * 36 * dtClamped;
          const low = world.basin();
          if (ground !== null && low) {
            const dx = low.x - ball.x;
            const dz = low.z - ball.z;
            const dist = Math.hypot(dx, dz);
            const gap = ground - low.y;
            if (dist > 0.25 && gap > 0.001) {
              const accel = Math.min(7, gap * 40);
              ball.vx += (dx / dist) * accel * dtClamped;
              ball.vz += (dz / dist) * accel * dtClamped;
            } else if (dist > 0.25) {
              ball.vx += (dx / dist) * 1.4 * dtClamped;
              ball.vz += (dz / dist) * 1.4 * dtClamped;
            }
          }
          ball.vx *= Math.exp(-0.55 * dtClamped);
          ball.vz *= Math.exp(-0.55 * dtClamped);
          const speed = Math.hypot(ball.vx, ball.vz);
          if (speed > 6) {
            ball.vx *= 6 / speed;
            ball.vz *= 6 / speed;
          }
          ball.x += ball.vx * dtClamped;
          ball.z += ball.vz * dtClamped;
        }
        const sampled = world.heightAt(ball.x, ball.z);
        const y = (sampled === null || Math.abs(sampled) > 30 ? ball.y : sampled) + 0.2;
        const before = ball.obj.position.clone();
        place(ball.obj, ball.x, y, ball.z);
        ball.obj.scale.set(1, 1, 1);
        ball.obj.updateMatrixWorld(true);
        const sample = new THREE.Vector3();
        ball.obj.getWorldPosition(sample);
        if (sample.distanceTo(world.camera.position) < 1.1) {
          ball.obj.position.copy(before);
          ball.vx = 0;
          ball.vz = 0;
          ball.obj.updateMatrixWorld(true);
          ball.obj.getWorldPosition(sample);
          ball.x = sample.x;
          ball.z = sample.z;
        }
        ball.y = sample.y;
        ball.trail.push(sample.clone());
        if (ball.trail.length > 28) ball.trail.shift();
        const trail = ball.trail;
        world.named((name) => /^LOSS_bead\d+$/.test(name)).forEach((bead, index, list) => {
          const at = trail[Math.min(trail.length - 1, Math.floor((index / Math.max(1, list.length - 1)) * (trail.length - 1)))];
          if (!at) return;
          place(bead, at.x, at.y + 0.04, at.z);
          bead.visible = true;
          bead.updateMatrixWorld(true);
        });
      }
      if (pulse > 0) {
        pulse = reduced ? 0 : Math.max(0, pulse - dt / 0.9);
        if (pulse > 0) {
          for (const node of world.named((name) => name.startsWith("HERO_pulse"))) {
            const name = objectName(node);
            const win = world.trackWindow(name);
            const trs = win ? world.sample(name, win.t0 + (1 - pulse) * Math.max(0.05, win.t1 - win.t0)) : null;
            if (!trs) continue;
            node.position.fromArray(trs.p);
            node.quaternion.fromArray(trs.q);
            node.scale.fromArray(trs.s);
            node.visible = node.scale.x * node.scale.y * node.scale.z > 1e-4;
            node.updateMatrixWorld(true);
          }
        }
      }
      if (ripple > 0) {
        if (reduced) {
          ripple = 0;
          ring.visible = false;
        } else {
          ripple = Math.max(0, ripple - dt / 1.5);
          ring.scale.setScalar(2.8 + (1 - ripple) * 5.6);
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.2 + ripple * 0.8;
          ring.visible = ripple > 0.02;
        }
      }
      const moved = Math.abs(pointer.x - lastPickX) > 2 || Math.abs(pointer.y - lastPickY) > 2;
      if (pointer.down || moved) {
        const hit = world.pick(pointer.x, pointer.y, (name) => interactive(name, beat));
        hover = hit ? hit.name : "";
        lastPickX = pointer.x;
        lastPickY = pointer.y;
        if (hover && hover !== lastHover) hooks.cue("hover");
        lastHover = hover;
      }
      return {
        cursor: holding && pointer.down ? "grabbing" : hover ? "grab" : "default",
        hint: seen(beat) || beat === "loader" ? null : "drag",
      };
    },
    down(x: number, y: number, beat: BeatId) {
      pointer.x = x;
      pointer.y = y;
      pointer.down = true;
      lastPickX = x + 4;
      mark(beat);
      const hit = world.pick(x, y, (name) => interactive(name, beat));
      if (hit && PRODUCT[hit.name]) {
        hooks.dive(PRODUCT[hit.name]);
        rippleAt(hit.point);
        return false;
      }
      if (beat === "layers") {
        const inside = world.screen("LAYERS_blk").some((item) => item.box && x >= item.box.x0 && x <= item.box.x1 && y >= item.box.y0 && y <= item.box.y1);
        if (hit || inside) {
          layerDrag = true;
          return true;
        }
      }
      if (!hit && beat === "input") {
        const name = underPointer("INPUT_fg", x, y);
        const sheet = name ? world.named((entry) => entry === name)[0] : undefined;
        if (sheet) {
          holding = sheet;
          holdName = name;
          return true;
        }
      }
      if (hit && beat !== "embedding") {
        holding = hit.object;
        holdName = hit.name;
        if (hit.name === "LOSS_ball") {
          const at = new THREE.Vector3();
          hit.object.getWorldPosition(at);
          ball = { obj: hit.object, x: at.x, y: at.y, z: at.z, ox: at.x, oz: at.z, px: x, py: y, vx: 0, vz: 0, live: true, trail: [at.clone()] };
        }
        return true;
      }
      const ground = world.groundPoint(x, y) || hit?.point;
      if (ground) rippleAt(ground);
      return false;
    },
    move(x: number, y: number, beat: BeatId) {
      const prev = pointer.y;
      pointer.x = x;
      pointer.y = y;
      if (pointer.down && layerDrag && beat === "layers") spreadGoal = Math.min(1, Math.max(0, spreadGoal + (prev - y) * 0.008));
    },
    up(beat: BeatId) {
      pointer.down = false;
      layerDrag = false;
      if (holding && (beat === "hero" || beat === "book")) firePulse();
      if (holding && beat === "input") snapSheet(holding);
      if (ball && holdName === "LOSS_ball" && Math.hypot(ball.vx, ball.vz) < 0.4) ball.vx += 1.1;
      holding = null;
      holdName = "";
    },
    key(key: string, beat: BeatId) {
      let handled = false;
      if (key === "Enter" && beat === "attention") {
        hooks.dive("fieldrelay");
        handled = true;
      }
      if (key === "ArrowUp" && beat === "layers") {
        spreadGoal = Math.min(1, spreadGoal + 0.2);
        handled = true;
      }
      if (key === "ArrowDown" && beat === "layers") {
        spreadGoal = Math.max(0, spreadGoal - 0.2);
        handled = true;
      }
      if ((key === "ArrowRight" || key === "ArrowLeft") && (beat === "hero" || beat === "book")) {
        const node = world.named((name) => name.startsWith("HERO_n"))[0];
        if (node) {
          bodyOf(node).spring.vel.x += key === "ArrowRight" ? 2 : -2;
          firePulse();
          handled = true;
        }
      }
      if (key === "Enter" && beat === "input") {
        const sheet = world.named((name) => name.startsWith("INPUT_fg"))[0];
        if (sheet) snapSheet(sheet);
        handled = true;
      }
      if (key === "ArrowRight" && beat === "loss") {
        const node = world.named((name) => name === "LOSS_ball")[0];
        if (node) {
          const at = new THREE.Vector3();
          node.getWorldPosition(at);
          ball = { obj: node, x: at.x, y: at.y, z: at.z, ox: at.x, oz: at.z, px: 0, py: 0, vx: 2.4, vz: 0.4, live: true, trail: [at.clone()] };
          handled = true;
        }
      }
      if (key === " " || (key === "Enter" && beat !== "attention" && beat !== "input")) {
        const ground = world.groundPoint(window.innerWidth / 2, window.innerHeight * 0.62);
        if (ground) {
          rippleAt(ground);
          handled = true;
        }
      }
      if (handled) mark(beat);
      return handled;
    },
    play(kind: string) {
      script = { kind, age: 0 };
      fired.clear();
      if (kind === "loss") ball = null;
      const beat = BEAT_OF[kind];
      if (beat) mark(beat);
    },
  };
}
