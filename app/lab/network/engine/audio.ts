import type { CueName } from "./copy";
import { cueFile } from "./manifest";

export type CueOpts = { offset?: number; gain?: number };

export type NetworkAudio = {
  setEnabled: (on: boolean) => void;
  setReduced: (on: boolean) => void;
  unlock: () => void;
  cue: (name: CueName, opts?: CueOpts) => void;
  loop: (name: CueName, level: number, rate?: number) => void;
  stop: (name: CueName) => void;
  sync: (t: number, phase: string) => void;
  dispose: () => void;
  fired: () => string[];
  readonly enabled: boolean;
};

const STORAGE_KEY = "network-sound";
const ALIAS: Partial<Record<CueName, CueName>> = {
  boot: "boot-stinger",
  ambient: "ambient-loop",
  book: "book-close",
  epoch: "book-close",
};
const SILENT = new Set<CueName>(["hero", "input", "layers", "attention", "loss", "embedding"]);
const QUIET = new Set<CueName>(["hover", "drag-loop", "roll-loop"]);
type Manifest = Parameters<typeof cueFile>[0];
type Live = { src: AudioBufferSourceNode; gain: GainNode };

/**
 * Sound stays off until the toggle. The first gesture unlocks the context.
 * Cues, gains, and loop flags come from /network/audio/manifest.json.
 */
export function createNetworkAudio(): NetworkAudio {
  let enabled = false;
  let armed = false;
  let reduced = false;
  let ctx: AudioContext | null = null;
  let master: DynamicsCompressorNode | null = null;
  let ambientFade: GainNode | null = null;
  let ambientDuck: GainNode | null = null;
  let manifest: Manifest = null;
  let manifestP: Promise<void> | null = null;
  const buffers = new Map<string, AudioBuffer | null>();
  const urls = new Map<string, string>();
  const last = new Map<string, number>();
  const loops = new Map<string, Live>();
  const want = new Map<string, { level: number; rate: number }>();
  const fired: string[] = [];
  const story = new Set<string>();
  let shots = 0;
  let ambientOn = false;
  let bootPlayed = false;

  function note(name: string) {
    fired.push(name);
    console.info(`audio ${name}`);
  }

  function context() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -6;
      master.ratio.value = 4;
      master.knee.value = 0;
      master.attack.value = 0.01;
      master.release.value = 0.25;
      master.connect(ctx.destination);
      ambientFade = ctx.createGain();
      ambientFade.gain.value = 0;
      ambientDuck = ctx.createGain();
      ambientDuck.gain.value = 1;
      ambientFade.connect(ambientDuck).connect(master);
    }
    return ctx;
  }

  function resolve(name: CueName): CueName | null {
    const next = ALIAS[name] ?? name;
    if (SILENT.has(next) || SILENT.has(name)) return null;
    return next;
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
        urls.set(name, url);
        return data;
      } catch {
        /* try the next encoding */
      }
    }
    return null;
  }

  function duck(down: boolean) {
    if (!ambientDuck || !ctx) return;
    const now = ctx.currentTime;
    ambientDuck.gain.cancelScheduledValues(now);
    ambientDuck.gain.setTargetAtTime(down ? 0.631 : 1, now, 0.03);
  }

  function startAmbient() {
    if (ambientOn || !enabled || !armed) return;
    ambientOn = true;
    const name = "ambient-loop" as const;
    void buffer(name).then((data) => {
      if (!data || !ctx || !master || !ambientFade || !enabled) return;
      const spec = cueFile(manifest, name);
      const src = ctx.createBufferSource();
      src.buffer = data;
      src.loop = true;
      if (urls.get(name)?.endsWith(".mp3")) src.loopStart = 576 / data.sampleRate;
      src.connect(ambientFade);
      const now = ctx.currentTime;
      ambientFade.gain.cancelScheduledValues(now);
      ambientFade.gain.setValueAtTime(0, now);
      ambientFade.gain.linearRampToValueAtTime(Math.min(1, spec.gain), now + 2.5);
      src.start();
      loops.set(name, { src, gain: ambientFade });
      note(name);
    });
  }

  function play(name: CueName, opts?: CueOpts) {
    const spec = cueFile(manifest, name);
    const gainValue = Math.min(1, spec.gain * (opts?.gain ?? 1));
    void buffer(name).then((data) => {
      if (!data || !enabled || !ctx || !master) return;
      if (spec.loop) return;
      const src = ctx.createBufferSource();
      src.buffer = data;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      src.connect(gain).connect(master);
      shots += 1;
      duck(true);
      src.onended = () => {
        shots = Math.max(0, shots - 1);
        if (shots === 0) duck(false);
      };
      const offset = Math.min(Math.max(0, opts?.offset ?? 0), Math.max(0, data.duration - 0.05));
      src.start(0, offset);
      note(name);
    });
  }

  function hold(name: CueName) {
    const wish = want.get(name);
    if (!wish || loops.has(name)) return;
    void buffer(name).then((data) => {
      const still = want.get(name);
      if (!data || !still || !enabled || !ctx || !master || loops.has(name)) return;
      if (reduced && QUIET.has(name)) return;
      const spec = cueFile(manifest, name);
      const src = ctx.createBufferSource();
      src.buffer = data;
      src.loop = true;
      src.playbackRate.value = still.rate;
      if (urls.get(name)?.endsWith(".mp3")) src.loopStart = 576 / data.sampleRate;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, spec.gain * still.level);
      src.connect(gain).connect(master);
      src.start();
      loops.set(name, { src, gain });
      note(name);
    });
  }

  return {
    get enabled() {
      return enabled;
    },
    setReduced(on) {
      reduced = on;
      if (on) {
        for (const name of ["hover", "drag-loop", "roll-loop"] as const) {
          want.delete(name);
          const live = loops.get(name);
          if (live && ctx) {
            try {
              live.src.stop();
            } catch {
              /* already stopped */
            }
            loops.delete(name);
          }
        }
      }
    },
    setEnabled(on) {
      enabled = on;
      try {
        window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
      } catch {
        /* private mode */
      }
      if (!on) {
        want.clear();
        for (const live of loops.values()) {
          try {
            live.src.stop();
          } catch {
            /* already stopped */
          }
        }
        loops.clear();
        ambientOn = false;
        shots = 0;
        if (ctx && ctx.state === "running") void ctx.suspend();
      }
      if (on && armed && ctx && ctx.state === "suspended") void ctx.resume();
    },
    unlock() {
      armed = true;
      if (!enabled) return;
      const audio = context();
      if (audio.state === "suspended") void audio.resume();
      startAmbient();
    },
    cue(name, opts) {
      const resolved = resolve(name);
      if (!resolved || !enabled || !armed) return;
      if (reduced && QUIET.has(resolved)) return;
      if (resolved === "ambient-loop") {
        startAmbient();
        return;
      }
      const now = performance.now();
      const gap = resolved === "hover" ? 120 : 80;
      if (now - (last.get(resolved) ?? 0) < gap) return;
      last.set(resolved, now);
      play(resolved, opts);
    },
    loop(name, level, rate = 1) {
      const resolved = resolve(name);
      if (!resolved) return;
      if (!enabled || !armed || level <= 0.02 || (reduced && QUIET.has(resolved))) {
        this.stop(name);
        return;
      }
      const spec = cueFile(manifest, resolved);
      const clamped = Math.min(1, Math.max(0, level));
      const paced = Math.min(1.1, Math.max(0.9, rate));
      want.set(resolved, { level: clamped, rate: paced });
      const live = loops.get(resolved);
      if (live && ctx) {
        live.gain.gain.setTargetAtTime(Math.min(1, spec.gain * clamped), ctx.currentTime, 0.05);
        live.src.playbackRate.setTargetAtTime(paced, ctx.currentTime, 0.05);
        return;
      }
      hold(resolved);
    },
    stop(name) {
      const resolved = resolve(name);
      if (!resolved) return;
      want.delete(resolved);
      const live = loops.get(resolved);
      if (!live || !ctx) return;
      if (resolved === "ambient-loop") return;
      const now = ctx.currentTime;
      live.gain.gain.cancelScheduledValues(now);
      live.gain.gain.setValueAtTime(live.gain.gain.value, now);
      live.gain.gain.linearRampToValueAtTime(0, now + 0.12);
      const src = live.src;
      loops.delete(resolved);
      window.setTimeout(() => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }, 140);
    },
    sync(t, phase) {
      if (!enabled || !armed) return;
      if (phase === "loader" && !bootPlayed && t < 4.4) {
        bootPlayed = true;
        this.cue("boot-stinger", { offset: Math.max(0, t) });
      }
      const mark = (key: string, name: CueName, a: number, b: number) => {
        if (story.has(key) || t < a || t >= b) return;
        story.add(key);
        this.cue(name);
      };
      if (phase === "loader") return;
      mark("shatter", "shatter", 23.35, 28);
      mark("pulse-a", "pulse", 24.6, 25.5);
      mark("pulse-b", "pulse", 26.2, 27.1);
      mark("pulse-c", "pulse", 27.8, 28.7);
      mark("pulse-d", "pulse", 29.4, 30.4);
      mark("reassemble", "reassemble", 37, 40);
      mark("pebbles", "pebbles", 48, 50.2);
      mark("book", "book-close", 60.4, 62.2);
    },
    fired() {
      return fired.slice();
    },
    dispose() {
      void ctx?.close();
      ctx = null;
    },
  };
}
