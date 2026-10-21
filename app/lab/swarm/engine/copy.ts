/**
 * Boot readout and the section under the hero.
 * PLACEHOLDER COPY. Not approved marketing.
 */
export const COPY_NOTE = "PLACEHOLDER COPY";

export const SOUND_STORAGE_KEY = "primearc-swarm-sound";

export const BOOT_LINES = [
  "PRIMEARC / SYSTEMS",
  "calibrating agents ........ 000%",
  "routing ........ ok",
  "shard field ........ nominal",
  "seam ........ armed",
] as const;

export const NEXT_SECTION_COPY = "Placeholder. The next section is not part of this prototype.";

export function bootLine(index: number, percent: number) {
  if (index === 1) {
    const pct = String(Math.max(0, Math.min(999, Math.round(percent)))).padStart(3, "0");
    return `calibrating agents ........ ${pct}%`;
  }
  return BOOT_LINES[index] ?? "";
}
