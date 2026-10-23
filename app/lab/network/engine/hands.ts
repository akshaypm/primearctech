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
  bendThreads: (point: THREE.Vector3 | null, reach: number) => void;
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

type Body = { spring: ReturnType<typeof vecSpring>; base: THREE.Vector3; goal: THREE.Vector3; gone: boolean; snap: boolean };

export function createHands(world: HandWorld, hooks: { dive: (id: string) => void; cue: (name: Cue) => void }) {
  const bodies = new Map<THREE.Object3D, Body>();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const aimDelta = new THREE.Vector3();
  const aimOrigin = new THREE.Vector3();
  const spreadSpring = vecSpring();
  const spreadTarget = new THREE.Vector3();
  const sweep = new THREE.Vector3();
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
  let ball: { obj: THREE.Object3D; x: number; z: number; vx: number; vz: number; live: boolean; trail: THREE.Vector3[] } | null = null;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.46, 28),
    new THREE.MeshBasicMaterial({ color: 0x843829, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.name = "clay-ripple";
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  ring.frustumCulled = false;
  world.attach(ring);

  function bodyOf(object: THREE.Object3D) {
    let item = bodies.get(object);
    if (!item) {
      item = { spring: vecSpring(), base: object.scale.clone(), goal: new THREE.Vector3(), gone: false, snap: false };
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
    const feed = world.named((name) => name.startsWith("INPUT_feed"))[0];
    if (!feed) return;
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    object.getWorldPosition(from);
    feed.getWorldPosition(to);
    const item = bodyOf(object);
    item.snap = true;
    item.goal.copy(to).sub(from);
    item.spring.vel.copy(item.goal).setLength(5);
    window.setTimeout(() => {
      item.gone = true;
    }, 650);
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
      const omega = object === holding ? 24 : 8;
      stepVec(item.spring, item.goal, omega, dt, reduced);
      if (object !== holding && item.spring.offset.lengthSq() < 1e-6) item.base.copy(object.scale);
      object.position.add(item.spring.offset);
      squashScale(object.scale, item.base, item.spring.offset.length());
      object.updateMatrixWorld(true);
      if (object !== holding && !item.snap) item.goal.set(0, 0, 0);
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
        ball = { obj: node, x: at.x, z: at.z, vx: 1.6, vz: 0.35, live: true, trail: [at.clone()] };
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
        const point = world.groundPoint(pointer.x, pointer.y);
        world.bendThreads(point, point ? 1.8 : 0);
      }
      if (beat === "embedding") {
        const point = world.groundPoint(pointer.x, pointer.y);
        if (point && sweepValid && point.distanceTo(sweep) > 0.02) {
          for (const pebble of world.named((name) => name.startsWith("EMB_peb"))) {
            const at = new THREE.Vector3();
            pebble.getWorldPosition(at);
            const away = at.sub(point);
            const dist = away.length();
            if (dist < 1.5 && dist > 0.02) bodyOf(pebble).spring.vel.add(away.normalize().multiplyScalar((1.5 - dist) * 2.2));
          }
        }
        if (point) {
          sweep.copy(point);
          sweepValid = true;
        }
      }
      if (ball?.live) {
        const dtClamped = Math.min(Math.max(dt, 0.001), 0.05);
        const dragging = holding === ball.obj && pointer.down;
        if (dragging) {
          const point = world.groundPoint(pointer.x, pointer.y);
          if (point) {
            ball.vx = (point.x - ball.x) / dtClamped;
            ball.vz = (point.z - ball.z) / dtClamped;
            ball.x = point.x;
            ball.z = point.z;
          }
        } else if (!reduced) {
          const ground = world.heightAt(ball.x, ball.z);
          const hx = world.heightAt(ball.x + 0.3, ball.z);
          const hz = world.heightAt(ball.x, ball.z + 0.3);
          if (ground !== null && hx !== null) ball.vx += (ground - hx) * 16 * dtClamped;
          if (ground !== null && hz !== null) ball.vz += (ground - hz) * 16 * dtClamped;
          ball.vx *= Math.exp(-1.2 * dtClamped);
          ball.vz *= Math.exp(-1.2 * dtClamped);
          ball.x += ball.vx * dtClamped;
          ball.z += ball.vz * dtClamped;
        }
        const y = (world.heightAt(ball.x, ball.z) ?? ball.obj.position.y) + 0.3;
        place(ball.obj, ball.x, y, ball.z);
        ball.obj.updateMatrixWorld(true);
        const sample = new THREE.Vector3();
        ball.obj.getWorldPosition(sample);
        ball.trail.push(sample);
        if (ball.trail.length > 24) ball.trail.shift();
        const trail = ball.trail;
        world.named((name) => /^LOSS_bead\d+$/.test(name)).forEach((bead, index, list) => {
          const at = trail[Math.min(trail.length - 1, Math.floor((index / list.length) * trail.length))];
          if (!at) return;
          place(bead, at.x, at.y, at.z);
          bead.visible = true;
          bead.scale.setScalar(0.85);
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
          ripple = Math.max(0, ripple - dt / 0.7);
          ring.scale.setScalar(0.35 + (1 - ripple) * 3.4);
          (ring.material as THREE.MeshBasicMaterial).opacity = ripple * 0.5;
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
      if (hit && beat === "layers") {
        layerDrag = true;
        return true;
      }
      if (hit && beat !== "embedding") {
        holding = hit.object;
        holdName = hit.name;
        if (hit.name === "LOSS_ball") {
          const at = new THREE.Vector3();
          hit.object.getWorldPosition(at);
          ball = { obj: hit.object, x: at.x, z: at.z, vx: 0, vz: 0, live: true, trail: [at.clone()] };
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
      if (pointer.down && layerDrag && beat === "layers") spreadGoal = Math.min(1, Math.max(0, spreadGoal + (prev - y) * 0.0035));
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
          ball = { obj: node, x: at.x, z: at.z, vx: 2, vz: 0.2, live: true, trail: [at.clone()] };
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
