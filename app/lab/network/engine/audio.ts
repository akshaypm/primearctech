import type { CueName } from "./copy";

export type NetworkAudio = {
  setEnabled: (on: boolean) => void;
  unlock: () => void;
  cue: (name: CueName) => void;
  dispose: () => void;
  readonly enabled: boolean;
};

const STORAGE_KEY = "network-sound";

/**
 * Muted until a gesture. Cue files are not in the repo yet; the hooks are named
 * so a later pack can drop ogg/mp3 beside /network/audio/<cue>.ogg.
 */
export function createNetworkAudio(): NetworkAudio {
  let enabled = false;
  let armed = false;
  let ctx: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer | null>();
  const last = new Map<string, number>();

  function context() {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  }

  async function buffer(name: CueName) {
    if (buffers.has(name)) return buffers.get(name) ?? null;
    buffers.set(name, null);
    for (const ext of ["ogg", "mp3"]) {
      try {
        const res = await fetch(`/network/audio/${name}.${ext}`);
        if (!res.ok) continue;
        const audio = context();
        const data = await audio.decodeAudioData(await res.arrayBuffer());
        buffers.set(name, data);
        return data;
      } catch {
        /* the pack is not here yet */
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
      if (!on && ctx && ctx.state === "running") void ctx.suspend();
      if (on && ctx && ctx.state === "suspended") void ctx.resume();
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
        const src = ctx.createBufferSource();
        src.buffer = data;
        const gain = ctx.createGain();
        gain.gain.value = name === "ambient" ? 0.35 : 0.8;
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
