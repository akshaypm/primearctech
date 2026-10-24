import * as THREE from "three";

export type VecSpring = { offset: THREE.Vector3; vel: THREE.Vector3 };

export function vecSpring(): VecSpring {
  return { offset: new THREE.Vector3(), vel: new THREE.Vector3() };
}

/** Critically damped vector spring. Reduced motion snaps to the target. */
export function stepVec(spring: VecSpring, target: THREE.Vector3, omega: number, dt: number, reduced: boolean) {
  if (reduced) {
    spring.offset.copy(target);
    spring.vel.set(0, 0, 0);
    return;
  }
  const t = Math.min(Math.max(dt, 0), 0.05);
  const exp = Math.exp(-omega * t);
  for (const axis of ["x", "y", "z"] as const) {
    const x0 = spring.offset[axis] - target[axis];
    const v0 = spring.vel[axis];
    const b = v0 + omega * x0;
    spring.offset[axis] = target[axis] + (x0 + b * t) * exp;
    spring.vel[axis] = (b - omega * (x0 + b * t)) * exp;
  }
}

/** Squash along Y and stretch on XZ from a displacement length, in metres. */
export function squashScale(scale: THREE.Vector3, base: THREE.Vector3, metres: number) {
  const k = Math.min(0.22, Math.max(0, metres) * 0.12);
  scale.set(base.x * (1 + k * 0.65), base.y * (1 - k), base.z * (1 + k * 0.65));
}

/** A few centimetres of lean. Threads hover; they do not reach across the lattice. */
export function bendPush(dist: number, reach: number) {
  if (!(dist > 0) || dist >= reach) return 0;
  const t = 1 - dist / reach;
  return t * t * 0.045;
}

/** Grabbed node is 1. One hop follows at 0.45, the next at 0.18, then nothing. */
export function hopWeight(hops: number) {
  if (hops <= 0) return 1;
  if (hops === 1) return 0.45;
  if (hops === 2) return 0.18;
  return 0;
}

/**
 * Underdamped spring: one overshoot, then settled by about 0.8 s at omega 9, zeta 0.52.
 * Reduced motion snaps.
 */
export function stepUnder(spring: VecSpring, target: THREE.Vector3, omega: number, zeta: number, dt: number, reduced: boolean) {
  if (reduced || zeta >= 0.999) {
    stepVec(spring, target, omega, dt, reduced);
    return;
  }
  const t = Math.min(Math.max(dt, 0), 0.05);
  const wd = omega * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  const exp = Math.exp(-zeta * omega * t);
  const cos = Math.cos(wd * t);
  const sin = Math.sin(wd * t);
  for (const axis of ["x", "y", "z"] as const) {
    const x0 = spring.offset[axis] - target[axis];
    const v0 = spring.vel[axis];
    const bend = (v0 + zeta * omega * x0) / wd;
    const x = exp * (x0 * cos + bend * sin);
    const v = -zeta * omega * x + exp * (-x0 * wd * sin + bend * wd * cos);
    spring.offset[axis] = target[axis] + x;
    spring.vel[axis] = v;
  }
}

/** Screen-space pull. The limit is 22% of the viewport height, which is past the 15% read. */
export function clampScreenPull(dx: number, dy: number, height: number, maxFrac = 0.22) {
  const span = Math.max(1, height);
  const len = Math.hypot(dx, dy);
  const max = span * maxFrac;
  if (len <= max) return { x: dx, y: dy, frac: len / span };
  const scale = max / len;
  return { x: dx * scale, y: dy * scale, frac: maxFrac };
}

/**
 * Extra Y offsets may not close the authored gap between stacked blocks.
 * A correction pushes the upper block and leaves a bounce in its velocity.
 */
export function resolveStack(off: number[], top: number[], bottom: number[], vel: number[]) {
  const next = off.slice();
  const speed = vel.slice();
  for (let i = 0; i < next.length - 1; i += 1) {
    const restGap = bottom[i + 1] - top[i];
    const gap = bottom[i + 1] + next[i + 1] - (top[i] + next[i]);
    if (gap >= restGap - 1e-4) continue;
    const push = restGap - gap;
    next[i + 1] += push;
    speed[i + 1] += push * 9;
    speed[i] -= push * 3;
  }
  for (let i = 0; i < next.length; i += 1) {
    if (next[i] < 0) {
      speed[i] = Math.abs(speed[i]) * 0.45;
      next[i] = 0;
    }
  }
  return { off: next, vel: speed };
}
