/** Scroll ↔ animatic time. INTEGRATION.md §4. τ integrates rate(t); smoothing follows τ, not t. */

export const STORY_END = 61.5;
export const RATE_A = 1.5 / 6.5;
const FPS = 48;

/** 0 outside the layers→attention stretch, 1 on 30–36 s, linear ramps on the shoulders. */
export function plateau(t: number): number {
  if (t <= 29.5 || t >= 36.5) return 0;
  if (t < 30) return (t - 29.5) / 0.5;
  if (t <= 36) return 1;
  return (36.5 - t) / 0.5;
}

export function rate(t: number): number {
  return 1 + RATE_A * plateau(t);
}

export type TauTable = { tau: Float64Array; time: Float64Array };

/**
 * τ at 1/48 s, plus a final sample exactly on `end` when it falls between frames.
 * The plateau is linear, so the trapezoid on those samples is exact.
 */
export function buildTau(end = STORY_END, fps = FPS): TauTable {
  const steps = Math.max(1, Math.ceil(end * fps - 1e-9));
  const time = new Float64Array(steps + 1);
  const tau = new Float64Array(steps + 1);
  for (let i = 0; i <= steps; i += 1) time[i] = Math.min(end, i / fps);
  for (let i = 1; i <= steps; i += 1) {
    const t0 = time[i - 1];
    const t1 = time[i];
    tau[i] = tau[i - 1] + ((rate(t0) + rate(t1)) * 0.5) * (t1 - t0);
  }
  return { tau, time };
}

export function tauAt(table: TauTable, t: number): number {
  const { tau, time } = table;
  if (t <= time[0]) return tau[0];
  const last = time.length - 1;
  if (t >= time[last]) return tau[last];
  let lo = 0;
  let hi = last;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (time[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = time[hi] - time[lo];
  const a = span > 0 ? (t - time[lo]) / span : 0;
  return tau[lo] + (tau[hi] - tau[lo]) * a;
}

export function timeAtTau(table: TauTable, value: number): number {
  const { tau, time } = table;
  if (value <= tau[0]) return time[0];
  const last = tau.length - 1;
  if (value >= tau[last]) return time[last];
  let lo = 0;
  let hi = last;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (tau[mid] <= value) lo = mid;
    else hi = mid;
  }
  const span = tau[hi] - tau[lo];
  const a = span > 0 ? (value - tau[lo]) / span : 0;
  return time[lo] + (time[hi] - time[lo]) * a;
}

/** Desktop 0.5× viewport height per scroll-second; mobile 0.6×. */
export function pxPerSecond(viewportHeight: number, mobile: boolean): number {
  return (mobile ? 0.6 : 0.5) * viewportHeight;
}

export type Spring = { x: number; v: number };

export function createSpring(x = 0): Spring {
  return { x, v: 0 };
}

/**
 * Critically damped step toward `target`. omega 16 settles in about a fifth of a second:
 * tight enough that scroll does not float, loose enough to hide wheel notches.
 */
export function springTo(spring: Spring, target: number, omega: number, dt: number): void {
  const t = Math.min(Math.max(dt, 0), 0.05);
  const x0 = spring.x - target;
  const v0 = spring.v;
  const exp = Math.exp(-omega * t);
  const b = v0 + omega * x0;
  spring.x = target + (x0 + b * t) * exp;
  spring.v = (b - omega * (x0 + b * t)) * exp;
}

export const SCROLL_OMEGA = 16;
