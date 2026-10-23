export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Largest empty axis-aligned rectangle on a coarse grid. Occupied cells are clay, nav, or labels. */
export function largestEmptyRect(width: number, height: number, blocks: Rect[], padTop: number, padBottom: number): Rect {
  const cols = 48;
  const rows = 32;
  if (width < 2 || height < 2) return { x0: 0, y0: 0, x1: Math.max(0, width), y1: Math.max(0, height) };
  const cw = width / cols;
  const rh = height / rows;
  const occ = new Uint8Array(cols * rows);
  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    const c0 = Math.max(0, Math.floor(x0 / cw));
    const c1 = Math.min(cols - 1, Math.floor((Math.max(x0, x1) - 0.01) / cw));
    const r0 = Math.max(0, Math.floor(y0 / rh));
    const r1 = Math.min(rows - 1, Math.floor((Math.max(y0, y1) - 0.01) / rh));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) occ[r * cols + c] = 1;
    }
  };
  if (padTop > 0) mark(0, 0, width, padTop);
  if (padBottom > 0) mark(0, height - padBottom, width, height);
  for (const block of blocks) {
    if (block.x1 <= 0 || block.y1 <= 0 || block.x0 >= width || block.y0 >= height) continue;
    mark(block.x0, block.y0, block.x1, block.y1);
  }
  const heights = new Int16Array(cols);
  const stack = new Int16Array(cols + 1);
  let bestArea = 0;
  let best = { c0: 0, c1: Math.max(0, cols - 1), r0: 0, r1: Math.max(0, rows - 1) };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) heights[c] = occ[r * cols + c] ? 0 : heights[c] + 1;
    let top = 0;
    stack[0] = -1;
    for (let c = 0; c <= cols; c += 1) {
      const h = c === cols ? 0 : heights[c];
      while (top > 0 && heights[stack[top]] > h) {
        const hh = heights[stack[top]];
        top -= 1;
        const left = stack[top];
        const area = hh * (c - left - 1);
        if (area > bestArea) {
          bestArea = area;
          best = { c0: left + 1, c1: c - 1, r0: r - hh + 1, r1: r };
        }
      }
      top += 1;
      stack[top] = c;
    }
  }
  return { x0: best.c0 * cw, y0: best.r0 * rh, x1: (best.c1 + 1) * cw, y1: (best.r1 + 1) * rh };
}

export const COPY_INK = [0x22, 0x22, 0x22] as const;
export const COPY_SECONDARY = [0x6b, 0x56, 0x46] as const;
export const SCRIM_RGB = [0xef, 0xe6, 0xd6] as const;

export function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: readonly [number, number, number], bg: readonly [number, number, number]): number {
  const lighter = Math.max(relativeLuminance(fg[0], fg[1], fg[2]), relativeLuminance(bg[0], bg[1], bg[2]));
  const darker = Math.min(relativeLuminance(fg[0], fg[1], fg[2]), relativeLuminance(bg[0], bg[1], bg[2]));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Sand scrim is #EFE6D6 at 92% over the canvas. */
export function scrimBlend(bg: readonly [number, number, number]): [number, number, number] {
  return [
    Math.round(SCRIM_RGB[0] * 0.92 + bg[0] * 0.08),
    Math.round(SCRIM_RGB[1] * 0.92 + bg[1] * 0.08),
    Math.round(SCRIM_RGB[2] * 0.92 + bg[2] * 0.08),
  ];
}

/** Lowest ink contrast under a copy block. Empty samples mean the canvas is not readable yet. */
export function minInkContrast(
  samples: readonly (readonly [number, number, number])[],
  scrim: boolean,
  fg: readonly [number, number, number] = COPY_INK,
): number {
  if (!samples.length) return 21;
  let worst = 21;
  for (const sample of samples) {
    const bg = scrim ? scrimBlend(sample) : sample;
    worst = Math.min(worst, contrastRatio(fg, bg));
  }
  return worst;
}

export function textContrast(samples: readonly (readonly [number, number, number])[], scrim: boolean): number {
  return Math.min(minInkContrast(samples, scrim, COPY_INK), minInkContrast(samples, scrim, COPY_SECONDARY));
}

export type LabelBox = { left: number; top: number; width: number; height: number; flip: boolean; leader: number };

/** Keep a product label inside a 16px margin, flipping to the left of the sphere when the right side is short. */
function rectsOverlap(a: Rect, b: Rect, pad: number) {
  return a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;
}

/** Put the one focused label fully outside the sphere, inside the 16 px margin. */
export function placeBeside(sphere: Rect, width: number, height: number, viewW: number, viewH: number, avoid: readonly Rect[] = []): LabelBox {
  const margin = 16;
  const gap = 18;
  const fittedW = Math.max(48, Math.min(width, viewW - margin * 2));
  const fittedH = Math.max(16, Math.min(height, viewH - margin - 52));
  const cy = (sphere.y0 + sphere.y1) / 2;
  const cx = (sphere.x0 + sphere.x1) / 2;
  const blocked = [sphere, ...avoid];
  const raw = [
    { left: sphere.x1 + gap, top: cy - fittedH * 0.45, flip: false },
    { left: sphere.x0 - gap - fittedW, top: cy - fittedH * 0.45, flip: true },
    { left: cx - fittedW / 2, top: sphere.y0 - gap - fittedH, flip: false },
    { left: cx - fittedW / 2, top: sphere.y1 + gap, flip: false },
    { left: margin, top: 52, flip: false },
    { left: viewW - margin - fittedW, top: viewH - margin - fittedH, flip: true },
  ];
  let best: LabelBox = { left: margin, top: 52, width: fittedW, height: fittedH, flip: false, leader: gap };
  let bestScore = -Infinity;
  for (const item of raw) {
    const left = Math.max(margin, Math.min(item.left, viewW - margin - fittedW));
    const top = Math.max(52, Math.min(item.top, viewH - margin - fittedH));
    const rect = { x0: left, y0: top, x1: left + fittedW, y1: top + fittedH };
    let overlap = 0;
    for (const block of blocked) {
      if (!rectsOverlap(rect, block, 10)) continue;
      const ix = Math.max(0, Math.min(rect.x1, block.x1) - Math.max(rect.x0, block.x0));
      const iy = Math.max(0, Math.min(rect.y1, block.y1) - Math.max(rect.y0, block.y0));
      overlap += ix * iy;
    }
    const score = (overlap > 0 ? -overlap : 1_000_000) - Math.abs(left - item.left) - Math.abs(top - item.top);
    if (score > bestScore) {
      bestScore = score;
      const leader = item.flip ? sphere.x0 - rect.x1 : rect.x0 - sphere.x1;
      best = { left, top, width: fittedW, height: fittedH, flip: item.flip, leader: Math.max(8, Math.abs(leader)) };
    }
  }
  return best;
}

export function clampLabel(
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
  viewW: number,
  viewH: number,
  focused: boolean,
  crowded: boolean,
  sphere?: Rect,
  avoid: readonly Rect[] = [],
): LabelBox {
  if (focused && sphere && sphere.x1 > sphere.x0 && sphere.y1 > sphere.y0) return placeBeside(sphere, width, height, viewW, viewH, avoid);
  const margin = 16;
  const gap = focused ? 28 : 10;
  const rightSpace = viewW - margin - (anchorX + gap);
  const leftSpace = anchorX - gap - margin;
  let flip = crowded || rightSpace < Math.min(width, focused ? 150 : 64);
  if (flip && leftSpace < Math.min(width, 72) && rightSpace >= leftSpace) flip = false;
  const room = Math.max(64, flip ? leftSpace : rightSpace);
  const used = Math.min(width, Math.max(64, room));
  let left = flip ? anchorX - gap - used : anchorX + gap;
  left = Math.max(margin, Math.min(left, viewW - margin - used));
  const fitted = Math.max(48, Math.min(used, viewW - margin - left));
  let top = anchorY - (focused ? Math.round(height * 0.4) : height / 2);
  const limit = viewH - margin;
  if (top + height > limit) top = limit - height;
  if (top < 52) top = 52;
  const leader = Math.max(0, flip ? anchorX - (left + fitted) : left - anchorX);
  return { left, top, width: fitted, height, flip, leader };
}

export function intersections(copy: Rect, blocks: Rect[], minArea = 80) {
  const hits: { area: number; block: Rect }[] = [];
  for (const block of blocks) {
    const x0 = Math.max(copy.x0, block.x0);
    const y0 = Math.max(copy.y0, block.y0);
    const x1 = Math.min(copy.x1, block.x1);
    const y1 = Math.min(copy.y1, block.y1);
    const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    if (area >= minArea) hits.push({ area, block });
  }
  return hits;
}
