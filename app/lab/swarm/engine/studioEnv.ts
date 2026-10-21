import * as THREE from "three";

/**
 * High-contrast studio, as an equirectangular radiance map.
 * The room is dark. Two softboxes sit where the wings reflect, and a small lamp
 * catches the beak. Feather gaps and the head stay in the deep band.
 * Values are linear radiance. ACES at exposure 1 maps the floor to about
 * #2a2d31–#50555b and the softbox cores to white without a flat grey room.
 */

const SOFTBOXES: { dir: THREE.Vector3; color: THREE.Color; power: number }[] = [
  // Raised wing reflects upward. Wide enough for the whole wing, tight enough to fall off.
  { dir: new THREE.Vector3(0.15, 0.9, -0.12), color: new THREE.Color().setRGB(1.05, 1.08, 1.12), power: 3.2 },
  // Extended wing reflects down and toward the tail.
  { dir: new THREE.Vector3(0.5, -0.78, 0.1), color: new THREE.Color().setRGB(0.95, 0.98, 1.04), power: 3.4 },
  // A small lamp for the beak and the crown. The head itself stays in the dark base.
  { dir: new THREE.Vector3(-0.55, 0.25, 0.55), color: new THREE.Color().setRGB(1.4, 1.25, 1.05), power: 22 },
];

for (const box of SOFTBOXES) box.dir.normalize();

export function createStudioEnv(renderer: THREE.WebGLRenderer) {
  const w = 1024;
  const h = 512;
  const data = new Float32Array(w * h * 4);
  const dir = new THREE.Vector3();
  // flipY is left on, so the first row is texture v = 1, which equirectUv maps to +Y.
  for (let y = 0; y < h; y++) {
    const v = 1 - y / (h - 1);
    const dirY = Math.sin((v - 0.5) * Math.PI);
    const cosLat = Math.cos((v - 0.5) * Math.PI);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const lon = (u - 0.5) * Math.PI * 2;
      dir.set(Math.cos(lon) * cosLat, dirY, Math.sin(lon) * cosLat);
      // Dark room. Wings pick up the softboxes; head, belly, and feather gaps stay deep.
      let r = 0.062;
      let g = 0.066;
      let b = 0.074;
      for (const box of SOFTBOXES) {
        const nd = Math.max(0, dir.dot(box.dir));
        const lobe = Math.pow(nd, box.power);
        r += box.color.r * lobe;
        g += box.color.g * lobe;
        b += box.color.b * lobe;
      }
      const o = (y * w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 1;
    }
  }

  const equirect = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.LinearSRGBColorSpace;
  equirect.flipY = true;
  equirect.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(equirect).texture;
  equirect.dispose();
  pmrem.dispose();
  return envMap;
}
