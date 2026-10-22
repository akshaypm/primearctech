/**
 * Boot readout and section lines.
 * PLACEHOLDER COPY except the hero H1 and the audit CTA.
 */

export const COPY_NOTE = "PLACEHOLDER COPY";

export const SOUND_STORAGE_KEY = "primearc-network-sound";

export const HERO_H1 = "We build AI systems that complete real work.";

export const CTA_LABEL = "Get free AI audit";

export const CTA_HREF = "/build-brief";

export const STILLS = [
  {
    id: "hero",
    index: "01",
    label: "HERO",
    src: "/lab/network/stills/t06.png",
    alt: "Terracotta clay network on a sand ground, sunlit, with soft shadows.",
  },
  {
    id: "input",
    index: "02",
    label: "INPUT",
    src: "/lab/network/stills/t15.png",
    alt: "A low clay conveyor on sand, seen from near the ground.",
  },
  {
    id: "layers",
    index: "03",
    label: "LAYERS",
    src: "/lab/network/stills/t24.png",
    alt: "Looking up a shaft of stacked clay blocks.",
  },
  {
    id: "attention",
    index: "04",
    label: "ATTENTION",
    src: "/lab/network/stills/t34.png",
    alt: "Three bone-glaze spheres on sand, with soft shadows.",
  },
  {
    id: "loss",
    index: "05",
    label: "LOSS",
    src: "/lab/network/stills/t44.png",
    alt: "A low terracotta clay landscape under a bright sand sky.",
  },
  {
    id: "embedding",
    index: "06",
    label: "EMBEDDING",
    src: "/lab/network/stills/t52.png",
    alt: "Small clay pebbles scattered on sand.",
  },
  {
    id: "book",
    index: "07",
    label: "BOOK",
    src: "/lab/network/stills/t60.png",
    alt: "The clay network seen again from a low sand path.",
  },
] as const;

export const SECTION_PLACEHOLDERS: Record<string, string> = {
  HERO: "",
  INPUT: "PLACEHOLDER. The token stream is not written yet.",
  LAYERS: "PLACEHOLDER. The layer ride is not written yet.",
  ATTENTION: "PLACEHOLDER. The three product rooms are not written yet.",
  LOSS: "PLACEHOLDER. Proof numbers are not supplied yet.",
  EMBEDDING: "PLACEHOLDER. The partner line is not written yet.",
  BOOK: "PLACEHOLDER. The closing line is not written yet.",
};

export function bootLine(progress: number) {
  const clamped = Math.min(1, Math.max(0, progress));
  const layer = clamped >= 1 ? 4 : Math.min(4, Math.floor(clamped * 4) + 1);
  return `initialising layer ${layer}/4…`;
}

/** Nodes grow in over the boot instead of appearing finished. */
export function assemblyScale(index: number, count: number, progress: number) {
  const span = Math.max(1, count);
  const start = (index / span) * 0.72;
  const end = start + 0.28;
  const t = Math.min(1, Math.max(0, (progress - start) / Math.max(1e-5, end - start)));
  const s = t * t * (3 - 2 * t);
  return s * s * (3 - 2 * s);
}
