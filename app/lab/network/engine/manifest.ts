export type CueFile = { urls: string[]; gain: number; loop: boolean };

type ManifestCue = { src?: string[]; gain?: number; loop?: boolean };
type Manifest = { cues?: Record<string, ManifestCue> };

/** Resolve one cue from audio/manifest.json. Missing cues fall back to webm, opus, then mp3. */
export function cueFile(manifest: Manifest | null, name: string): CueFile {
  const cue = manifest?.cues?.[name];
  const src = cue?.src?.filter((item) => typeof item === "string" && item.length > 0) ?? [];
  const urls = src.length
    ? src.map((item) => (item.startsWith("/") ? item : `/network/audio/${item}`))
    : [`/network/audio/${name}.webm`, `/network/audio/${name}.ogg`, `/network/audio/${name}.mp3`];
  const gain = typeof cue?.gain === "number" ? cue.gain : name === "ambient" ? 0.35 : 0.55;
  return { urls, gain, loop: Boolean(cue?.loop) };
}
