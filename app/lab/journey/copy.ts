export type JourneyStation = {
  id: string;
  eyebrow: string;
  lines: string[];
};

/** Existing homepage eyebrows and headlines, in journey order. Team stays a photo section, so it is not a station. */
export const STATIONS: JourneyStation[] = [
  {
    id: "hero",
    eyebrow: "Senior-engineer AI studio · US & UK",
    lines: ["AI features,", "from demo to production."],
  },
  {
    id: "demo",
    eyebrow: "02 — Demo to production",
    lines: ["The demo worked.", "Production is a different machine."],
  },
  {
    id: "engagements",
    eyebrow: "03 — Engagements",
    lines: ["Three ways in.", "One standard of finish."],
  },
  {
    id: "how",
    eyebrow: "04 — How we work",
    lines: ["Engineers on the call.", "Engineers on the code."],
  },
  {
    id: "proof",
    eyebrow: "05 — Engineering depth",
    lines: ["Engineering you", "can inspect."],
  },
  {
    id: "products",
    eyebrow: "06 — Products lab",
    lines: ["When the same problem", "shows up three times,", "we build it once."],
  },
  {
    id: "partners",
    eyebrow: "07 — For agencies and IT firms",
    lines: ["Built under", "your name."],
  },
  {
    id: "fit",
    eyebrow: "09 — Fit",
    lines: ["We work to a tolerance.", "So should a client list."],
  },
  {
    id: "book",
    eyebrow: "10 — Book a call",
    lines: ["Talk to an engineer,", "not a salesperson."],
  },
];

/** 0 in the dark hall, 1 when the close has warmed to bone. */
export function journeyWarm(progress: number) {
  const x = Math.min(1, Math.max(0, (progress - 0.8) / 0.14));
  return x * x * (3 - 2 * x);
}

export function copyInk(progress: number) {
  return journeyWarm(progress) > 0.45;
}
