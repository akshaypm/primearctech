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
    kicker: "03 — How we work",
    title: "How we work",
    body: "It passes through PrimeArc's layers.",
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

export const LAYER_CALLOUTS = [
  { id: "audit", node: "LAYERS_blk0_box", index: "01", label: "Audit" },
  { id: "design", node: "LAYERS_blk1_box", index: "02", label: "Design" },
  { id: "build", node: "LAYERS_blk2_box", index: "03", label: "Build" },
  { id: "run", node: "LAYERS_blk3_box", index: "04", label: "Run" },
] as const;

export const INPUT_CHIPS = ["Tickets", "Calls", "Invoices", "Spreadsheets", "Approvals"] as const;

export const PRODUCTS = [
  {
    id: "fieldrelay",
    node: "ATTN_chain",
    name: "FieldRelay",
    href: "/fieldrelay",
    line: "The lattice reforms into a relay chain, field to office.",
    proof: "Hours back to the people on the tools.",
    proofPlaceholder: true,
  },
  {
    id: "counter",
    node: "ATTN_coil",
    name: "Counter",
    href: "/build-brief",
    line: "A stacked counting column.",
    proof: "The count the team actually trusts.",
    proofPlaceholder: true,
  },
  {
    id: "roster",
    node: "ATTN_tile0",
    name: "Roster",
    href: "/build-brief",
    line: "A grid of scheduled slots.",
    proof: "The week, filled without the scramble.",
    proofPlaceholder: true,
  },
] as const;

export const LOSS_STATS = [
  { label: "Hours saved", value: "—", placeholder: true },
  { label: "Error rate", value: "—", placeholder: true },
  { label: "Response time", value: "—", placeholder: true },
] as const;

export const NAV = [
  { id: "hero" as const, label: "Network", t: 8 },
  { id: "input" as const, label: "Input", t: 15 },
  { id: "layers" as const, label: "Layers", t: 24 },
  { id: "attention" as const, label: "Products", t: 34 },
  { id: "loss" as const, label: "Proof", t: 44 },
  { id: "embedding" as const, label: "Partners", t: 52 },
  { id: "book" as const, label: "Book", t: 60 },
];

export const CUE_NAMES = ["boot", "hero", "input", "layers", "attention", "loss", "embedding", "book", "epoch", "hover", "click", "dive", "ambient"] as const;
export type CueName = (typeof CUE_NAMES)[number];
