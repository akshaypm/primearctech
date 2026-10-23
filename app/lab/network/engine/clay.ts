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
