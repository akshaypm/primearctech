/** Shared easing. Matches view.html `ease` (smootherstep). */
export function smootherstep(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function fadeWindow(t: number, a: number, b: number): number {
  return smootherstep((t - a) / (b - a));
}
