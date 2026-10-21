/** Desktop puts the hound in the right half. Portrait lifts it above the headline. */

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
      x: 0.08,
      y: 0.7,
      scale: 0.78,
      yaw: 0.2,
      camZ: 6.15,
      camY: 0.95,
      lookX: 0.05,
      lookY: 0.78,
      fov: 30,
    };
  }
  return {
    x: 1.18,
    y: 0.04,
    scale: 1,
    yaw: 0.24,
    camZ: 6.2,
    camY: 0.2,
    lookX: 0.36,
    lookY: 0.1,
    fov: 28,
  };
}
