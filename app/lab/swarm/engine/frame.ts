/** Desktop keeps the eagle in the right half. Portrait fills the top half, wings spread. */

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
      y: 1.15,
      scale: 0.64,
      yaw: 0,
      camZ: 6.8,
      camY: 0.04,
      lookX: 0,
      lookY: 0.15,
      fov: 32,
    };
  }
  return {
    x: 1.25,
    y: 0.1,
    scale: 0.78,
    yaw: 0,
    camZ: 6.5,
    camY: 0.06,
    lookX: 0.35,
    lookY: 0.02,
    fov: 26,
  };
}
