export type StationId = "hero" | "demo";
export type SpanKind = "hold" | "travel";

export type JourneySpan = {
  kind: SpanKind;
  station: StationId;
  t0: number;
  t1: number;
};

/** Hero rest, one travel, demo arrival. Progress is the scroll fraction across that range. */
export const SPANS: JourneySpan[] = [
  { kind: "hold", station: "hero", t0: 0, t1: 0.16 },
  { kind: "travel", station: "hero", t0: 0.16, t1: 0.62 },
  { kind: "hold", station: "demo", t0: 0.62, t1: 1 },
];

export const JOURNEY_SECONDS = 8;

export type JourneyMark = { id: string; kind: "station" | "transit"; progress: number };

export const MARKS: JourneyMark[] = [
  { id: "hero", kind: "station", progress: 0 },
  { id: "hero-to-demo", kind: "transit", progress: 0.39 },
  { id: "demo", kind: "station", progress: 0.82 },
];

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** Quintic in-out. Zero slope at both ends, so a hold does not kick into the travel. */
export function easeTravel(value: number) {
  const t = clamp01(value);
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - (-2 * t + 2) ** 5 / 2;
}

export function locate(progress: number) {
  const t = clamp01(progress);
  const span = SPANS.find((item) => t >= item.t0 && t <= item.t1 + 1e-6) ?? SPANS[SPANS.length - 1];
  const local = (t - span.t0) / Math.max(1e-6, span.t1 - span.t0);
  return { span, local: clamp01(local) };
}

export function cameraBlend(progress: number) {
  const { span, local } = locate(progress);
  if (span.kind === "hold") {
    return { from: span.station, to: span.station, u: span.station === "demo" ? 1 : 0, travel: false };
  }
  return { from: "hero" as const, to: "demo" as const, u: easeTravel(local), travel: true };
}

/** Hero type leaves before the dolly. Demo type arrives with the hold. */
export function textReveal(progress: number) {
  const { span, local } = locate(progress);
  if (span.kind === "travel") return { hero: 0, demo: 0, shift: 1 };
  if (span.station === "hero") {
    const fade = local > 0.72 ? 1 - easeTravel((local - 0.72) / 0.28) : 1;
    return { hero: fade, demo: 0, shift: 0 };
  }
  const rise = local < 0.34 ? easeTravel(local / 0.34) : 1;
  return { hero: 0, demo: rise, shift: 1 - rise };
}

/** A slow drift on the demo hold only. The hero rest pose does not move. */
export function holdDrift(timeMs: number, station: StationId, travel: boolean) {
  if (travel || station !== "demo") return { x: 0, y: 0, z: 0 };
  return {
    x: Math.sin(timeMs * 0.00037) * 0.018,
    y: Math.sin(timeMs * 0.00051 + 1.2) * 0.01,
    z: Math.sin(timeMs * 0.00029 + 0.4) * 0.012,
  };
}
