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
