// view.html shaders, plus the r9 ride lightmaps, near clay grain, lossFlat, and kiln ball branch (view.html 98-204).
// three r186 rewrites attribute/varying/texture2D/gl_FragColor. Lighting is baked. This is the only surface shader.
//
// Sampler variants are compile-time. A declared sampler2D counts against MAX_TEXTURE_IMAGE_UNITS even when a
// runtime branch never samples it, and ANGLE D3D11's limit is 16. Each mesh compiles only the maps it uses.

export const SAMPLER_CAP = 12;

/** One fragment program, before the variant split. SwiftShader's 32 units hid this. */
export const SURFACE_SAMPLERS_BEFORE = [
  "map",
  "normalMap",
  "ormMap",
  "lightMap",
  "lmAux",
  "lightMap2",
  "lmAux2",
  "clayMap",
  "clayNormal",
  "clayOrm",
  "shMap",
  "rideLm",
  "rideGlow",
  "rideAux",
  "nearN",
  "nearO",
  "nearA",
] as const;

/** three built-ins used beside the surface shader. ShaderMaterial does not pull these in. */
export const BUILTIN_FRAGMENT_SAMPLERS = [
  { id: "sky", samplers: [] as string[], note: "ShaderMaterial, vec3 uniforms only" },
  { id: "meshbasic-depth", samplers: [] as string[], note: "shadow depth pass, no map; renderer.shadowMap stays off" },
  { id: "meshbasic-beads", samplers: [] as string[], note: "flat color, no map" },
  { id: "meshbasic-pool", samplers: ["map"], note: "kiln pool CanvasTexture; no envMap" },
] as const;

const LM2_SCENES = new Set(["attn", "layers", "hero", "loader"]);
const SHADOW_DYN_SCENES = new Set(["layers", "emb", "loader"]);

export type MaterialFeatures = {
  hasColor: boolean;
  dynamic: boolean;
  ao: boolean;
  ride: boolean;
  near: boolean;
  loss: boolean;
  shadow: boolean;
  lm2: boolean;
};

export function samplerBudget(maxUnits: number) {
  return Math.min(16, maxUnits - 4);
}

export function featuresFromMaterial(
  scene: string,
  def: { name?: string; extras?: { dynamic?: boolean; loss?: unknown; aoMap?: unknown; rideLightMap?: unknown } },
  hasColor: boolean,
): MaterialFeatures {
  const extras = def.extras || {};
  const name = def.name || "";
  const dynamic = Boolean(extras.dynamic);
  const signal = name.toLowerCase().includes("signal");
  const ground = name.startsWith("ground") || name.startsWith("sand__ground");
  return {
    hasColor,
    dynamic,
    ao: Boolean(extras.aoMap),
    ride: Boolean(extras.rideLightMap),
    near: dynamic && !signal,
    loss: Boolean(extras.loss),
    shadow: (dynamic && SHADOW_DYN_SCENES.has(scene)) || ground,
    lm2: ground && LM2_SCENES.has(scene),
  };
}

export function materialDefines(features: MaterialFeatures): Record<string, number> {
  const defines: Record<string, number> = {};
  if (features.hasColor) defines.HAS_COLOR = 1;
  if (features.dynamic) {
    defines.HAS_DYN = 1;
    if (features.ao) defines.HAS_AO = 1;
    if (features.ride) defines.HAS_RIDE = 1;
    if (features.near) defines.HAS_NEAR = 1;
  }
  if (features.loss) defines.HAS_LOSS = 1;
  if (features.shadow) defines.HAS_SHADOW = 1;
  if (features.lm2 && !features.dynamic) defines.HAS_LM2 = 1;
  return defines;
}

export function applyDefines(source: string, defines: Record<string, number | undefined>): string {
  const defined = new Set(
    Object.entries(defines)
      .filter(([, value]) => value)
      .map(([key]) => key),
  );
  const lines = source.replace(/\r/g, "").split("\n");
  const stack: { active: boolean; taken: boolean }[] = [];
  const emitting = () => stack.every((frame) => frame.active);
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#ifdef ") || trimmed.startsWith("#ifndef ")) {
      const name = trimmed.slice(trimmed.startsWith("#ifdef ") ? 7 : 8).trim();
      const hit = trimmed.startsWith("#ifdef ") ? defined.has(name) : !defined.has(name);
      const parent = stack.length === 0 || stack[stack.length - 1].active;
      stack.push({ active: parent && hit, taken: hit });
      continue;
    }
    if (trimmed === "#else") {
      const frame = stack.pop();
      if (!frame) continue;
      const parent = stack.length === 0 || stack[stack.length - 1].active;
      stack.push({ active: parent && !frame.taken, taken: true });
      continue;
    }
    if (trimmed === "#endif") {
      stack.pop();
      continue;
    }
    if (emitting()) out.push(line);
  }
  return out.join("\n");
}

export function samplerNames(source: string, defines: Record<string, number | undefined> = {}): string[] {
  const body = applyDefines(source, defines)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const names: string[] = [];
  const re = /\buniform\s+sampler(?:2DArray|2DShadow|2D|Cube|3D)\s+([^;]+);/g;
  for (const match of body.matchAll(re)) {
    for (const name of match[1].split(",")) {
      const trimmed = name.trim();
      if (trimmed) names.push(trimmed);
    }
  }
  return names;
}

export const vertexShader =
  "varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying vec3 vW; varying float vClay;\nattribute vec2 uv1;\n#ifdef HAS_COLOR\nattribute vec4 color;\n#endif\nvoid main(){ vUv = uv; vUv1 = uv1; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz;\n#ifdef HAS_COLOR\n  vClay = color.r;\n#else\n  vClay = 0.;\n#endif\n  gl_Position = projectionMatrix * viewMatrix * w; }";

function surfaceFragment(blocker: number, filter: number) {
  return `uniform float noFlip, lm2Mix, aoFloor, aoMix, layersClay, opacity_, nStr, lmMax, detail, specK, roughK, dynamicMat, fogNear, fogFar, dbg, isLoss, lossFlat, clayScale, grooveStep, grooveHW, grooveBump, hasLm, hasAo;
uniform vec3 sunDir, sunIrr, envCol, fogCol, colorFactor, ambient, ambUp, ambDn, grooveCol; uniform vec3 adA, adX, adY, adZ; uniform float hemiOn, adOn, shSun, shPcss, shRange, shUvM; uniform vec2 f0fm;
uniform mat4 shMat; uniform float shOn, shStr, shBias, shNo, fillK; uniform vec2 shTexel; uniform vec3 fillCol;
uniform float rideOn, rideMix, glowK, rideLmax, glowMax;
uniform float nearOn, nearScale, nearStr, nearD0, nearD1; uniform float ballAlbRef, ballOn, ballLo, ballHi, ballSpec, ballRim, ballEnv, ballTintOn, ballK, ballGlow, ballPulse; uniform vec3 ballTint;
uniform sampler2D map, normalMap, ormMap;
#ifdef HAS_DYN
#ifdef HAS_AO
uniform sampler2D lmAux;
#endif
#ifdef HAS_RIDE
uniform sampler2D rideLm, rideGlow, rideAux;
#endif
#ifdef HAS_NEAR
uniform sampler2D nearN, nearO, nearA;
#endif
#else
uniform sampler2D lightMap, lmAux;
#ifdef HAS_LM2
uniform sampler2D lightMap2, lmAux2;
#endif
#endif
#ifdef HAS_LOSS
uniform sampler2D clayMap, clayNormal, clayOrm;
#endif
#ifdef HAS_SHADOW
uniform sampler2D shMap;
#endif
varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying vec3 vW; varying float vClay;
vec3 perturb(vec3 p, vec3 n, vec3 m, vec2 uv){ vec3 q0=dFdx(p), q1=dFdy(p); vec2 st0=dFdx(uv), st1=dFdy(uv);
  vec3 q1p=cross(q1,n), q0p=cross(n,q0); vec3 T=q1p*st0.x+q0p*st1.x; vec3 B=q1p*st0.y+q0p*st1.y;
  float d=max(dot(T,T),dot(B,B)); float sc=d==0.?0.:inversesqrt(d); return normalize(T*(m.x*sc)+B*(m.y*sc)+n*m.z); }
vec3 bumpH(vec3 p, vec3 n, float h){
  vec3 dx=dFdx(p), dy=dFdy(p); vec3 r1=cross(dy,n), r2=cross(n,dx); float det=dot(dx,r1); float hx=dFdx(h), hy=dFdy(h);
  vec3 g=sign(det)*(hx*r1+hy*r2); return normalize(abs(det)*n - g); }
#ifdef HAS_SHADOW
float shCmp(vec2 uv, float z){ return step(z, texture2D(shMap, uv).r); }
float shLerp(vec2 uv, float z){ vec2 c = uv / shTexel - .5; vec2 f = fract(c); vec2 b = (floor(c) + .5) * shTexel;
  return mix(mix(shCmp(b, z), shCmp(b + vec2(shTexel.x, 0.), z), f.x), mix(shCmp(b + vec2(0., shTexel.y), z), shCmp(b + shTexel, z), f.x), f.y); }
float shadowVis(vec3 Ng){ vec4 p = shMat * vec4(vW + Ng * shNo, 1.); vec3 s = p.xyz / p.w * .5 + .5;
  if (s.x < 0. || s.y < 0. || s.x > 1. || s.y > 1. || s.z > 1.) return 1.; float z = s.z - shBias, v = 0.;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) v += shLerp(s.xy + vec2(float(i), float(j)) * shTexel, z); return v / 9.; }
const vec2 PD[16] = vec2[16](vec2(-.94,-.40),vec2(.95,-.77),vec2(-.09,-.93),vec2(.34,.29),vec2(-.92,.46),vec2(-.82,.15),vec2(-.38,.28),vec2(-.26,-.10),
  vec2(.54,-.52),vec2(.93,.11),vec2(.40,.83),vec2(.66,.45),vec2(-.04,.56),vec2(-.54,-.71),vec2(.15,-.27),vec2(-.49,.85));
float shadowSoft(vec3 Ng){ vec4 p = shMat * vec4(vW + Ng * shNo, 1.); vec3 s = p.xyz / p.w * .5 + .5;
  if (s.x < 0. || s.y < 0. || s.x > 1. || s.y > 1. || s.z > 1.) return 1.; float z = s.z - shBias;
  float sr = .45 * shUvM, bd = 0., nb = 0.;
  for (int i = 0; i < ${blocker}; i++) { float fi = float(i) + .5, a = fi * 2.39996; float d = texture2D(shMap, s.xy + vec2(cos(a), sin(a)) * sqrt(fi / ${blocker}.) * sr).r; if (d < z) { bd += d; nb += 1.; } }
  if (nb < .5) return 1.; float dm = (z - bd / nb) * shRange; float r = clamp(.0615 * dm, .01, .5) * shUvM;
  float v = 0.; for (int i = 0; i < ${filter}; i++) { float fi = float(i) + .5, a = fi * 2.39996; v += shLerp(s.xy + vec2(cos(a), sin(a)) * sqrt(fi / ${filter}.) * r, z); } float o = v / ${filter}.; return (o == o) ? clamp(o, 0., 1.) : 1.; }
#endif
#ifdef HAS_NEAR
vec3 triN(vec3 p, vec3 n, float sc){ vec3 b = pow(abs(n), vec3(4.)); b /= (b.x + b.y + b.z);
  vec2 tx = texture2D(nearN, p.zy * sc).xy * 2. - 1., ty = texture2D(nearN, p.xz * sc + .37).xy * 2. - 1., tz = texture2D(nearN, p.xy * sc + .71).xy * 2. - 1.;
  return vec3(0., tx.y, tx.x) * b.x + vec3(ty.x, 0., ty.y) * b.y + vec3(tz.x, tz.y, 0.) * b.z; }
vec3 triS(sampler2D t, vec3 p, vec3 n, float sc){ vec3 b = pow(abs(n), vec3(4.)); b /= (b.x + b.y + b.z);
  return texture2D(t, p.zy * sc).rgb * b.x + texture2D(t, p.xz * sc + .37).rgb * b.y + texture2D(t, p.xy * sc + .71).rgb * b.z; }
#endif
void main(){
  vec3 Ng = normalize(vN); if(!gl_FrontFacing && noFlip < .5) Ng = -Ng;
  vec3 mn = texture2D(normalMap, vUv).xyz * 2. - 1.; mn.y = -mn.y; mn.xy *= nStr;
  vec3 Nd = perturb(vW, Ng, mn, vUv);
  vec3 alb = texture2D(map, vUv).rgb; vec3 orm = texture2D(ormMap, vUv).rgb; float cav = orm.r; float rough = orm.g;
  float sk = specK; vec2 f0 = f0fm;
  if (colorFactor.r >= 0.) alb = alb * 2. * colorFactor;
#ifdef HAS_NEAR
  if (nearOn > .5) { float nw = 1. - smoothstep(nearD0, nearD1, length(cameraPosition - vW));
    if (nw > 0.) { vec3 o = triN(vW, Ng, nearScale); o -= Nd * dot(o, Nd); Nd = normalize(Nd + o * nearStr * nw);
      vec3 to = triS(nearO, vW, Ng, nearScale); cav *= mix(1., .55 + .45 * to.r, nw); rough = mix(rough, to.g, .5 * nw);
      float g = dot(triS(nearA, vW * 2.3, Ng, nearScale), vec3(.333)); alb *= mix(1., .82 + .36 * g, nw * .8); } }
#endif
#ifdef HAS_LOSS
  if (isLoss > .5) {
    float c = clamp(vClay, 0., 1.) * layersClay; vec2 cu = vUv * clayScale;
    float g = 1. - clamp(abs(fract(vW.y / grooveStep + .5) - .5) / grooveHW, 0., 1.);
    g *= c;
    vec3 calb = mix(texture2D(clayMap, cu).rgb, grooveCol, g);
    alb = mix(alb, calb, pow(c, .6));
    vec3 cm = texture2D(clayNormal, cu).xyz * 2. - 1.; cm.y = -cm.y; cm.xy *= 2.0;
    vec3 Nc = perturb(vW, Ng, cm, cu); Nd = normalize(mix(Nd, Nc, c));
    Nd = normalize(mix(Nd, bumpH(vW, Nd, -0.01 * g), grooveBump));
    cav = mix(cav, texture2D(clayOrm, cu).r, c);
  }
#endif
  if (noFlip > .5) { vec3 gF = normalize(cross(dFdx(vW), dFdy(vW))); if (abs(gF.y) < .5) Nd = Ng; }
  float cg = max(dot(Ng, sunDir), 0.);
  vec3 light; float occ = 1.; vec3 aux = vec3(1.);
#ifdef HAS_DYN
  float ao = 1.;
#ifdef HAS_AO
  ao = mix(texture2D(lmAux, vUv1).g, texture2D(lmAux, vUv1).b, aoMix);
#endif
  ao = mix(aoFloor, 1., ao); occ = ao;
  float sv = 1.;
#ifdef HAS_AO
  sv = texture2D(lmAux, vUv1).r;
#endif
  float shv = 1.;
#ifdef HAS_SHADOW
  shv = (shOn > .5 && shSun > .5) ? mix(1., shPcss > .5 ? shadowSoft(Ng) : shadowVis(Ng), shStr) : 1.;
#endif
  light = (adOn > .5 ? max(adA + adX * Nd.x + adY * Nd.y + adZ * Nd.z, vec3(0.)) : hemiOn > .5 ? mix(ambDn, ambUp, .5 + .5 * Nd.y) : ambient * ao) + sunIrr * max(dot(Nd, sunDir), 0.) * sv * shv;
  light += fillCol * (fillK * aoMix * (.55 + .45 * Nd.y) * mix(1., ao, .5));
#ifdef HAS_SHADOW
  if (shOn > .5 && shSun < .5) light *= 1. - shStr * (1. - shadowVis(Ng));
#endif
#ifdef HAS_RIDE
  if (rideOn > .5 && rideMix > 0.) {
    vec3 ra = texture2D(rideAux, vUv1).rgb; vec3 lr = texture2D(rideLm, vUv1).rgb * rideLmax + sunIrr * ra.r * (dot(Nd, sunDir) - dot(Nd, Ng) * cg) * detail;
    light = mix(light, max(lr, vec3(0.)), rideMix); occ = mix(occ, ra.g, rideMix); }
  if (rideOn > .5 && glowK > 0.) light += texture2D(rideGlow, vUv1).rgb * glowMax * glowK;
#endif
#else
  aux = texture2D(lmAux, vUv1).rgb; vec3 lmc = texture2D(lightMap, vUv1).rgb;
#ifdef HAS_LM2
  if (lm2Mix > 0.) { aux = mix(aux, texture2D(lmAux2, vUv1).rgb, lm2Mix); lmc = mix(lmc, texture2D(lightMap2, vUv1).rgb, lm2Mix); }
#endif
  occ = aux.g;
  light = lmc * lmMax + sunIrr * aux.r * (dot(Nd, sunDir) - dot(Nd, Ng) * cg) * detail;
  if (lossFlat > 0.) light = mix(light, texture2D(lightMap, vec2(.02, .02)).rgb * lmMax, lossFlat);
#ifdef HAS_SHADOW
  if (shOn > .5) { vec3 l0 = light; light = max(light - shStr * (1. - (shPcss > .5 ? shadowSoft(Ng) : shadowVis(Ng))) * sunIrr * clamp(aux.r, 0., 1.) * max(dot(Nd, sunDir), 0.), light * .22); light = min(light, l0); if (!(light.r == light.r && light.g == light.g && light.b == light.b)) light = l0; }
#endif
#endif
  float rk = clamp(1. + roughK * (0.872 - rough), 0., 2.);
  vec3 V = normalize(cameraPosition - vW); float F = f0.x + (f0.y - f0.x) * pow(clamp(1. - dot(Nd, V), 0., 1.), 5.);
  vec3 col = alb * cav * light + F * envCol * occ * sk * rk;
  if (ballOn > .5) {
    if (ballTintOn > .5) { float lr = clamp(dot(alb, vec3(.2126, .7152, .0722)) / ballAlbRef, .7, 1.3); vec3 ta = ballTint * lr; col *= clamp(ta / max(alb, vec3(.004)), 0., 40.); alb = ta; }
    vec3 Ns = normalize(mix(Nd, Ng, .75)); float nv = clamp(dot(Ns, V), 0., 1.); vec3 Hh = normalize(sunDir + V);
    float lam = max(dot(Nd, sunDir), 0.);
    if (ballK > .5) {
      float lr = clamp(dot(alb, vec3(.2126, .7152, .0722)) / max(dot(ballTint, vec3(.2126, .7152, .0722)), 1e-4), .7, 1.3);
      vec3 skin = mix(col, alb * (.75 + .55 * lam), .88) + sunIrr * vec3(1., .86, .74) * pow(max(dot(Ns, Hh), 0.), 24.) * .14 + envCol * F * .08;
      float tex = (lr - .7) / .6; float craze = clamp(1. - 6. * length(Nd - Ng), 0., 1.);
      float g = pow(smoothstep(.12, 1., nv), 1.9) * ballGlow * ballPulse * mix(.55, 1.15, tex) * mix(.7, 1.05, craze) * mix(.8, 1., cav);
      vec3 gc = mix(vec3(.761, .122, .027), vec3(1., .323, .074), smoothstep(.35, .95, nv));
      col = min(skin * (1. - .55 * clamp(g, 0., 1.)) + gc * g, vec3(1., .43, .16));
    } else col = mix(col, alb * (ballLo + ballHi * lam), .88) + sunIrr * vec3(1., .84, .7) * pow(max(dot(Ns, Hh), 0.), 90.) * ballSpec + vec3(.9, .5, .32) * pow(1. - nv, 3.) * ballRim + envCol * vec3(1., .8, .68) * F * ballEnv; }
  float fogF = clamp((length(cameraPosition - vW) - fogNear) / (fogFar - fogNear), 0., 1.);
  col = mix(col, fogCol, fogF);
  if (dbg > .5) {
    vec3 dbgLm = light;
#ifndef HAS_DYN
    dbgLm = texture2D(lightMap, vUv1).rgb * lmMax;
#endif
    col = dbg < 1.5 ? alb : dbg < 2.5 ? dbgLm * .5 : dbg < 3.5 ? vec3(.5 + 2. * (dot(Nd, sunDir) - dot(Nd, Ng) * cg)) : dbg < 4.5 ? aux : dbg < 5.5 ? vec3(cav) : dbg < 6.5 ? vec3(vUv1, 0.) : dbg < 7.5 ? vec3(fract(vUv1 * 32.), 0.) : vec3(
#ifdef HAS_SHADOW
      shOn > .5 ? shadowVis(Ng) : .5
#else
      .5
#endif
    ); }
  gl_FragColor = vec4(col, opacity_);
  #include <colorspace_fragment>
}`;
}

export const fragmentShader = surfaceFragment(24, 48);
export const fragmentShaderMobile = surfaceFragment(12, 16);
export const skyVertexShader = "varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }";
export const skyFragmentShader = "uniform vec3 hz, sk; varying vec3 vD; void main(){ float z = normalize(vD).y; float f = smoothstep(0., .16, z) * (1. - smoothstep(.55, .98, z)); gl_FragColor = vec4(mix(hz, sk, f), 1.);\n#include <colorspace_fragment>\n}";
