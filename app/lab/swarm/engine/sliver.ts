import * as THREE from "three";

/** Flat-shaded diamond splinter. Long axis is Y, sharp tip at +Y. */
export function createSliver() {
  const rings = [
    { y: -0.5, rx: 0.015, rz: 0.008 },
    { y: -0.3, rx: 0.085, rz: 0.028 },
    { y: -0.04, rx: 0.125, rz: 0.036 },
    { y: 0.22, rx: 0.07, rz: 0.022 },
    { y: 0.4, rx: 0.032, rz: 0.012 },
    { y: 0.5, rx: 0.004, rz: 0.0025 },
  ];
  const positions: number[] = [];
  const normals: number[] = [];

  const ring = (index: number) => {
    const r = rings[index];
    return [
      [r.rx, r.y, 0],
      [0, r.y, r.rz],
      [-r.rx, r.y, 0],
      [0, r.y, -r.rz],
    ];
  };

  const pushTri = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    if (nx * cx + nz * cz < 0) {
      nx *= -1;
      ny *= -1;
      nz *= -1;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const p of [a, b, c]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(nx, ny, nz);
    }
  };

  for (let i = 0; i < rings.length - 1; i++) {
    const a = ring(i);
    const b = ring(i + 1);
    for (let s = 0; s < 4; s++) {
      const n = (s + 1) % 4;
      pushTri(a[s], b[s], b[n]);
      pushTri(a[s], b[n], a[n]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}
