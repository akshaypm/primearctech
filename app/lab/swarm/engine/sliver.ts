import * as THREE from "three";

/** Flat chrome blade. Long axis is Y, sharp tip at +Y, two triangles. */
export function createSliver() {
  const positions = [
    0, 0.5, 0,
    0.058, -0.2, 0,
    0, -0.5, 0,
    0, 0.5, 0,
    0, -0.5, 0,
    -0.058, -0.2, 0,
  ];
  const normals = [
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}
