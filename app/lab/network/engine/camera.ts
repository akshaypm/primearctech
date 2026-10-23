import * as THREE from "three";
import { smootherstep } from "./animatic";

export type CamSample = {
  t: number;
  lens_mm: number;
  vfov_deg: number;
  shift: [number, number];
  position: [number, number, number];
  target: [number, number, number];
  position_threejs: [number, number, number];
  target_threejs: [number, number, number];
};

export type StackParams = {
  yaw_deg: number;
  slot_half: number;
  half_w: number;
  half_w_left?: number;
  depth: number;
  left_offset: number;
  band_over: number;
  plate_lo: [number, number];
  plate_hi: [number, number];
};

export type ExplodeFile = {
  spine_axis_xy: [number, number];
  rest: { cap_top: number; blocks: { lid_z: [number, number] }[] };
  explode: {
    block_rise: number;
    lid_lift: number;
    lid_tilt_deg: number;
    t0: number[];
    dur: number[];
    close_t0: number;
    close_dur: number;
    cap_clear: number;
  };
  nodes: {
    node: string;
    kind: string;
    block?: number;
    children?: string[];
    pivot_threejs?: [number, number, number];
    hinge_axis_threejs?: [number, number, number];
    extra_k?: number;
    rest_length?: number;
  }[];
  scene_rules: {
    fade_out: [number, number];
    fade_in: [number, number];
    fade_in_ground?: [number, number];
  };
  fog_threejs: { layers: { near: number; far: number } };
};

export function sampleCamera(samples: CamSample[], t: number, smooth: boolean): CamSample {
  const n = samples.length;
  const f = t * 24;
  const clamp = (i: number) => samples[Math.min(n - 1, Math.max(0, i))];
  if (!smooth) return clamp(Math.round(f));
  const i0 = Math.min(n - 1, Math.max(0, Math.floor(f)));
  const i1 = Math.min(n - 1, i0 + 1);
  const a = Math.min(1, Math.max(0, f - Math.floor(f)));
  if (a === 0 || i0 === i1) return samples[i0];
  const mix = (x: number, y: number) => x + (y - x) * a;
  const mix3 = (x: number[], y: number[]): [number, number, number] => [mix(x[0], y[0]), mix(x[1], y[1]), mix(x[2], y[2])];
  const A = samples[i0];
  const B = samples[i1];
  return {
    t,
    lens_mm: mix(A.lens_mm, B.lens_mm),
    vfov_deg: mix(A.vfov_deg, B.vfov_deg),
    shift: [mix(A.shift[0], B.shift[0]), mix(A.shift[1], B.shift[1])],
    position: mix3(A.position, B.position),
    target: mix3(A.target, B.target),
    position_threejs: mix3(A.position_threejs, B.position_threejs),
    target_threejs: mix3(A.target_threejs, B.target_threejs),
  };
}

function look(cam: THREE.PerspectiveCamera, s: CamSample) {
  cam.position.fromArray(s.position_threejs);
  cam.up.set(0, 1, 0);
  cam.lookAt(s.target_threejs[0], s.target_threejs[1], s.target_threejs[2]);
}

/** view.html camera, including the mobile stack fit. Desktop 16:10 uses the sample vfov so 1440×900 matches the reference. */
export function applyCamera(
  cam: THREE.PerspectiveCamera,
  s: CamSample,
  t: number,
  width: number,
  height: number,
  mobile: boolean,
  exj: ExplodeFile,
  params: StackParams,
) {
  const W = width;
  const H = height;
  cam.near = 0.05;
  cam.far = 3000;
  if (mobile && t >= 16.5 && t < 36.33) {
    const PR = params;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const pos = V(s.position[0], s.position[1], s.position[2]);
    const tgt = V(s.target[0], s.target[1], s.target[2]);
    const yaw = (PR.yaw_deg * Math.PI) / 180;
    const SA = exj.spine_axis_xy;
    const Wp = (u: number, v: number, z: number) =>
      V(SA[0] + Math.cos(yaw) * u - Math.sin(yaw) * v, SA[1] + Math.sin(yaw) * u + Math.cos(yaw) * v, z);
    const f = tgt.clone().sub(pos).normalize();
    const rr = f.clone().cross(V(0, 0, 1)).normalize();
    const uu = rr.clone().cross(f);
    const tt = (p: THREE.Vector3) => {
      const d = p.clone().sub(pos);
      return d.dot(uu) / d.dot(f);
    };
    const xx = (p: THREE.Vector3) => {
      const d = p.clone().sub(pos);
      return d.dot(rr) / d.dot(f);
    };
    const HS = PR.half_w + PR.slot_half + PR.band_over;
    const HSL = (PR.half_w_left ?? PR.half_w) + PR.slot_half + PR.band_over;
    const v1 = PR.depth + 2 * PR.band_over + PR.left_offset;
    const ztl = exj.rest.blocks[3].lid_z[1];
    const pts: THREE.Vector3[] = [];
    for (const a of [-HSL, HS]) for (const b of [0, v1]) for (const z of [1.5, ztl]) pts.push(Wp(a, b, z));
    const C0 = V(20, 28, 0);
    const PW = (u: number, v: number) =>
      V(C0.x + Math.cos(yaw) * u - Math.sin(yaw) * v, C0.y + Math.sin(yaw) * u + Math.cos(yaw) * v, 0.14);
    const plp: THREE.Vector3[] = [];
    for (const a of [PR.plate_lo[0], PR.plate_hi[0]]) for (const b of [PR.plate_lo[1], PR.plate_hi[1]]) plp.push(PW(a, b));
    const xs0 = pts.map(xx);
    const xs = xs0.concat(plp.map(xx));
    const top = Math.max(tt(Wp(0, 0, exj.rest.cap_top)), ...pts.map(tt));
    const fpx = Math.min((0.84 * W) / (Math.max(...xs0) - Math.min(...xs0)), (0.92 * W) / (Math.max(...xs) - Math.min(...xs)));
    const BX = Math.min(smootherstep((t - 16.5) / 3), 1 - smootherstep((t - 27.4) / 3));
    const XZ = 1 + 0.35 * (t >= 27.4 ? 1 - BX : 0) * (1 - smootherstep((t - 34.3) / 2));
    const fpm = (XZ * (W / 2)) / (18 / (s.lens_mm * 0.82));
    const fpb = 1 / (BX / fpx + (1 - BX) / fpm);
    cam.fov = ((2 * Math.atan(H / 2 / fpb)) * 180) / Math.PI;
    cam.aspect = W / H;
    look(cam, s);
    const shx = ((BX * fpx * (Math.max(...xs) + Math.min(...xs))) / 2) / H;
    const shy = (BX * (0.05 * H - H / 2 + fpx * top)) / H;
    cam.setViewOffset(W, H, shx * H, -shy * H, W, H);
  } else if (!mobile) {
    const aspect = W / H;
    let vfov = s.vfov_deg;
    if (Math.abs(aspect - 1.6) >= 0.02) {
      const hf = 2 * Math.atan(18 / s.lens_mm);
      vfov = ((2 * Math.atan(Math.tan(hf / 2) / aspect)) * 180) / Math.PI;
    }
    cam.fov = vfov;
    cam.aspect = aspect;
    look(cam, s);
    cam.setViewOffset(W, H, s.shift[0] * W, -s.shift[1] * W, W, H);
  } else {
    const hf = 2 * Math.atan(18 / (s.lens_mm * 0.82));
    const vf = 2 * Math.atan(Math.tan(hf / 2) / (W / H));
    cam.fov = (vf * 180) / Math.PI;
    cam.aspect = W / H;
    look(cam, s);
    cam.clearViewOffset();
  }
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}
