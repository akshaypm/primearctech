import * as THREE from "three";

type Channel = { c: number } | { o: number; lo: number; hi: number };
type TrackJson = { name: string; f0: number; f1: number; p: Channel[]; q: Channel[]; s: Channel[] };
type ScalarJson = { name: string; c?: number; f0?: number; f1?: number; v?: Channel };
type MorphMesh = { name: string; nverts: number; o: number; w_bake: number; weight_track: string };
export type AnimPack = {
  fps: number;
  bin: string;
  tracks: TrackJson[];
  scalars: ScalarJson[];
  threads_morph?: { bin: string; meshes: MorphMesh[] };
};

export type WorldTRS = { p: number[]; q: number[]; s: number[] };

export type AnimApi = {
  world: (name: string, t: number) => WorldTRS | null;
  scalar: (name: string, t: number) => number | undefined;
  apply: (t: number, nodesByName: Record<string, THREE.Object3D[]>) => void;
  addPack: (pack: AnimPack, buffer: ArrayBuffer) => void;
  invalidate: () => void;
  initThreads: (nodesByName: Record<string, THREE.Object3D[]>) => Promise<number>;
  applyThreads: (t: number) => void;
  warnings: string[];
  names: string[];
};

type Decoded = { f0: number; n: number; fps: number; ch: Float32Array[] };
type DecodedScalar = { c: number } | { f0: number; n: number; fps: number; v: Float32Array };

/** Scene packs share this decoder. Tracks are uint16 zig-zag deltas, parents first, zero scale hides. */
export function createAnim(): AnimApi {
  const tracks = new Map<string, Decoded>();
  const scal = new Map<string, DecodedScalar>();
  let threads: { bin: string; meshes: MorphMesh[] } | null = null;
  const warnings: string[] = [];

  const decode = (view: Uint16Array, c: Channel, n: number) => {
    const out = new Float32Array(n);
    if ("c" in c) {
      out.fill(c.c);
      return out;
    }
    let u = 0;
    const k = (c.hi - c.lo) / 65535;
    for (let i = 0; i < n; i += 1) {
      u = (u + view[c.o + i]) & 0xffff;
      out[i] = c.lo + u * k;
    }
    return out;
  };

  const addPack = (pack: AnimPack, buffer: ArrayBuffer) => {
    const view = new Uint16Array(buffer);
    for (const tr of pack.tracks) {
      const n = tr.f1 - tr.f0 + 1;
      tracks.set(tr.name, { f0: tr.f0, n, fps: pack.fps, ch: [...tr.p, ...tr.q, ...tr.s].map((c) => decode(view, c, n)) });
    }
    for (const s of pack.scalars) {
      if (s.v === undefined && s.c !== undefined) scal.set(s.name, { c: s.c });
      else if (s.f0 !== undefined && s.f1 !== undefined && s.v) {
        const n = s.f1 - s.f0 + 1;
        scal.set(s.name, { f0: s.f0, n, fps: pack.fps, v: decode(view, s.v, n) });
      }
    }
    if (pack.threads_morph) threads = pack.threads_morph;
    order = null;
  };

  const idx = (f0: number, n: number, fps: number, t: number) => {
    const fr = Math.min(Math.max(t * fps - f0, 0), n - 1);
    const i = Math.floor(fr);
    return [i, Math.min(i + 1, n - 1), fr - i] as const;
  };

  const world = (name: string, t: number): WorldTRS | null => {
    const tr = tracks.get(name);
    if (!tr) return null;
    const [i, j, a] = idx(tr.f0, tr.n, tr.fps, t);
    const v = tr.ch.map((c) => c[i] + (c[j] - c[i]) * a);
    const q = v.slice(3, 7);
    const l = Math.hypot(...q) || 1;
    return { p: v.slice(0, 3), q: q.map((x) => x / l), s: v.slice(7, 10) };
  };

  const scalar = (name: string, t: number) => {
    const s = scal.get(name);
    if (!s) return undefined;
    if ("c" in s) return s.c;
    const [i, j, a] = idx(s.f0, s.n, s.fps, t);
    return s.v[i] + (s.v[j] - s.v[i]) * a;
  };

  const depth = (o: THREE.Object3D) => {
    let d = 0;
    let x: THREE.Object3D | null = o;
    while (x?.parent) {
      d += 1;
      x = x.parent;
    }
    return d;
  };

  const M = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const S = new THREE.Vector3();
  const IP = new THREE.Matrix4();
  let order: [number, THREE.Object3D, string][] | null = null;
  const invalidate = () => {
    order = null;
  };
  const apply = (t: number, nodesByName: Record<string, THREE.Object3D[]>) => {
    if (!order) {
      order = [];
      for (const name of tracks.keys()) for (const o of nodesByName[name] || []) order.push([depth(o), o, name]);
      order.sort((a, b) => a[0] - b[0]);
    }
    for (const [, o, name] of order) {
      const w = world(name, t);
      if (!w) continue;
      const sp = w.s[0] * w.s[1] * w.s[2];
      if (Math.abs(sp) < 1e-9) {
        if (o.visible) {
          o.visible = false;
          o.userData.animHidden = true;
        }
        continue;
      }
      if (o.userData.animHidden) {
        o.visible = true;
        o.userData.animHidden = false;
      }
      M.compose(P.fromArray(w.p), Q.fromArray(w.q), S.fromArray(w.s));
      if (o.parent) {
        o.parent.updateMatrixWorld(true);
        IP.copy(o.parent.matrixWorld).invert().multiply(M).decompose(o.position, o.quaternion, o.scale);
      }
      o.updateMatrixWorld(true);
    }
  };

  type Thread = { mesh: THREE.Mesh; base: Float32Array; d: Float32Array; wb: number; wt: string };
  let TH: Thread[] | null = null;
  const initThreads = async (nodesByName: Record<string, THREE.Object3D[]>) => {
    if (!threads) return 0;
    const url = threads.bin.startsWith("/") ? threads.bin : `/network/anim/${threads.bin}`;
    const raw = new Uint16Array(await (await fetch(url)).arrayBuffer());
    TH = [];
    for (const m of threads.meshes) {
      const d = new Float32Array(m.nverts * 3);
      for (let i = 0; i < d.length; i += 1) d[i] = THREE.DataUtils.fromHalfFloat(raw[m.o + i]);
      for (const o of nodesByName[m.name] || []) {
        o.traverse((x) => {
          const mesh = x as THREE.Mesh;
          if (!mesh.isMesh) return;
          const pa = mesh.geometry.attributes.position;
          if (pa.count !== m.nverts) {
            const msg = `thread vertex count mismatch ${m.name} glb=${pa.count} morph=${m.nverts}`;
            warnings.push(msg);
            console.warn(msg);
            return;
          }
          TH?.push({ mesh, base: Float32Array.from(pa.array as ArrayLike<number>), d, wb: m.w_bake, wt: m.weight_track });
        });
      }
    }
    return TH.length;
  };
  const applyThreads = (t: number) => {
    if (!TH) return;
    for (const h of TH) {
      const k = (scalar(h.wt, t) ?? h.wb) - h.wb;
      const pa = h.mesh.geometry.attributes.position;
      const a = pa.array as Float32Array;
      for (let i = 0; i < a.length; i += 1) a[i] = h.base[i] + k * h.d[i];
      pa.needsUpdate = true;
    }
  };
  return {
    world,
    scalar,
    apply,
    addPack,
    invalidate,
    initThreads,
    applyThreads,
    warnings,
    get names() {
      return [...tracks.keys()];
    },
  };
}
