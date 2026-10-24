export type CueFile = { urls: string[]; gain: number; loop: boolean };

type ManifestCue = {
  src?: string[];
  files?: { webm?: string; ogg?: string; mp3?: string };
  gain?: number;
  loop?: boolean;
};
type Manifest = { cues?: Record<string, ManifestCue> };

/** Resolve one cue from audio/manifest.json. Missing cues fall back to webm, opus, then mp3. */
export function cueFile(manifest: Manifest | null, name: string): CueFile {
  const cue = manifest?.cues?.[name];
  const fromFiles = [cue?.files?.webm, cue?.files?.ogg, cue?.files?.mp3].filter((item): item is string => Boolean(item));
  const src = cue?.src?.filter((item) => typeof item === "string" && item.length > 0) ?? [];
  const listed = src.length ? src : fromFiles;
  const urls = listed.length
    ? listed.map((item) => (item.startsWith("/") ? item : `/network/audio/${item}`))
    : [`/network/audio/${name}.webm`, `/network/audio/${name}.ogg`, `/network/audio/${name}.mp3`];
  const gain = typeof cue?.gain === "number" ? cue.gain : name === "ambient" ? 0.35 : 0.55;
  return { urls, gain, loop: Boolean(cue?.loop) };
}
