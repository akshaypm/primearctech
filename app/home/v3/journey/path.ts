import * as THREE from "three";
import { cameraBlend, holdDrift, type StationId } from "./clock";

type Pose = { eye: [number, number, number]; look: [number, number, number]; fov: number };

/**
 * Desktop rest matches arc-scene's approved camera.
 * The other knots are placed, not blended, so the dolly is a curve.
 */
const DESKTOP: Pose[] = [
  { eye: [-1.2, 1.3, 12.6], look: [-3.4, 2.6, 0], fov: 24 },
  { eye: [2.4, 1.85, 11.4], look: [8.5, 3.4, 4.2], fov: 28 },
  { eye: [10.6, 1.95, 7.2], look: [16.2, 3.1, 2.4], fov: 32 },
  { eye: [16.8, 1.42, 6.4], look: [24.8, 1.2, -3.2], fov: 30 },
  { eye: [18.6, 1.18, 5.2], look: [26.2, 1.05, -4.2], fov: 30 },
];

const PORTRAIT: Pose[] = [
  { eye: [2.6, 1.2, 18.5], look: [-0.4, 0.9, 0], fov: 28 },
  { eye: [6.4, 1.85, 16.2], look: [10, 1.2, -1], fov: 32 },
  { eye: [16.5, 2.15, 12.4], look: [24, 1.15, -3], fov: 36 },
  { eye: [24.2, 1.72, 14.8], look: [26.2, 1.05, -4.2], fov: 34 },
  { eye: [26, 1.62, 15.4], look: [26.2, 0.95, -4.2], fov: 32 },
];

function curveOf(points: THREE.Vector3[]) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
  curve.arcLengthDivisions = 240;
  curve.updateArcLengths();
  return curve;
}

function bundle(poses: Pose[]) {
  return {
    eye: curveOf(poses.map((pose) => new THREE.Vector3(...pose.eye))),
    look: curveOf(poses.map((pose) => new THREE.Vector3(...pose.look))),
    fov: curveOf(poses.map((pose) => new THREE.Vector3(pose.fov, 0, 0))),
  };
}

const desktop = bundle(DESKTOP);
const portrait = bundle(PORTRAIT);
const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const fovPoint = new THREE.Vector3();

export function sampleCamera(progress: number, timeMs: number, portraitMode: boolean) {
  const blend = cameraBlend(progress);
  const path = portraitMode ? portrait : desktop;
  path.eye.getPointAt(blend.u, eye);
  path.look.getPointAt(blend.u, look);
  path.fov.getPointAt(blend.u, fovPoint);
  const drift = holdDrift(timeMs, blend.to as StationId, blend.travel);
  eye.x += drift.x;
  eye.y += drift.y;
  eye.z += drift.z;
  return { eye, look, fov: fovPoint.x, travel: blend.travel, station: blend.to };
}
