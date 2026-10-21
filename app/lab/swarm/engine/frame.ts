/** Desktop keeps the falcon in the right half. Portrait fills the top half. */

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
      y: 1.48,
      scale: 0.42,
      yaw: 0.38,
      camZ: 3.85,
      camY: 1.05,
      lookX: 0,
      lookY: 1.05,
      fov: 32,
    };
  }
  return {
    x: 1.22,
    y: -0.16,
    scale: 0.74,
    yaw: 0.32,
    camZ: 4.55,
    camY: 0.34,
    lookX: 0.55,
    lookY: -0.06,
    fov: 26,
  };
}
