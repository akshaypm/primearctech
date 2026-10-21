/** Overdamped spring shared by the CPU test and the GPU uniforms. */

export const SPRING_K = 18;
export const SPRING_C = 9;

/**
 * Semi-implicit Euler. From a resting offset this approaches home
 * without crossing it. Slightly overdamped, about 1.2s to settle.
 */
export function stepSpring(pos: number, vel: number, home: number, dt: number, extraAccel = 0) {
  const accel = SPRING_K * (home - pos) - SPRING_C * vel + extraAccel;
  const nextVel = vel + accel * dt;
  const nextPos = pos + nextVel * dt;
  return { pos: nextPos, vel: nextVel };
}

/** Heavy ease. Zero slope at both ends, no overshoot. */
export function lockEase(t: number) {
  const c = Math.min(1, Math.max(0, t));
  const s = c * c * (3 - 2 * c);
  return s * s * (3 - 2 * s);
}
