import type { WebGLRenderer } from "three";
import { SAMPLER_CAP, samplerBudget } from "./shader";

export type SamplerRow = { name: string; samplers: string[]; count: number; linked: boolean };

function samplerTypes(gl: WebGL2RenderingContext) {
  return new Set(
    [
      gl.SAMPLER_2D,
      gl.SAMPLER_3D,
      gl.SAMPLER_CUBE,
      gl.SAMPLER_2D_SHADOW,
      gl.SAMPLER_2D_ARRAY,
      gl.SAMPLER_2D_ARRAY_SHADOW,
      gl.SAMPLER_CUBE_SHADOW,
      gl.INT_SAMPLER_2D,
      gl.INT_SAMPLER_3D,
      gl.INT_SAMPLER_CUBE,
      gl.INT_SAMPLER_2D_ARRAY,
      gl.UNSIGNED_INT_SAMPLER_2D,
      gl.UNSIGNED_INT_SAMPLER_3D,
      gl.UNSIGNED_INT_SAMPLER_CUBE,
      gl.UNSIGNED_INT_SAMPLER_2D_ARRAY,
    ].filter((type) => typeof type === "number") as number[],
  );
}

function readSamplers(gl: WebGL2RenderingContext, program: WebGLProgram, types: Set<number>) {
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  const names: string[] = [];
  let units = 0;
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    if (!info || !types.has(info.type)) continue;
    units += info.size;
    names.push(info.name.replace(/\[0\]$/, ""));
  }
  return { names, units };
}

export function createShaderGuard(renderer: WebGLRenderer) {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const maxUnits = Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));
  const deviceBudget = samplerBudget(maxUnits);
  const budget = Math.min(SAMPLER_CAP, deviceBudget);
  const types = samplerTypes(gl);
  const rows: SamplerRow[] = [];
  const log: string[] = [];
  const seen = new Set<WebGLProgram>();
  let fault: string | null = null;

  const publish = () => {
    const host = window as Window & { __samplerAudit?: unknown; __shaderLog?: string[] };
    host.__shaderLog = log.slice();
    host.__samplerAudit = {
      maxUnits,
      deviceBudget,
      budget,
      cap: SAMPLER_CAP,
      fault,
      programs: rows.map((row) => ({ ...row, samplers: row.samplers.slice() })),
    };
  };

  const fail = (message: string) => {
    log.push(message);
    if (!fault) {
      fault = message;
      console.error(`3D unavailable\n${message}`);
    }
    publish();
  };

  renderer.debug.onShaderError = (_gl, program, vertexShader, fragmentShader) => {
    const text = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader)]
      .map((item) => (item || "").trim())
      .filter(Boolean)
      .join("\n");
    fail(text || "shader failed to link");
  };

  const inspect = () => {
    const programs = (renderer.info.programs || []) as { program: WebGLProgram | null; name?: string }[];
    for (const entry of programs) {
      const program = entry.program;
      if (!program || seen.has(program)) continue;
      seen.add(program);
      let linked = false;
      try {
        linked = Boolean(gl.getProgramParameter(program, gl.LINK_STATUS));
      } catch {
        linked = false;
      }
      const read = linked ? readSamplers(gl, program, types) : { names: [] as string[], units: 0 };
      const row = { name: entry.name || "program", samplers: read.names, count: read.units, linked };
      rows.push(row);
      if (!linked) fail(`${row.name} failed to link\n${gl.getProgramInfoLog(program) || ""}`.trim());
      else if (row.count > budget) {
        fail(`${row.name} uses ${row.count} samplers (${row.samplers.join(", ")}); limit ${budget} (MAX_TEXTURE_IMAGE_UNITS ${maxUnits}, device budget ${deviceBudget})`);
      }
    }
    publish();
    return { fault, maxUnits, budget, programs: rows };
  };

  publish();
  return {
    inspect,
    maxUnits,
    budget,
    get fault() {
      return fault;
    },
  };
}
