/**
 * The hero is the client-supplied falcon mesh, not a generated creature.
 * Desktop and mobile GLBs live in public/lab/swarm/. See ASSETS.md.
 * Blades are sampled from that mesh at runtime. At rest they are hidden.
 */

export const SWARM_SEED = 11;
export const DESKTOP_SHARDS = 8000;
export const MOBILE_SHARDS = 3000;
export const MODEL_BREAKPOINT = 768;

const ORANGE_SAT = 0.32;
const ORANGE_VALUE = 0.18;
const ORANGE_HUE = 0.12;

export function shardCountForWidth(width: number) {
  return width < MODEL_BREAKPOINT ? MOBILE_SHARDS : DESKTOP_SHARDS;
}

export function modelUrlForWidth(width: number) {
  return width < MODEL_BREAKPOINT ? "/lab/swarm/falcon-mobile.glb" : "/lab/swarm/falcon-web.glb";
}

export function maskUrlForWidth(width: number) {
  return width < MODEL_BREAKPOINT ? "/lab/swarm/falcon-mask-mobile.jpg" : "/lab/swarm/falcon-mask.jpg";
}

/**
 * The GLB colour texture is a mask, not albedo. A texel paints #D8643E only
 * when it is a saturated orange: the wing leading edges and the eye.
 * r, g, b are sRGB channels in 0..1, matching the stored JPEG.
 */
export function orangeMask(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (max < ORANGE_VALUE || delta <= 1e-5) return false;
  if (delta / max < ORANGE_SAT) return false;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue /= 6;
  if (hue < 0) hue += 1;
  return hue <= ORANGE_HUE || hue >= 0.92;
}

type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
