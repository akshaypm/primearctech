import type { CueName } from "./copy";
import { cueFile } from "./manifest";

export type NetworkAudio = {
  setEnabled: (on: boolean) => void;
  unlock: () => void;
  cue: (name: CueName) => void;
  dispose: () => void;
  readonly enabled: boolean;
};

const STORAGE_KEY = "network-sound";
type Manifest = Parameters<typeof cueFile>[0];

/**
 * Sound stays off until the existing toggle. The first pointer gesture unlocks
 * the context. Cues resolve through audio/manifest.json when that pack arrives.
 */
export function createNetworkAudio(): NetworkAudio {
  let enabled = false;
  let armed = false;
  let ctx: AudioContext | null = null;
  let manifest: Manifest = null;
  let manifestP: Promise<void> | null = null;
  const buffers = new Map<string, AudioBuffer | null>();
  const last = new Map<string, number>();
  const looping = new Set<string>();

  function context() {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  }

  function ensureManifest() {
    if (!manifestP) {
      manifestP = fetch("/network/audio/manifest.json")
        .then(async (res) => {
          if (!res.ok) return;
          manifest = (await res.json()) as Manifest;
        })
        .catch(() => undefined);
    }
    return manifestP;
  }

  async function buffer(name: CueName) {
    if (buffers.has(name)) return buffers.get(name) ?? null;
    buffers.set(name, null);
    await ensureManifest();
    const spec = cueFile(manifest, name);
    const audio = context();
    for (const url of spec.urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await audio.decodeAudioData(await res.arrayBuffer());
        buffers.set(name, data);
        return data;
      } catch {
        /* try the next encoding */
      }
    }
    return null;
  }

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      try {
        window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
      } catch {
        /* private mode */
      }
      if (!on) {
        looping.clear();
        if (ctx && ctx.state === "running") void ctx.suspend();
      }
      if (on && armed && ctx && ctx.state === "suspended") void ctx.resume();
    },
    unlock() {
      armed = true;
      if (!enabled) return;
      const audio = context();
      if (audio.state === "suspended") void audio.resume();
    },
    cue(name) {
      if (!enabled || !armed) return;
      const now = performance.now();
      if (now - (last.get(name) ?? 0) < 80) return;
      last.set(name, now);
      void buffer(name).then((data) => {
        if (!data || !enabled || !ctx) return;
        const spec = cueFile(manifest, name);
        if (spec.loop && looping.has(name)) return;
        const src = ctx.createBufferSource();
        src.buffer = data;
        src.loop = spec.loop;
        if (spec.loop) {
          looping.add(name);
          src.onended = () => looping.delete(name);
        }
        const gain = ctx.createGain();
        gain.gain.value = spec.gain;
        src.connect(gain).connect(ctx.destination);
        src.start();
      });
    },
    dispose() {
      void ctx?.close();
      ctx = null;
    },
  };
}
