/**
 * Scroll camera. Samples come from the Blender animatic (three.js Y-up).
 * Progress 0 and 1 are the same hero frame, so the epoch loop has no cut.
 */

export const PATH_FPS = 24;
export const PATH_DURATION = 62.5;
export const PARALLAX_MAX_DEG = 1.5;

export const BEATS = [
  { id: "01", label: "HERO", start: 0, end: 10.5 },
  { id: "02", label: "INPUT", start: 10.5, end: 19.5 },
  { id: "03", label: "LAYERS", start: 19.5, end: 30 },
  { id: "04", label: "ATTENTION", start: 30, end: 39 },
  { id: "05", label: "LOSS", start: 39, end: 48 },
  { id: "06", label: "EMBEDDING", start: 48, end: 56 },
  { id: "07", label: "BOOK", start: 56, end: 61.4 },
] as const;

export type Beat = (typeof BEATS)[number];

export type Pose = {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  vfov: number;
  shiftX: number;
  shiftY: number;
};

export type CameraSample = {
  t: number;
  position: [number, number, number];
  target: [number, number, number];
  vfov: number;
  shift: [number, number];
};

export type CameraPath = {
  fps: number;
  duration: number;
  samples: CameraSample[];
};

/** Hero hold. Matches camera-path.json at t = 0 and t = 62.5. */
export const HERO_POSE: Pose = {
  px: 12.5,
  py: 7.72,
  pz: 11.5,
  tx: 3,
  ty: 2.52,
  tz: -0.4,
  vfov: 29.323,
  shiftX: -0.165,
  shiftY: 0.025,
};

type RawSample = {
  t?: number;
  position_threejs?: number[];
  target_threejs?: number[];
  vfov_deg?: number;
  shift?: number[];
};

function vec3(value: number[] | undefined, label: string): [number, number, number] {
  if (!value || value.length < 3 || value.some((n) => !Number.isFinite(n))) {
    throw new Error(`camera path ${label}`);
  }
  return [value[0], value[1], value[2]];
}

export function parseCameraPath(raw: unknown): CameraPath {
  if (!raw || typeof raw !== "object") throw new Error("camera path");
  const data = raw as { fps?: number; duration_s?: number; samples?: RawSample[] };
  if (!Array.isArray(data.samples) || data.samples.length < 2) throw new Error("camera path samples");
  const samples: CameraSample[] = data.samples.map((sample, index) => {
    const shift = sample.shift;
    if (!shift || shift.length < 2) throw new Error(`camera path shift ${index}`);
    return {
      t: sample.t ?? index / (data.fps || PATH_FPS),
      position: vec3(sample.position_threejs, `position ${index}`),
      target: vec3(sample.target_threejs, `target ${index}`),
      vfov: sample.vfov_deg ?? HERO_POSE.vfov,
      shift: [shift[0], shift[1]],
    };
  });
  return {
    fps: data.fps || PATH_FPS,
    duration: data.duration_s || PATH_DURATION,
    samples,
  };
}

export function poseFromSample(sample: CameraSample): Pose {
  return {
    px: sample.position[0],
    py: sample.position[1],
    pz: sample.position[2],
    tx: sample.target[0],
    ty: sample.target[1],
    tz: sample.target[2],
    vfov: sample.vfov,
    shiftX: sample.shift[0],
    shiftY: sample.shift[1],
  };
}

function lerp(a: number, b: number, u: number) {
  return a + (b - a) * u;
}

export function samplePose(path: CameraPath, time: number): Pose {
  const duration = path.duration;
  let t = time % duration;
  if (t < 0) t += duration;
  const scaled = t * path.fps;
  const last = path.samples.length - 1;
  const i0 = Math.min(last, Math.max(0, Math.floor(scaled)));
  const i1 = Math.min(last, i0 + 1);
  const u = Math.min(1, Math.max(0, scaled - i0));
  const a = path.samples[i0];
  const b = path.samples[i1];
  return {
    px: lerp(a.position[0], b.position[0], u),
    py: lerp(a.position[1], b.position[1], u),
    pz: lerp(a.position[2], b.position[2], u),
    tx: lerp(a.target[0], b.target[0], u),
    ty: lerp(a.target[1], b.target[1], u),
    tz: lerp(a.target[2], b.target[2], u),
    vfov: lerp(a.vfov, b.vfov, u),
    shiftX: lerp(a.shift[0], b.shift[0], u),
    shiftY: lerp(a.shift[1], b.shift[1], u),
  };
}

/** Exponential smoothing. A step never passes the target. */
export function damp(current: number, target: number, lambda: number, dt: number) {
  const k = 1 - Math.exp(-Math.max(0, lambda) * Math.max(0, dt));
  return current + (target - current) * k;
}

export function dampPose(current: Pose, target: Pose, lambda: number, dt: number): Pose {
  return {
    px: damp(current.px, target.px, lambda, dt),
    py: damp(current.py, target.py, lambda, dt),
    pz: damp(current.pz, target.pz, lambda, dt),
    tx: damp(current.tx, target.tx, lambda, dt),
    ty: damp(current.ty, target.ty, lambda, dt),
    tz: damp(current.tz, target.tz, lambda, dt),
    vfov: damp(current.vfov, target.vfov, lambda, dt),
    shiftX: damp(current.shiftX, target.shiftX, lambda, dt),
    shiftY: damp(current.shiftY, target.shiftY, lambda, dt),
  };
}

/**
 * Scroll time. Linear through the flight, then a hold on the closing
 * network (the book beat, t = 60) before the short return to the hero.
 * Progress 1 is the hero again, so the epoch wrap does not cut.
 */
export function timeAtProgress(progress: number, duration = PATH_DURATION) {
  const wrapped = progress - Math.floor(progress);
  if (wrapped === 0) return 0;
  const book = 56 / duration;
  const flightEnd = 0.925;
  const holdEnd = 0.972;
  if (wrapped <= book) return wrapped * duration;
  if (wrapped < flightEnd) {
    const u = (wrapped - book) / (flightEnd - book);
    return 56 + u * 4;
  }
  if (wrapped < holdEnd) return 60;
  const u = (wrapped - holdEnd) / (1 - holdEnd);
  return 60 + u * (duration - 60);
}

export function beatAt(time: number): Beat {
  const duration = PATH_DURATION;
  let t = time % duration;
  if (t < 0) t += duration;
  if (t >= 61.4) return BEATS[0];
  for (let i = BEATS.length - 1; i >= 0; i--) {
    const beat = BEATS[i];
    if (t >= beat.start && t < beat.end) return beat;
  }
  return BEATS[0];
}

export function indexLabel(beat: Beat) {
  return `${beat.id} / ${beat.label}`;
}

/**
 * Keep the animatic's horizontal framing when the viewport is taller than 16:10.
 * Desktop 1440×900 is 16:10, so it uses the path fov unchanged.
 */
export function verticalFovForAspect(vfovDeg: number, aspect: number, referenceAspect = 1.6) {
  if (!Number.isFinite(aspect) || aspect >= referenceAspect * 0.98) return vfovDeg;
  const v = (vfovDeg * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * referenceAspect);
  const widened = (2 * Math.atan(Math.tan(h / 2) / Math.max(0.2, aspect)) * 180) / Math.PI;
  // A phone is much taller than 16:10. Preserving the full horizontal frame
  // shrinks the lattice to a speck. Keep it large, and leave the lower third for type.
  return vfovDeg + (widened - vfovDeg) * 0.36;
}

export function parallaxRadians(pointerX: number, pointerY: number, enabled: boolean) {
  if (!enabled) return { yaw: 0, pitch: 0 };
  const x = Math.min(1, Math.max(-1, pointerX));
  const y = Math.min(1, Math.max(-1, pointerY));
  const max = (PARALLAX_MAX_DEG * Math.PI) / 180;
  return { yaw: x * max, pitch: -y * max * 0.65 };
}

/** Orbit the camera around its look target. Distance is preserved. */
export function orbitAround(
  position: [number, number, number],
  target: [number, number, number],
  yaw: number,
  pitch: number,
): [number, number, number] {
  let x = position[0] - target[0];
  const y = position[1] - target[1];
  let z = position[2] - target[2];
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  x = x1;
  z = z1;
  const distXZ = Math.hypot(x, z);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = y * cp + distXZ * sp;
  const horiz = -y * sp + distXZ * cp;
  const inv = distXZ > 1e-6 ? horiz / distXZ : 0;
  return [target[0] + x * inv, target[1] + y2, target[2] + z * inv];
}

export function posesClose(a: Pose, b: Pose, epsilon = 1e-3) {
  const keys: (keyof Pose)[] = ["px", "py", "pz", "tx", "ty", "tz", "vfov", "shiftX", "shiftY"];
  return keys.every((key) => Math.abs(a[key] - b[key]) <= epsilon);
}
