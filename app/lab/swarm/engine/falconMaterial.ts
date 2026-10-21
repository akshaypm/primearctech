import * as THREE from "three";
import { ORANGE_SAT, ORANGE_VALUE } from "./creature";

export type FalconUniforms = {
  uTime: { value: number };
  uCursor: { value: THREE.Vector3 };
  uRadius: { value: number };
  uFade: { value: number };
  uWave: { value: number };
  uBeak: { value: number };
  uTail: { value: number };
  uOrange: { value: THREE.Color };
  uFront: { value: number };
  uPeel: { value: number };
  uBoxMin: { value: THREE.Vector3 };
  uBoxMax: { value: THREE.Vector3 };
  uBladeGrid: { value: THREE.Texture };
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
vFalconLocal = transformed;
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
  if (mx < ${ORANGE_VALUE.toFixed(2)} || d <= 0.0001) return 0.0;
  if (d / mx < ${ORANGE_SAT.toFixed(2)}) return 0.0;
  float hue;
  if (mx == srgb.r) hue = mod((srgb.g - srgb.b) / d, 6.0);
  else if (mx == srgb.g) hue = (srgb.b - srgb.r) / d + 2.0;
  else hue = (srgb.r - srgb.g) / d + 4.0;
  hue /= 6.0;
  if (hue < 0.0) hue += 1.0;
  return (hue <= 0.12 || hue >= 0.92) ? 1.0 : 0.0;
}
`;

const CHROME = {
  color: new THREE.Color("#E8E8E8"),
  metalness: 1,
  roughness: 0.08,
  envMapIntensity: 1,
};

export function createFalconMaterial(map: THREE.Texture | null, envMap: THREE.Texture, peelMap: THREE.Texture) {
  const uniforms: FalconUniforms = {
    uTime: { value: 0 },
    uCursor: { value: new THREE.Vector3(80, 80, 80) },
    uRadius: { value: 0 },
    uFade: { value: 0 },
    uWave: { value: 100 },
    uBeak: { value: -1 },
    uTail: { value: 1 },
    uOrange: { value: new THREE.Color("#D8643E") },
    uFront: { value: 0 },
    uPeel: { value: 0 },
    uBoxMin: { value: new THREE.Vector3(-1, -1, -1) },
    uBoxMax: { value: new THREE.Vector3(1, 1, 1) },
    uBladeGrid: { value: peelMap },
  };

  // Standard, not physical. The physical clearcoat permutation (clearcoat 1,
  // clearcoatRoughness 0.05) drops this mesh to a few frames a second on the
  // software renderer. The coat is the Schlick fresnel below, same roughness.
  const material = new THREE.MeshStandardMaterial({
    color: CHROME.color.clone(),
    metalness: CHROME.metalness,
    roughness: CHROME.roughness,
    envMapIntensity: CHROME.envMapIntensity,
    map: map ?? undefined,
    envMap,
    side: THREE.DoubleSide,
  });

  material.customProgramCacheKey = () => "falcon-chrome-r6";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCursor = uniforms.uCursor;
    shader.uniforms.uRadius = uniforms.uRadius;
    shader.uniforms.uFade = uniforms.uFade;
    shader.uniforms.uWave = uniforms.uWave;
    shader.uniforms.uBeak = uniforms.uBeak;
    shader.uniforms.uTail = uniforms.uTail;
    shader.uniforms.uOrange = uniforms.uOrange;
    shader.uniforms.uFront = uniforms.uFront;
    shader.uniforms.uPeel = uniforms.uPeel;
    shader.uniforms.uBoxMin = uniforms.uBoxMin;
    shader.uniforms.uBoxMax = uniforms.uBoxMax;
    shader.uniforms.uBladeGrid = uniforms.uBladeGrid;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;
varying vec3 vFalconWorld;
varying vec3 vFalconLocal;`,
      )
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${FALCON_VERT}`);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uCursor;
uniform float uRadius;
uniform float uFade;
uniform float uWave;
uniform float uBeak;
uniform float uTail;
uniform vec3 uOrange;
uniform float uFront;
uniform float uPeel;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform sampler3D uBladeGrid;
varying vec3 vFalconWorld;
varying vec3 vFalconLocal;
float falconMask;
${FALCON_FRAG}`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	float painted = falconOrange(falconSrgb(sampledDiffuseColor.rgb));
	float span = length(vFalconLocal.yz);
	float wingspan = 2.814;
	// Half-width. The hot line is this wide on each side of the leading edge,
	// so the whole stroke is 1.5% of the wingspan.
	float band = wingspan * 0.0075;
	float t = clamp((span - 0.40) / 0.95, 0.0, 1.0);
	float lead = mix(-0.52, -0.1, smoothstep(0.0, 1.0, t));
	float wing = smoothstep(0.32, 0.48, span) * smoothstep(0.16, 0.34, vFalconLocal.y);
	float rim = wing * (1.0 - smoothstep(0.0, band, abs(vFalconLocal.x - lead)));
	float rearLead = -0.08 - 0.62 * vFalconLocal.x;
	float rear = smoothstep(0.08, 0.28, vFalconLocal.x) * step(vFalconLocal.y, -0.05);
	float rearRim = rear * (1.0 - smoothstep(0.05, 0.28, abs(vFalconLocal.z))) * (1.0 - smoothstep(0.0, band, abs(vFalconLocal.y - rearLead)));
	// Both eyes, measured on the desktop and mobile meshes. A mask texel
	// does not survive the 390 raster; the disc does. About 1.3% of the
	// wingspan across, so it stays a dot.
	float eyeA = 1.0 - smoothstep(0.006, 0.018, length(vFalconLocal - vec3(-0.807, -0.207, 0.077)));
	float eyeB = 1.0 - smoothstep(0.006, 0.018, length(vFalconLocal - vec3(-0.809, -0.205, -0.076)));
	float eye = max(eyeA, eyeB);
	eye = max(eye, painted * eye);
	falconMask = max(max(rim, rearRim), eye);
	diffuseColor.rgb = mix(diffuseColor.rgb, uOrange, falconMask);
#endif`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
	roughnessFactor = mix(roughnessFactor, 0.30, falconMask);`,
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
	metalnessFactor = mix(metalnessFactor, 0.0, falconMask);`,
      )
      .replace(
        "#include <opaque_fragment>",
        `
	float coatNdV = clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
	outgoingLight += vec3(0.42) * pow(1.0 - coatNdV, 5.0) * (1.0 - falconMask);
	outgoingLight += uOrange * falconMask * 1.15;
	if (uWave < 50.0) {
		float along = clamp((vFalconLocal.x - uBeak) / max(0.0001, uTail - uBeak), 0.0, 1.0);
		float arrival = along * 0.48 + 0.42;
		if (uWave < arrival) discard;
	}
	if (uRadius > 0.02) {
		float cursorDist = distance(vFalconWorld, uCursor);
		float hole = smoothstep(uRadius, uRadius - 0.02, cursorDist);
		if (hole > 0.72) discard;
		// Hole falls across 0.02 world units. 0.12 of that parameter is
		// about 2px at the hero framing. Emissive only, and uFront dies
		// over 150ms once the front stops, so it cannot sit as a band.
		float hair = 1.0 - smoothstep(0.0, 0.12, abs(hole - 0.72));
		outgoingLight += uOrange * hair * uFront * 1.15;
	}
	if (uFade < 0.999) {
		float dither = fract(sin(dot(vFalconWorld.xy, vec2(12.9898, 78.233))) * 43758.5453);
		if (dither > uFade) discard;
	}
	if (uPeel > 0.5) {
		vec3 uvw = (vFalconLocal - uBoxMin) / max(uBoxMax - uBoxMin, vec3(0.0001));
		if (texture(uBladeGrid, clamp(uvw, 0.0, 1.0)).r > 0.5) discard;
	}
	#include <opaque_fragment>`,
      );
  };

  return { material, uniforms };
}

export function createBladeMaterial(envMap: THREE.Texture) {
  // Same chrome and env as the body. Standard, not physical: a clearcoat
  // permutation on thousands of blades stalls the software renderer.
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#E8E8E8"),
    metalness: 1,
    roughness: 0.06,
    envMap,
    envMapIntensity: 1.2,
    side: THREE.DoubleSide,
  });
}
