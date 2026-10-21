/** Shared GPGPU step. Both ping-pong shaders call swarmVelocity so they stay in lockstep. */

const SIM_FNS = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

vec3 curlNoise(vec3 p) {
  float e = 0.16;
  vec3 e1 = vec3(47.3, 19.1, 7.7);
  vec3 e2 = vec3(11.9, 53.2, 29.4);
  vec3 e3 = vec3(23.5, 3.8, 61.2);
  float dF3dy = (vnoise(p + e3 + vec3(0.0, e, 0.0)) - vnoise(p + e3 - vec3(0.0, e, 0.0))) / (2.0 * e);
  float dF2dz = (vnoise(p + e2 + vec3(0.0, 0.0, e)) - vnoise(p + e2 - vec3(0.0, 0.0, e))) / (2.0 * e);
  float dF1dz = (vnoise(p + e1 + vec3(0.0, 0.0, e)) - vnoise(p + e1 - vec3(0.0, 0.0, e))) / (2.0 * e);
  float dF3dx = (vnoise(p + e3 + vec3(e, 0.0, 0.0)) - vnoise(p + e3 - vec3(e, 0.0, 0.0))) / (2.0 * e);
  float dF2dx = (vnoise(p + e2 + vec3(e, 0.0, 0.0)) - vnoise(p + e2 - vec3(e, 0.0, 0.0))) / (2.0 * e);
  float dF1dy = (vnoise(p + e1 + vec3(0.0, e, 0.0)) - vnoise(p + e1 - vec3(0.0, e, 0.0))) / (2.0 * e);
  return vec3(dF3dy - dF2dz, dF1dz - dF3dx, dF2dx - dF1dy);
}

vec4 swarmVelocity(vec3 pos, vec3 vel, vec3 home, vec3 seam) {
  if (uPulse >= 0.0 && uPulse < 0.25) {
    return vec4(vel * 0.32, 0.0);
  }
  vec3 extra = vec3(0.0);
  vec3 toCursor = pos - uCursor;
  float dist = length(toCursor);
  float sigma = 0.2;
  float inf = exp(-(dist * dist) / (2.0 * sigma * sigma));
  vec3 away = toCursor / max(dist, 0.045);
  vec3 curl = curlNoise(pos * 1.65 + vec3(0.0, uTime * 0.13, 0.2));
  float spd = length(uCursorVel);
  extra += (away * (62.0 + spd * 22.0) + curl * (34.0 + spd * 14.0) + uCursorVel * 8.0) * inf * uPointer;

  if (uRippleT >= 0.0 && uRippleT < 1.35) {
    float rd = length(pos.xy - uRipple.xy);
    float ring = uRippleT * 1.7;
    float band = exp(-pow((rd - ring) / 0.085, 2.0));
    vec3 radial = normalize(pos - vec3(uRipple.xy, pos.z) + vec3(0.0001));
    extra += radial * band * 78.0 * exp(-uRippleT * 1.15);
  }

  vec3 accel = (home - pos) * uSpringK - vel * uSpringC + extra;
  vec3 newVel = vel + accel * uDt;
  if (uBurst > 0.5) {
    vec3 kick = normalize(home - seam + curlNoise(home * 2.4 + 4.0) * 0.42 + vec3(0.0001));
    newVel += kick * 2.05;
    newVel += normalize(home + vec3(0.0001, 0.02, 0.08)) * 0.35;
  }
  float sp = length(newVel);
  if (sp > 3.3) newVel *= 3.3 / sp;
  return vec4(newVel, length(extra));
}
`;

const SIM_UNIFORMS = /* glsl */ `
uniform sampler2D uHome;
uniform sampler2D uOrigin;
uniform sampler2D uSeam;
uniform sampler2D uShape;
uniform float uDt;
uniform float uMode;
uniform float uLock;
uniform float uPulse;
uniform float uBurst;
uniform float uTime;
uniform vec3 uCursor;
uniform vec3 uCursorVel;
uniform float uPointer;
uniform vec3 uRipple;
uniform float uRippleT;
uniform float uSpringK;
uniform float uSpringC;
`;

export const positionShader = /* glsl */ `
${SIM_UNIFORMS}
${SIM_FNS}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 home = texture2D(uHome, uv).xyz;
  vec3 origin = texture2D(uOrigin, uv).xyz;
  vec3 seam = texture2D(uSeam, uv).xyz;
  float delay = texture2D(uShape, uv).w;

  if (uMode < 0.5) {
    float span = max(0.8 - delay * 0.46, 0.2);
    float t = clamp((uLock - delay * 0.46) / span, 0.0, 1.0);
    float s = t * t * (3.0 - 2.0 * t);
    float e = s * s * (3.0 - 2.0 * s);
    vec3 streamed = mix(origin, home, e);
    float beat = smoothstep(0.86, 0.98, uLock);
    gl_FragColor = vec4(mix(streamed, home, beat), 1.0);
    return;
  }

  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  if (uPulse >= 0.0 && uPulse < 0.25) {
    float pull = 1.0 - exp(-uDt * 6.5);
    gl_FragColor = vec4(mix(pos, seam, pull), 1.0);
    return;
  }
  vec4 next = swarmVelocity(pos, vel, home, seam);
  gl_FragColor = vec4(pos + next.xyz * uDt, 1.0);
}
`;

export const velocityShader = /* glsl */ `
${SIM_UNIFORMS}
${SIM_FNS}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  if (uMode < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;
  vec3 home = texture2D(uHome, uv).xyz;
  vec3 seam = texture2D(uSeam, uv).xyz;
  vec4 next = swarmVelocity(pos, vel, home, seam);
  gl_FragColor = next;
}
`;

export const displayVertex = /* glsl */ `
uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform sampler2D uHome;
uniform sampler2D uTangent;
uniform sampler2D uShape;
uniform sampler2D uExtra;
uniform sampler2D uOrigin;
uniform vec2 uGrid;
uniform float uShard;
uniform float uGirth;
uniform float uTime;
uniform float uMode;
uniform float uPulse;

varying vec3 vViewN;
varying vec3 vWorldN;
varying vec3 vViewPos;
varying vec3 vWorld;
varying float vRough;
varying float vSeam;
varying float vAo;

void main() {
  float id = float(gl_InstanceID);
  vec2 ij = vec2(mod(id, uGrid.x), floor(id / uGrid.x));
  vec2 uv = (ij + 0.5) / uGrid;

  vec3 pos = texture2D(uPosition, uv).xyz;
  vec3 vel = texture2D(uVelocity, uv).xyz;
  vec3 home = texture2D(uHome, uv).xyz;
  float seam = texture2D(uHome, uv).w;
  vec3 tangent = texture2D(uTangent, uv).xyz;
  float lenAttr = texture2D(uTangent, uv).w;
  vec4 shape = texture2D(uShape, uv);
  vec3 coatN = texture2D(uExtra, uv).xyz;
  float width = texture2D(uExtra, uv).w;
  float thin = texture2D(uOrigin, uv).w;

  float speed = length(vel);
  vec3 T = normalize(tangent);
  vec3 Nsurf = normalize(coatN);
  if (speed > 0.04) {
    T = normalize(mix(T, vel / speed, smoothstep(0.04, 0.75, speed)));
  }
  vec3 B = cross(T, Nsurf);
  if (dot(B, B) < 1e-4) {
    vec3 side = abs(T.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    B = cross(T, side);
  }
  B = normalize(B);
  vec3 Nn = normalize(cross(B, T));
  float twist = shape.y;
  float c = cos(twist);
  float s = sin(twist);
  vec3 X = B * c + Nn * s;
  vec3 Z = -B * s + Nn * c;

  float squeeze = 1.0;
  if (uPulse < 0.25) squeeze = mix(1.0, 0.2, smoothstep(0.0, 0.25, uPulse));
  else if (uPulse < 0.95) squeeze = mix(0.2, 1.0, smoothstep(0.3, 0.95, uPulse));
  if (uMode > 0.5) {
    float breathe = sin(uTime * 0.33 + home.y * 1.6) * 0.012;
    pos += coatN * breathe;
    float wing = shape.z;
    float cycle = fract(uTime * 0.16);
    float settle = smoothstep(0.1, 0.36, cycle) * (1.0 - smoothstep(0.5, 0.86, cycle));
    pos.y -= settle * wing * 0.035;
  }
  float along = position.y + 0.5;
  vec3 local = (X * position.x * width + Z * position.z * thin) * uGirth + T * along * lenAttr * squeeze * uShard;

  vec3 nLocal = normalize(X * normal.x + T * normal.y + Z * normal.z);
  vec4 world = modelMatrix * vec4(pos + local, 1.0);
  vec4 viewPos = viewMatrix * world;
  vWorld = world.xyz;
  vViewPos = viewPos.xyz;
  vWorldN = normalize(mat3(modelMatrix) * nLocal);
  vViewN = normalize(mat3(viewMatrix) * vWorldN);
  vRough = shape.x;
  vSeam = seam;
  vAo = shape.z;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const displayFragment = /* glsl */ `
uniform vec3 uOrange;
uniform vec3 uMineral;
uniform vec3 uSteel;
uniform samplerCube uEnv;

varying vec3 vViewN;
varying vec3 vWorldN;
varying vec3 vViewPos;
varying vec3 vWorld;
varying float vRough;
varying float vSeam;
varying float vAo;

void main() {
  vec3 N = normalize(vViewN);
  vec3 V = normalize(-vViewPos);
  vec3 Nw = normalize(vWorldN);
  vec3 worldV = normalize(cameraPosition - vWorld);
  vec3 keyL = normalize(vec3(-0.42, 0.78, 0.42));
  float ndk = dot(N, keyL);
  float rough = clamp(vRough, 0.0, 1.0);
  float salt = fract(sin(dot(vWorld.xy, vec2(19.13, 47.77))) * 43758.5453);
  vec3 albedo = mix(uSteel, uMineral, 0.28 + salt * 0.62);

  float wrap = clamp(ndk * 0.45 + 0.62, 0.0, 1.0);
  float cavity = smoothstep(0.35, -0.25, ndk) * smoothstep(0.65, 0.08, max(dot(N, V), 0.0));
  vec3 crevice = vec3(0.62, 0.64, 0.66);
  vec3 shade = albedo * mix(0.9, 1.0, wrap);
  shade = mix(shade, shade * crevice, cavity * 0.8);

  vec3 R = reflect(-worldV, Nw);
  vec3 env = textureCube(uEnv, R, mix(0.0, 3.5, rough)).rgb;
  float envLuma = dot(env, vec3(0.2126, 0.7152, 0.0722));
  env = mix(vec3(envLuma), env, 0.22);
  env *= vec3(0.94, 0.97, 1.0);
  env = env / (env + vec3(0.85));

  vec3 H = normalize(keyL + V);
  float spec = pow(max(dot(N, H), 0.0), mix(360.0, 180.0, rough));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 color = shade * mix(vec3(0.82), vec3(1.0), clamp(env, 0.0, 1.0));
  color += env * (0.08 + fres * 0.22);
  color += vec3(1.0) * spec * mix(0.85, 0.45, rough);
  color = min(color, vec3(1.05));

  if (vSeam > 0.5) {
    color = uOrange * (0.82 + 0.18 * clamp(ndk, 0.0, 1.0));
    color += vec3(1.0) * spec * 0.08;
  }
  gl_FragColor = linearToOutputTexel(vec4(color, 1.0));
}
`;

export const backgroundVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const backgroundFragment = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uLift;
uniform vec2 uResolution;
uniform vec2 uCenter;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float d = distance(uv, uCenter);
  float lift = smoothstep(0.52, 0.04, d);
  vec3 col = mix(uInk, uLift, lift);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

export const floorVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const floorFragment = /* glsl */ `
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.35, r) * 0.22;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}
`;
