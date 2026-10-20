export type JourneyChapter = "input" | "assembly" | "operation";

export type ChapterBounds = {
  id: JourneyChapter;
  start: number;
  end: number;
};

export type JourneyState = {
  chapter: JourneyChapter;
  progress: number;
};

export type LayoutMode = "desktop" | "tablet" | "mobile" | "short";

export type SceneTier = "desktop" | "mobile";

export type RenderPolicy = "animated" | "static" | "poster";

export type JourneyTimeline = {
  /** 0 at the hero rest, 1 at the closed operation pose. */
  t: number;
  /** 0 closed, 1 fully split. */
  open: number;
  /** 0 floating, 1 standing in the passage, 2 aligned under the closed arch. */
  plate: number;
  /** 0..1 floor inlay. */
  floorPath: number;
  /** 0..1 output tile and review branch. */
  output: number;
  /** 0..1 camera inside the passage. */
  fly: number;
};

const CHAPTER_INDEX: Record<JourneyChapter, number> = {
  input: 0,
  assembly: 1,
  operation: 2,
};

export function resolveJourneyState(scrollY: number, bounds: readonly ChapterBounds[]): JourneyState {
  const usable = bounds.filter((span) => span.end > span.start);
  if (usable.length === 0) return { chapter: "input", progress: 0 };

  const ordered = [...usable].sort((a, b) => a.start - b.start || a.end - b.end);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (scrollY <= first.start) return { chapter: first.id, progress: 0 };
  if (scrollY >= last.end) return { chapter: last.id, progress: 1 };

  let chosen: ChapterBounds | null = null;
  for (const span of ordered) {
    if (scrollY >= span.start && scrollY <= span.end) chosen = span;
  }
  if (!chosen) {
    const upcoming = ordered.find((span) => span.start > scrollY);
    if (upcoming) return { chapter: upcoming.id, progress: 0 };
    return { chapter: last.id, progress: 1 };
  }
  return {
    chapter: chosen.id,
    progress: (scrollY - chosen.start) / (chosen.end - chosen.start),
  };
}

export function resolveLayout(width: number, height: number): LayoutMode {
  if (height < 650) return "short";
  if (width >= 1200) return "desktop";
  if (width >= 768) return "tablet";
  return "mobile";
}

export function chooseRenderPolicy(input: {
  reducedMotion: boolean;
  saveData: boolean;
  webglAvailable: boolean;
}): RenderPolicy {
  if (input.saveData || !input.webglAvailable) return "poster";
  if (input.reducedMotion) return "static";
  return "animated";
}

export function capDpr(dpr: number, tier: SceneTier): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(dpr, tier === "desktop" ? 1.5 : 1.25);
}

export function sceneTierFor(layout: LayoutMode): SceneTier {
  return layout === "desktop" ? "desktop" : "mobile";
}

/** Hermite smoothstep. A pure function of position, so scrubbing backwards retraces it. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (x <= edge0) return 0;
  if (x >= edge1) return 1;
  const t = (x - edge0) / (edge1 - edge0);
  return t * t * (3 - 2 * t);
}

export function journeyTimeline(state: JourneyState): JourneyTimeline {
  const t = (CHAPTER_INDEX[state.chapter] + clamp01(state.progress)) / 3;
  const open = smoothstep(0.16, 0.42, t) * (1 - smoothstep(0.74, 0.96, t));
  const plate = smoothstep(0.08, 0.4, t) + smoothstep(0.72, 0.94, t);
  return {
    t,
    open,
    plate,
    floorPath: smoothstep(0.2, 0.42, t),
    output: smoothstep(0.78, 0.96, t),
    fly: smoothstep(0.42, 0.56, t) * (1 - smoothstep(0.7, 0.86, t)),
  };
}

/** Reduced motion holds a still pose for the chapter instead of scrubbing the camera. */
export function staticPose(chapter: JourneyChapter): JourneyState {
  if (chapter === "input") return { chapter, progress: 0 };
  if (chapter === "assembly") return { chapter, progress: 0.2 };
  return { chapter, progress: 1 };
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
