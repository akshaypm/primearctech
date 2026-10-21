/** Desktop puts the hawk in the right half, seen from slightly below. Portrait lifts it above the headline. */

export type SwarmFrame = {
  x: number;
  y: number;
  scale: number;
  yaw: number;
  camZ: number;
  camY: number;
  lookX: number;
  lookY: number;
  fov: number;
};

export function frameFor(width: number, height: number): SwarmFrame {
  const aspect = width / Math.max(1, height);
  if (aspect < 0.92) {
    return {
      x: 0,
      y: 0.88,
      scale: 0.68,
      yaw: 0,
      camZ: 7.35,
      camY: -0.08,
      lookX: 0,
      lookY: 0.16,
      fov: 36,
    };
  }
  return {
    x: 0.95,
    y: 0.04,
    scale: 1.02,
    yaw: -0.02,
    camZ: 5.15,
    camY: -0.42,
    lookX: 0.42,
    lookY: 0.06,
    fov: 28,
  };
}
