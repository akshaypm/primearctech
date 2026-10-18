export type TextSide = "left" | "right";

export type JourneyStation = {
  id: string;
  eyebrow: string;
  lines: string[];
  /** Safe column for the headline. The subject is framed in the other two thirds. */
  side: TextSide;
};

export const STATIONS: JourneyStation[] = [
  {
    id: "hero",
    eyebrow: "Senior-engineer AI studio · US & UK",
    lines: ["AI features,", "from demo to production."],
    side: "left",
  },
  {
    id: "demo",
    eyebrow: "02 — Demo to production",
    lines: ["The demo worked.", "Production is a different machine."],
    side: "right",
  },
  {
    id: "engagements",
    eyebrow: "03 — Engagements",
    lines: ["Three ways in.", "One standard of finish."],
    side: "left",
  },
  {
    id: "how",
    eyebrow: "04 — How we work",
    lines: ["Engineers on the call.", "Engineers on the code."],
    side: "right",
  },
  {
    id: "proof",
    eyebrow: "05 — Engineering depth",
    lines: ["Engineering you", "can inspect."],
    side: "left",
  },
  {
    id: "products",
    eyebrow: "06 — Products lab",
    lines: ["When the same problem", "shows up three times,", "we build it once."],
    side: "right",
  },
  {
    id: "partners",
    eyebrow: "07 — For agencies and IT firms",
    lines: ["Built under", "your name."],
    side: "left",
  },
  {
    id: "fit",
    eyebrow: "09 — Fit",
    lines: ["We work to a tolerance.", "So should a client list."],
    side: "right",
  },
  {
    id: "book",
    eyebrow: "10 — Book a call",
    lines: ["Talk to an engineer,", "not a salesperson."],
    side: "left",
  },
];

const HOLD = 2.7;
const TRAVEL = 3.15;
const BOOK = 6.6;

type Span = {
  t0: number;
  t1: number;
  kind: "hold" | "travel";
  station: number;
};

function buildSpans() {
  const raw: { dur: number; kind: Span["kind"]; station: number }[] = [];
  for (let index = 0; index < STATIONS.length; index += 1) {
    raw.push({ dur: index === STATIONS.length - 1 ? BOOK : HOLD, kind: "hold", station: index });
    if (index < STATIONS.length - 1) raw.push({ dur: TRAVEL, kind: "travel", station: index });
  }
  const total = raw.reduce((sum, item) => sum + item.dur, 0);
  let cursor = 0;
  const spans: Span[] = raw.map((item) => {
    const span = { t0: cursor / total, t1: (cursor + item.dur) / total, kind: item.kind, station: item.station };
    cursor += item.dur;
    return span;
  });
  return { spans, total };
}

const BUILT = buildSpans();
export const SPANS = BUILT.spans;
export const JOURNEY_SECONDS = BUILT.total;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number) {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

export function locate(progress: number) {
  const t = clamp01(progress);
  const span = SPANS.find((item) => t >= item.t0 && t <= item.t1 + 1e-6) ?? SPANS[SPANS.length - 1];
  const local = (t - span.t0) / Math.max(1e-6, span.t1 - span.t0);
  return { span, local: clamp01(local) };
}

/** Camera blend. Holds stay put. Travels ease from one station to the next. */
export function cameraBlend(progress: number) {
  const { span, local } = locate(progress);
  if (span.kind === "hold") return { from: span.station, to: span.station, t: 0, travel: false };
  return { from: span.station, to: span.station + 1, t: smooth(local), travel: true };
}

/** Headline opacity. It is gone before a travel starts, and the close does not fade out. */
export function textOpacity(progress: number) {
  const { span, local } = locate(progress);
  if (span.kind !== "hold") return { index: span.station, opacity: 0 };
  if (span.station === STATIONS.length - 1) {
    return { index: span.station, opacity: local < 0.1 ? smooth(local / 0.1) : 1 };
  }
  if (span.station === 0 && local < 0.14) return { index: 0, opacity: 1 };
  let opacity = 1;
  if (local < 0.16) opacity = smooth(local / 0.16);
  else if (local > 0.74) opacity = 1 - smooth((local - 0.74) / 0.26);
  return { index: span.station, opacity };
}

/** Warmth grows from the end of the hall across about five seconds, finishing on the closing arch. */
export function journeyWarm(progress: number) {
  const approach = SPANS.find((span) => span.kind === "travel" && span.station === STATIONS.length - 2);
  const start = approach?.t0 ?? 0.86;
  const duration = 5.2 / JOURNEY_SECONDS;
  return smooth((progress - start) / duration);
}

export function copyInk(progress: number) {
  const text = textOpacity(progress);
  if (text.opacity > 0.04 && text.index === STATIONS.length - 1) return true;
  return journeyWarm(progress) > 0.55;
}

export type JourneyMark = { id: string; kind: "station" | "transit"; progress: number };

export function journeyMarks(): JourneyMark[] {
  const stations: JourneyMark[] = SPANS.filter((span) => span.kind === "hold").map((span) => ({
    id: STATIONS[span.station]?.id ?? "station",
    kind: "station",
    progress: (span.t0 + span.t1) / 2,
  }));
  const transits: JourneyMark[] = SPANS.filter((span) => span.kind === "travel").map((span) => ({
    id: `${STATIONS[span.station]?.id ?? "a"}-to-${STATIONS[span.station + 1]?.id ?? "b"}`,
    kind: "transit",
    progress: span.t0 + (span.t1 - span.t0) * 0.42,
  }));
  return [...stations, ...transits];
}
