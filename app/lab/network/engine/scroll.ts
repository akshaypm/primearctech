/** One trip through the animatic, in viewport heights. Native scroll, no extra library. */
export const SCROLL_VIEWPORTS = 9;

export function cyclePixels(viewport: number) {
  return Math.max(1, viewport) * SCROLL_VIEWPORTS;
}

export function scrollSpacerHeight(viewport: number) {
  return cyclePixels(viewport) + viewport * 2;
}

/**
 * Past the end of a cycle, jump back by exactly one cycle.
 * The camera pose at progress 1 matches progress 0, so the picture does not cut.
 */
export function wrapScroll(scrollY: number, viewport: number) {
  const cycle = cyclePixels(viewport);
  if (scrollY >= cycle) {
    const next = scrollY % cycle;
    return { scrollY: next, progress: next / cycle, wrapped: true as const };
  }
  const y = Math.max(0, scrollY);
  return { scrollY: y, progress: y / cycle, wrapped: false as const };
}
