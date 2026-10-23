/** Beats follow camera-path-stack.json. Copy that is not in SITE-DESIGN.md is marked placeholder. */

export type BeatId = "loader" | "hero" | "input" | "layers" | "attention" | "loss" | "embedding" | "book";

export type Beat = {
  id: BeatId;
  t0: number;
  t1: number;
  hold: number;
  kicker: string;
  title: string;
  body?: string;
  h1?: boolean;
  placeholder?: boolean;
  side: "left" | "right";
};

export const BEATS: Beat[] = [
  { id: "loader", t0: 0, t1: 3.5, hold: 2, kicker: "00 — Boot", title: "initialising layer 1/4…", side: "left" },
  {
    id: "hero",
    t0: 3.5,
    t1: 10.5,
    hold: 8,
    kicker: "01 — The network",
    title: "We build AI systems that complete real work.",
    h1: true,
    side: "left",
  },
  {
    id: "input",
    t0: 10.5,
    t1: 19.5,
    hold: 15,
    kicker: "02 — Input",
    title: "Your team's work arrives messy.",
    placeholder: true,
    side: "left",
  },
  {
    id: "layers",
    t0: 19.5,
    t1: 30,
    hold: 24,
    kicker: "03 — Layers",
    title: "Four layers. One signal through every one of them.",
    body: "Audit, design, build, run: every engagement passes through the same stack.",
    placeholder: true,
    side: "right",
  },
  {
    id: "attention",
    t0: 30,
    t1: 39,
    hold: 34,
    kicker: "04 — Outputs",
    title: "FieldRelay, Counter and Roster.",
    body: "Scroll focuses each one. Click dives into the room.",
    placeholder: true,
    side: "right",
  },
  {
    id: "loss",
    t0: 39,
    t1: 48,
    hold: 44,
    kicker: "05 — Loss",
    title: "Loss is the error a model drives down.",
    side: "left",
  },
  {
    id: "embedding",
    t0: 48,
    t1: 56,
    hold: 52,
    kicker: "06 — Partners",
    title: "Your brand on the front, our network underneath.",
    side: "left",
  },
  {
    id: "book",
    t0: 56,
    t1: 61.5,
    hold: 60,
    kicker: "07 — Book",
    title: "We build AI systems that complete real work.",
    h1: true,
    side: "left",
  },
];

export function beatAt(t: number): Beat {
  return BEATS.find((b) => t >= b.t0 && t < b.t1) ?? BEATS[BEATS.length - 1];
}

/** Outgoing copy slides up and fades over 300ms, and is gone at the boundary. The next beat fades in after that. */
export function copyMotion(t: number): { beat: Beat; opacity: number; y: number } {
  const beat = beatAt(t);
  const into = Math.min(1, Math.max(0, (t - beat.t0) / 0.3));
  const out = Math.min(1, Math.max(0, (beat.t1 - t) / 0.3));
  const opacity = Math.min(into, out);
  const y = t - beat.t0 < 0.3 ? (1 - into) * 24 : -(1 - out) * 24;
  return { beat, opacity, y };
}

export const LAYER_CALLOUTS = [
  { id: "audit", node: "LAYERS_blk0_box", index: "01", label: "Audit" },
  { id: "design", node: "LAYERS_blk1_box", index: "02", label: "Design" },
  { id: "build", node: "LAYERS_blk2_box", index: "03", label: "Build" },
  { id: "run", node: "LAYERS_blk3_box", index: "04", label: "Run" },
] as const;

export const PRODUCTS = [
  {
    id: "fieldrelay",
    node: "ATTN_chain",
    anchors: ["ATTN_relaybead0.5", "ATTN_out1"],
    name: "FieldRelay",
    href: "/fieldrelay",
    line: "The lattice reforms into a relay chain, field to office.",
  },
  {
    id: "counter",
    node: "ATTN_coil",
    anchors: ["ATTN_out2"],
    name: "Counter",
    href: "/build-brief",
    line: "A stacked counting column.",
  },
  {
    id: "roster",
    node: "ATTN_tile22",
    anchors: ["ATTN_tile53", "ATTN_out1"],
    name: "Roster",
    href: "/build-brief",
    line: "A grid of scheduled slots.",
  },
] as const;

/** Attention 30–39s is three scroll focuses: FieldRelay, Counter, Roster. */
export function productFocus(t: number): (typeof PRODUCTS)[number]["id"] | null {
  if (t < 30 || t >= 39) return null;
  const index = Math.min(PRODUCTS.length - 1, Math.floor((t - 30) / 3));
  return PRODUCTS[index].id;
}

export function beatScenes(id: BeatId): string[] {
  switch (id) {
    case "loader":
      return ["loader", "hero"];
    case "hero":
      return ["hero", "input"];
    case "input":
      return ["input", "hero", "layers"];
    case "layers":
      return ["layers", "input", "attn"];
    case "attention":
      return ["attn", "layers", "loss"];
    case "loss":
      return ["loss", "attn", "emb"];
    case "embedding":
      return ["emb", "loss", "hero"];
    case "book":
      return ["hero", "emb"];
  }
}

export function nextScene(id: BeatId): string | null {
  switch (id) {
    case "hero":
      return "input";
    case "input":
      return "layers";
    case "layers":
      return "attn";
    case "attention":
      return "loss";
    case "loss":
      return "emb";
    default:
      return null;
  }
}

export type CopyBias = "start" | "end" | "bottom";

export function beatBias(id: BeatId): CopyBias {
  if (id === "layers" || id === "attention") return "end";
  if (id === "hero" || id === "book" || id === "loader") return "bottom";
  return "start";
}

export const LOSS_STATS = [
  { label: "Hours saved", value: "—", placeholder: true },
  { label: "Error rate", value: "—", placeholder: true },
  { label: "Response time", value: "—", placeholder: true },
] as const;

export const NAV = [
  { id: "hero" as const, label: "Network", t: 8 },
  { id: "layers" as const, label: "Layers", t: 24 },
  { id: "attention" as const, label: "Products", t: 34 },
  { id: "book" as const, label: "Book", t: 60 },
];

export const CUE_NAMES = [
  "boot-stinger",
  "ambient-loop",
  "hover",
  "shatter",
  "reassemble",
  "click",
  "tock",
  "drag-loop",
  "roll-loop",
  "pulse",
  "dive",
  "pebbles",
  "book-close",
  "boot",
  "ambient",
  "hero",
  "input",
  "layers",
  "attention",
  "loss",
  "embedding",
  "book",
  "epoch",
] as const;
export type CueName = (typeof CUE_NAMES)[number];
