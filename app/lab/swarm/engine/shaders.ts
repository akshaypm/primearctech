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
