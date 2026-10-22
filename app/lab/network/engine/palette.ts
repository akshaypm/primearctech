/** Clay palette. Chrome and orange are retired. */

export const PALETTE = {
  sand: "#E4D8C4",
  surface: "#EFE6D6",
  ink: "#222222",
  secondary: "#6B5646",
  terracotta: "#843829",
  terracottaDeep: "#773226",
  darkClay: "#5C2A21",
  rods: "#4E241C",
  glaze: "#F3EDE1",
  horizon: "#E6DCCB",
} as const;

export type Rgb = { h: number; s: number; l: number };

export function srgbHue(hex: string): Rgb {
  const raw = hex.replace("#", "");
  const n = Number.parseInt(raw, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function channel(n: number) {
  const v = Math.round(Math.min(1, Math.max(0, n)) * 255);
  return v.toString(16).padStart(2, "0");
}

export function hslToHex(h: number, s: number, l: number) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return `#${channel(r + m)}${channel(g + m)}${channel(b + m)}`;
}

/** Same hue as the clay, a little lighter. Stays out of salmon. */
export function claySheen(hex: string) {
  const { h, s, l } = srgbHue(hex);
  return hslToHex(h, Math.min(0.62, s), Math.min(0.42, l + 0.1));
}
