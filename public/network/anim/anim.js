// primearc-anim/1 reference decoder + driver (ES module, depends only on three). See INTEGRATION.md §7.
// const A = await loadAnim('/assets/anim/');  A.world(name, t) -> {p:[3], q:[4], s:[3]} | null ; A.scalar(name, t) -> number
// A.apply(t, nodesByName)  sets every animated node (three.js WORLD TRS -> parent-local), parents first, hides zero-scale nodes.
// A.applyThreads(t, nodesByName)  CPU morph of the 15 ATTN_th* thread meshes (needs A.initThreads(nodesByName) once after load).
import * as THREE from 'three';
export async function loadAnim(base) {
  const J = await (await fetch(base + 'anim.json')).json();
  const B = new Uint16Array(await (await fetch(base + J.bin)).arrayBuffer());
  const dec = (c, n) => { const out = new Float32Array(n); if ('c' in c) { out.fill(c.c); return out; }
    let u = 0; const k = (c.hi - c.lo) / 65535; for (let i = 0; i < n; i++) { u = (u + B[c.o + i]) & 0xFFFF; out[i] = c.lo + u * k; } return out; };
  const tracks = new Map(), scal = new Map();
  for (const tr of J.tracks) { const n = tr.f1 - tr.f0 + 1; tracks.set(tr.name, { ...tr, n, ch: [...tr.p, ...tr.q, ...tr.s].map(c => dec(c, n)) }); }
  for (const s of J.scalars) scal.set(s.name, 'c' in s ? { c: s.c } : { f0: s.f0, n: s.f1 - s.f0 + 1, v: dec(s.v, s.f1 - s.f0 + 1) });
  const idx = (f0, n, t) => { const fr = Math.min(Math.max(t * J.fps - f0, 0), n - 1), i = Math.floor(fr); return [i, Math.min(i + 1, n - 1), fr - i]; };
  const world = (name, t) => { const tr = tracks.get(name); if (!tr) return null; const [i, j, a] = idx(tr.f0, tr.n, t);
    const v = tr.ch.map(c => c[i] + (c[j] - c[i]) * a); const q = v.slice(3, 7), l = Math.hypot(...q) || 1;
    return { p: v.slice(0, 3), q: q.map(x => x / l), s: v.slice(7, 10) }; };
  const scalar = (name, t) => { const s = scal.get(name); if (!s) return undefined; if ('c' in s) return s.c; const [i, j, a] = idx(s.f0, s.n, t); return s.v[i] + (s.v[j] - s.v[i]) * a; };
  const depth = o => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), IP = new THREE.Matrix4();
  let order = null;
  const apply = (t, nodesByName) => {   // nodesByName: name -> [Object3D, ...] (hero + loader share names: pass both)
    if (!order) { order = []; for (const name of tracks.keys()) for (const o of (nodesByName[name] || [])) order.push([depth(o), o, name]); order.sort((a, b) => a[0] - b[0]); }
    for (const [, o, name] of order) { const w = world(name, t); const sp = w.s[0] * w.s[1] * w.s[2];
      if (Math.abs(sp) < 1e-9) { if (o.visible) { o.visible = false; o.userData.animHidden = true; } continue; }
      if (o.userData.animHidden) { o.visible = true; o.userData.animHidden = false; }   // only undo OUR hide (scene-level hides, e.g. hero network in loader mode, stay)
      M.compose(P.fromArray(w.p), Q.fromArray(w.q), S.fromArray(w.s)); o.parent.updateMatrixWorld(true);
      IP.copy(o.parent.matrixWorld).invert().multiply(M).decompose(o.position, o.quaternion, o.scale); o.updateMatrixWorld(true); } };
  let TH = null;
  const initThreads = async (nodesByName) => { const raw = new Uint16Array(await (await fetch(base + J.threads_morph.bin)).arrayBuffer()); TH = [];
    for (const m of J.threads_morph.meshes) { const d = new Float32Array(m.nverts * 3); for (let i = 0; i < d.length; i++) d[i] = THREE.DataUtils.fromHalfFloat(raw[m.o + i]);
      for (const o of (nodesByName[m.name] || [])) o.traverse(x => { if (!x.isMesh) return; const pa = x.geometry.attributes.position;
        if (pa.count !== m.nverts) { console.warn('thread vertex count mismatch', m.name, pa.count, m.nverts); return; }
        TH.push({ mesh: x, base: Float32Array.from(pa.array), d, wb: m.w_bake, wt: m.weight_track }); }); } return TH.length; };
  const applyThreads = (t) => { if (!TH) return; for (const h of TH) { const k = scalar(h.wt, t) - h.wb, pa = h.mesh.geometry.attributes.position, a = pa.array;
      for (let i = 0; i < a.length; i++) a[i] = h.base[i] + k * h.d[i]; pa.needsUpdate = true; h.mesh.geometry.computeBoundingSphere(); } };
  return { J, world, scalar, apply, initThreads, applyThreads, names: [...tracks.keys()] };
}
