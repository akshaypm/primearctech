export type RenderMode = "live" | "static-3d" | "still";

let webglCached: boolean | null = null;

export function webglAvailable() {
  if (webglCached !== null) return webglCached;
  try {
    const test = document.createElement("canvas");
    const gl = test.getContext("webgl2") || test.getContext("webgl");
    webglCached = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglCached = false;
  }
  return webglCached;
}

export function decideRender(): { mode: RenderMode; reason: string } {
  if (!webglAvailable()) return { mode: "still", reason: "webgl-unavailable" };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { mode: "static-3d", reason: "prefers-reduced-motion" };
  }
  return { mode: "live", reason: "webgl" };
}

/** The hall camera is live WebGL only. Reduced motion and very small devices keep the section stills. */
export function journeyAllowed() {
  if (decideRender().mode !== "live") return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return false;
  if (nav.connection?.saveData) return false;
  return true;
}
