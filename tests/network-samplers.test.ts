import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { chromium } from "@playwright/test";
import {
  BUILTIN_FRAGMENT_SAMPLERS,
  SAMPLER_CAP,
  SURFACE_SAMPLERS_BEFORE,
  applyDefines,
  featuresFromMaterial,
  fragmentShader,
  fragmentShaderMobile,
  materialDefines,
  samplerBudget,
  samplerNames,
  skyFragmentShader,
  vertexShader,
} from "../app/lab/network/engine/shader";

type Mat = { name?: string; extras?: { dynamic?: boolean; loss?: unknown; aoMap?: unknown; rideLightMap?: unknown } };

function materials(dir: string) {
  const rows: { scene: string; material: string; features: ReturnType<typeof featuresFromMaterial> }[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith("-baked.glb"))) {
    const buf = readFileSync(`${dir}/${file}`);
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString()) as { materials?: Mat[] };
    const scene = file.replace("-baked.glb", "");
    for (const def of json.materials || []) {
      rows.push({ scene, material: def.name || "?", features: featuresFromMaterial(scene, def, false) });
    }
  }
  return rows;
}

function same(a: string[], b: string[]) {
  return [...a].sort().join(",") === [...b].sort().join(",");
}

describe("network fragment sampler budget", () => {
  const rows = materials("public/network/ktx");

  it("keeps the pre-fix program at 17 samplers", () => {
    assert.equal(SURFACE_SAMPLERS_BEFORE.length, 17);
    assert.equal(samplerBudget(16), 12);
    assert.equal(samplerBudget(32), 16);
    assert.equal(samplerBudget(8), 4);
  });

  it("strips inactive sampler declarations", () => {
    const kept = applyDefines("#ifdef HAS_RIDE\nuniform sampler2D rideLm;\n#else\nuniform sampler2D lightMap;\n#endif\n", { HAS_RIDE: 1 });
    assert.deepEqual(samplerNames(kept), ["rideLm"]);
    assert.deepEqual(samplerNames(fragmentShader, {}), ["map", "normalMap", "ormMap", "lightMap", "lmAux"]);
  });

  it("fits every shipped material under the 16-unit budget", () => {
    const union = new Set<string>();
    let worst = 0;
    for (const row of rows) {
      for (const source of [fragmentShader, fragmentShaderMobile]) {
        const names = samplerNames(source, materialDefines(row.features));
        const limit16 = Math.min(SAMPLER_CAP, samplerBudget(16));
        const limit32 = Math.min(SAMPLER_CAP, samplerBudget(32));
        assert.ok(names.length <= limit16 && names.length <= limit32, `${row.scene}/${row.material} uses ${names.length}: ${names.join(" ")}`);
        for (const name of names) union.add(name);
        worst = Math.max(worst, names.length);
      }
    }
    assert.ok(worst <= SAMPLER_CAP);
    assert.ok(same([...union], [...SURFACE_SAMPLERS_BEFORE]), `missing ${SURFACE_SAMPLERS_BEFORE.filter((name) => !union.has(name)).join(" ")}`);
    assert.equal(samplerNames(vertexShader).length, 0);
    assert.equal(samplerNames(skyFragmentShader).length, 0);
    assert.deepEqual(
      BUILTIN_FRAGMENT_SAMPLERS.map((item) => item.samplers.length),
      [0, 0, 0, 1],
    );
  });

  it("keeps the heavy programs on their own maps", () => {
    const by = (scene: string, material: string) => rows.find((row) => row.scene === scene && row.material === material);
    const ride = by("layers", "BoneGlaze__layers_dyn");
    const loss = by("attn", "ground__ground_attn");
    const kiln = by("signal", "KilnClay__signal_dyn");
    assert.ok(ride && loss && kiln);
    assert.ok(
      same(samplerNames(fragmentShader, materialDefines(ride.features)), [
        "map",
        "normalMap",
        "ormMap",
        "lmAux",
        "rideLm",
        "rideGlow",
        "rideAux",
        "nearN",
        "nearO",
        "nearA",
        "shMap",
      ]),
    );
    assert.ok(
      same(samplerNames(fragmentShader, materialDefines(loss.features)), [
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
      ]),
    );
    assert.deepEqual(samplerNames(fragmentShader, materialDefines(kiln.features)), ["map", "normalMap", "ormMap"]);
  });

  it("compiles every surface program on a real GL", async () => {
    const chrome = "/usr/bin/google-chrome";
    if (!existsSync(chrome)) return;
    const jobs = new Map<string, { defines: Record<string, number>; mobile: boolean }>();
    for (const row of rows) {
      const defines = materialDefines(row.features);
      jobs.set(`desktop:${JSON.stringify(defines)}`, { defines, mobile: false });
      jobs.set(`mobile:${JSON.stringify(defines)}`, { defines, mobile: true });
    }
    const browser = await chromium.launch({
      executablePath: chrome,
      headless: true,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
    });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, attrs?: unknown) => WebGL2RenderingContext | null;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, attrs?: CanvasRenderingContext2DSettings) {
        const gl = orig.call(this, type, attrs);
        if (gl && String(type) === "webgl2") {
          const getParameter = gl.getParameter.bind(gl);
          gl.getParameter = ((pname: number) => (pname === 0x8872 ? 16 : getParameter(pname))) as WebGL2RenderingContext["getParameter"];
        }
        return gl;
      } as HTMLCanvasElement["getContext"];
    });
    await page.goto("about:blank");
    const programs = [...jobs.values()].map((job) => {
      const source = job.mobile ? fragmentShaderMobile : fragmentShader;
      return {
        defines: job.defines,
        expected: samplerNames(source, job.defines).length,
        fragment: source.replace("#include <colorspace_fragment>", "gl_FragColor = linearToOutputTexel(gl_FragColor);"),
      };
    });
    const result = await page.evaluate(
      ({ vertex, programs: list }) => {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        if (!gl) return { ok: false, error: "no webgl2", rows: [] as { count: number; linked: boolean; log: string; source: number }[] };
        const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;
        const types = new Set<number>([gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_3D, gl.SAMPLER_2D_SHADOW]);
        const compile = (defines: Record<string, number>, fragment: string) => {
          const defs = Object.entries(defines)
            .filter(([, value]) => value)
            .map(([key]) => `#define ${key} 1`)
            .join("\n");
          const vs = `#version 300 es
#define attribute in
#define varying out
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec3 normal;
in vec2 uv;
${defs}
${vertex}`;
          const fs = `#version 300 es
#define varying in
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define texture2D texture
precision highp float;
precision highp int;
precision highp sampler2D;
uniform vec3 cameraPosition;
vec4 linearToOutputTexel(vec4 value) { return value; }
${defs}
${fragment}`;
          const program = gl.createProgram();
          const make = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader || !program) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            gl.attachShader(program, shader);
            return shader;
          };
          const vert = make(gl.VERTEX_SHADER, vs);
          const frag = make(gl.FRAGMENT_SHADER, fs);
          if (!program || !vert || !frag) return { linked: false, log: "alloc", count: 99, source: 99 };
          gl.linkProgram(program);
          const linked = Boolean(gl.getProgramParameter(program, gl.LINK_STATUS));
          const log = [gl.getShaderInfoLog(vert), gl.getShaderInfoLog(frag), gl.getProgramInfoLog(program)].join("\n");
          let count = 0;
          if (linked) {
            const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
            for (let i = 0; i < n; i += 1) {
              const info = gl.getActiveUniform(program, i);
              if (info && types.has(info.type)) count += info.size;
            }
          }
          return { linked, log, count };
        };
        return { ok: true, maxUnits, rows: list.map((item) => ({ ...compile(item.defines, item.fragment), expected: item.expected })) };
      },
      { vertex: vertexShader, programs },
    );
    await browser.close();
    assert.equal(result.ok, true, "error" in result ? result.error : "");
    assert.equal(result.maxUnits, 16);
    for (const row of result.rows) {
      assert.equal(row.linked, true, row.log);
      assert.equal(row.count, row.expected, row.log);
      assert.ok(row.count <= Math.min(SAMPLER_CAP, samplerBudget(result.maxUnits)), `${row.count} samplers\n${row.log}`);
    }
  }, 120000);
});
