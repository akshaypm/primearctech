"use client";

import { SystemField } from "./SystemField";

/**
 * Fixed, full-viewport immersive backdrop shared across the primary site.
 * Layers: the live 3D system map, a readability veil, and a vignette. The 3D
 * canvas mounts client-side only; the veil/vignette render immediately so the
 * page never flashes bare before WebGL initializes.
 */
export function SiteBackground({ intensity = 1 }: { intensity?: number }) {
  return (
    <div className="site-bg" aria-hidden="true">
      <SystemField intensity={intensity} className="site-bg-canvas" />
      <div className="site-bg-veil" />
      <div className="site-bg-vignette" />
    </div>
  );
}
