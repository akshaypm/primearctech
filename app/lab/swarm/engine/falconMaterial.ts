import * as THREE from "three";

export type FalconUniforms = {
  uTime: { value: number };
  uCursor: { value: THREE.Vector3 };
  uRadius: { value: number };
  uFade: { value: number };
  uOrange: { value: THREE.Color };
};

const FALCON_VERT = /* glsl */ `
float radial = length(transformed.yz);
float wing = smoothstep(0.25, 0.8, radial);
float ang = sin(uTime * 0.5) * 0.012 * wing * sign(transformed.z + 0.0001);
float ca = cos(ang);
float sa = sin(ang);
float y = transformed.y;
float z = transformed.z;
transformed.y = ca * y - sa * z;
transformed.z = sa * y + ca * z;
vFalconWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FALCON_FRAG = /* glsl */ `
vec3 falconSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(0.4166667)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

float falconOrange(vec3 srgb) {
  float mx = max(srgb.r, max(srgb.g, srgb.b));
  float mn = min(srgb.r, min(srgb.g, srgb.b));
  float d = mx - mn;
  if (mx < 0.18 || d <= 0.0001) return 0.0;
  if (d / mx < 0.32) return 0.0;
  float hue;
  if (mx == srgb.r) hue = mod((srgb.g - srgb.b) / d, 6.0);
  else if (mx == srgb.g) hue = (srgb.b - srgb.r) / d + 2.0;
  else hue = (srgb.r - srgb.g) / d + 4.0;
  hue /= 6.0;
  if (hue < 0.0) hue += 1.0;
  return (hue <= 0.12 || hue >= 0.92) ? 1.0 : 0.0;
}
`;

export function createFalconMaterial(map: THREE.Texture | null, envMap: THREE.Texture) {
  const uniforms: FalconUniforms = {
    uTime: { value: 0 },
    uCursor: { value: new THREE.Vector3(80, 80, 80) },
    uRadius: { value: 0 },
    uFade: { value: 0 },
    uOrange: { value: new THREE.Color("#D8643E") },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#E8E8E8"),
    metalness: 1,
    roughness: 0.12,
    map: map ?? undefined,
    envMap,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  });

  material.customProgramCacheKey = () => "falcon-chrome-r3";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCursor = uniforms.uCursor;
    shader.uniforms.uRadius = uniforms.uRadius;
    shader.uniforms.uFade = uniforms.uFade;
    shader.uniforms.uOrange = uniforms.uOrange;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;
varying vec3 vFalconWorld;`,
      )
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${FALCON_VERT}`);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uCursor;
uniform float uRadius;
uniform float uFade;
uniform vec3 uOrange;
varying vec3 vFalconWorld;
${FALCON_FRAG}`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	float falconMask = falconOrange(falconSrgb(sampledDiffuseColor.rgb));
	diffuseColor.rgb = mix(diffuseColor.rgb, uOrange, falconMask);
#endif`,
      )
      .replace(
        "#include <opaque_fragment>",
        `
	if (uRadius > 0.02) {
		float cursorDist = distance(vFalconWorld, uCursor);
		float hole = smoothstep(uRadius, uRadius - 0.02, cursorDist);
		if (hole > 0.72) discard;
		float front = smoothstep(uRadius + 0.045, uRadius, cursorDist) * (1.0 - hole);
		outgoingLight = mix(outgoingLight, uOrange, front * 0.92);
	}
	if (uFade < 0.999) {
		float dither = fract(sin(dot(vFalconWorld.xy, vec2(12.9898, 78.233))) * 43758.5453);
		if (dither > uFade) discard;
	}
	#include <opaque_fragment>`,
      );
  };

  return { material, uniforms };
}

export function createBladeMaterial(envMap: THREE.Texture) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#E8E8E8"),
    metalness: 1,
    roughness: 0.1,
    envMap,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  });
}
