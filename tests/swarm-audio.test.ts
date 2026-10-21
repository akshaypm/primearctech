import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AMBIENT_GAIN,
  AUDIO_NAMES,
  COMPRESSOR,
  DUCK_GAIN,
  DUCK_HOLD_SEC,
  DUCK_RELEASE_SEC,
  FADE_IN_SEC,
  FADE_OUT_SEC,
  HOVER_GAIN,
  HOVER_GAP_MS,
  bufferPeakTime,
  createAudio,
  extensionFor,
  reassembleStart,
  stingerStart,
} from "../app/lab/swarm/engine/audio";

type ParamEvent = { method: string; value?: number; time?: number };

class Param {
  value: number;
  events: ParamEvent[] = [];
  constructor(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number, time: number) {
    this.events.push({ method: "set", value, time });
    this.value = value;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ method: "linear", value, time });
    this.value = value;
  }
  cancelScheduledValues(time: number) {
    this.events.push({ method: "cancel", time });
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.events.push({ method: "exp", value, time });
    this.value = value;
  }
}

const CLIPS = [
  { name: "ambient-loop", duration: 2, peakAt: null },
  { name: "boot-stinger", duration: 5.55, peakAt: 3.44 },
  { name: "shatter", duration: 1.406, peakAt: 0.01 },
  { name: "reassemble", duration: 1.03, peakAt: 1.02 },
  { name: "hover", duration: 0.756, peakAt: 0.2 },
] as const;

function makeBuffer(duration: number, peakAt: number | null) {
  const sampleRate = 1000;
  const length = Math.ceil(duration * sampleRate);
  const data = new Float32Array(length);
  if (peakAt != null) data[Math.round(peakAt * sampleRate)] = 0.987;
  else data[0] = 0.2;
  return {
    duration,
    sampleRate,
    numberOfChannels: 1,
    length,
    getChannelData: () => data,
  };
}

function harness(overrides: {
  extension?: "ogg" | "mp3";
  reducedMotion?: boolean;
  random?: () => number;
  clock?: { t: number };
  gate?: Promise<void>;
  document?: { visibilityState: string; addEventListener: (type: "visibilitychange", cb: () => void) => void; removeEventListener: () => void } | null;
} = {}) {
  const fetches: string[] = [];
  const sources: {
    loop: boolean;
    loopStart: number;
    loopEnd: number;
    buffer: { duration: number; sampleRate: number } | null;
    detune: Param;
    started: { when: number; offset?: number } | null;
    stopped: number | null;
    dest: { gain: Param } | null;
  }[] = [];
  const gains: { gain: Param }[] = [];
  const timeouts: { fn: () => void; ms: number }[] = [];
  const cleared: number[] = [];
  let compressor: {
    threshold: Param;
    knee: Param;
    ratio: Param;
    attack: Param;
    release: Param;
  } | null = null;
  const ctx = {
    state: "suspended" as AudioContextState,
    currentTime: 0,
    sampleRate: 1000,
    destination: {},
    resume() {
      this.state = "running";
      return Promise.resolve();
    },
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    },
    close() {
      this.state = "closed";
      return Promise.resolve();
    },
    createGain() {
      const node = { gain: new Param(1), connect() {} };
      gains.push(node);
      return node;
    },
    createDynamicsCompressor() {
      compressor = {
        threshold: new Param(-24),
        knee: new Param(30),
        ratio: new Param(12),
        attack: new Param(0.003),
        release: new Param(0.25),
      };
      return { ...compressor, connect() {} };
    },
    createBufferSource() {
      const source = {
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        buffer: null as { duration: number; sampleRate: number } | null,
        detune: new Param(0),
        started: null as { when: number; offset?: number } | null,
        stopped: null as number | null,
        dest: null as { gain: Param } | null,
        onended: null as (() => void) | null,
        connect(node: { gain: Param }) {
          this.dest = node;
        },
        start(when: number, offset?: number) {
          this.started = { when, offset };
          sources.push(this);
        },
        stop(when?: number) {
          this.stopped = when ?? ctx.currentTime;
        },
        disconnect() {},
      };
      return source;
    },
    async decodeAudioData(bytes: ArrayBuffer) {
      const index = new Uint8Array(bytes)[0] ?? 0;
      const clip = CLIPS[index] ?? CLIPS[0];
      return makeBuffer(clip.duration, clip.peakAt);
    },
  };

  const audio = createAudio({
    extension: overrides.extension ?? "ogg",
    reducedMotion: overrides.reducedMotion,
    random: overrides.random ?? (() => 0),
    now: () => overrides.clock?.t ?? 0,
    document: overrides.document === undefined ? null : overrides.document,
    setTimeout: (fn, ms) => {
      timeouts.push({ fn, ms });
      return timeouts.length;
    },
    clearTimeout: (id) => {
      cleared.push(id);
    },
    createContext: () => ctx as unknown as AudioContext,
    fetch: (url) => {
      fetches.push(url);
      const index = Math.max(0, AUDIO_NAMES.findIndex((name) => url.includes(name)));
      const bytes = new Uint8Array([index]).buffer;
      const response = {
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(bytes),
      };
      if (!overrides.gate) return Promise.resolve(response);
      return overrides.gate.then(() => response);
    },
  });

  return { audio, fetches, sources, gains, timeouts, cleared, ctx, get compressor() { return compressor; } };
}

async function settled() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("swarm audio format and timing", () => {
  it("prefers ogg and falls back to mp3", () => {
    expect(extensionFor(() => "")).toBe("mp3");
    expect(extensionFor((type) => (type.includes("opus") ? "probably" : ""))).toBe("ogg");
    expect(extensionFor((type) => (type === "audio/ogg" ? "maybe" : ""))).toBe("ogg");
  });

  it("aligns the stinger impact and the reassemble ending", () => {
    const full = stingerStart(3.44, 1.12);
    expect(full.offset).toBeCloseTo(2.32, 5);
    expect(full.delay).toBe(0);
    expect(stingerStart(3.44, 0.46).offset).toBeCloseTo(2.98, 5);
    const early = stingerStart(0.5, 1.12);
    expect(early.offset).toBe(0);
    expect(early.delay).toBeCloseTo(0.62, 5);
    const reassembled = reassembleStart(1.03, 1.65);
    expect(reassembled.offset).toBe(0);
    expect(reassembled.delay).toBeCloseTo(0.62, 5);
    const long = reassembleStart(2, 1.65);
    expect(long.offset).toBeCloseTo(0.35, 5);
    expect(long.delay).toBe(0);
  });

  it("finds the buffer peak inside the stride window", () => {
    const data = new Float32Array(30);
    data[5] = 0.4;
    data[7] = 1;
    expect(bufferPeakTime({
      sampleRate: 1000,
      numberOfChannels: 1,
      getChannelData: () => data,
    })).toBeCloseTo(0.007, 5);
  });
});

describe("swarm audio playback gate", () => {
  it("fetches nothing and plays nothing while the toggle is off", async () => {
    const rig = harness();
    rig.audio.hover();
    rig.audio.onBurst(1.65);
    rig.audio.onLock(1.12);
    await rig.audio.unlock();
    await settled();
    expect(rig.fetches).toEqual([]);
    expect(rig.sources).toHaveLength(0);

    const played = harness();
    played.audio.setEnabled(true, { gesture: true });
    await settled();
    expect(played.sources.length).toBeGreaterThan(0);
    played.audio.setEnabled(false);
    const afterOff = played.sources.length;
    played.audio.hover();
    played.audio.onBurst(1.65);
    played.audio.onLock(1.12);
    await settled();
    expect(played.sources).toHaveLength(afterOff);
    expect(played.fetches).toHaveLength(AUDIO_NAMES.length);
  });

  it("does not request audio before the toggle, then requests each clip once", async () => {
    const remembered = harness();
    remembered.audio.setEnabled(true);
    remembered.audio.hover();
    remembered.audio.onBurst(1.65);
    remembered.audio.onLock(1.12);
    await settled();
    expect(remembered.fetches).toEqual([]);
    expect(remembered.ctx.state).toBe("suspended");

    await remembered.audio.unlock();
    await settled();
    expect(remembered.fetches).toEqual(AUDIO_NAMES.map((name) => `/lab/swarm/audio/${name}.ogg`));

    const toggled = harness();
    expect(toggled.fetches).toEqual([]);
    toggled.audio.setEnabled(true, { gesture: true });
    expect(toggled.fetches).toEqual(AUDIO_NAMES.map((name) => `/lab/swarm/audio/${name}.ogg`));
    await settled();
    expect(toggled.sources.some((source) => source.loop)).toBe(true);
  });

  it("drops an in-flight load when sound is turned off before decode", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rig = harness({ gate });
    rig.audio.setEnabled(true, { gesture: true });
    expect(rig.fetches).toHaveLength(5);
    rig.audio.setEnabled(false);
    release();
    await settled();
    await settled();
    expect(rig.sources).toHaveLength(0);
  });

  it("fades the bed, ducks it on shatter, and limits the SFX bus", async () => {
    const rig = harness();
    rig.audio.setEnabled(true, { gesture: true });
    await settled();
    const fade = rig.gains[1].gain;
    expect(fade.events.some((event) => event.method === "linear" && event.value === AMBIENT_GAIN && event.time === FADE_IN_SEC)).toBe(true);
    expect(rig.compressor?.threshold.value).toBe(COMPRESSOR.threshold);
    expect(rig.compressor?.ratio.value).toBe(COMPRESSOR.ratio);
    expect(rig.compressor?.knee.value).toBe(COMPRESSOR.knee);

    rig.audio.onBurst(1.65);
    const duck = rig.gains[2].gain;
    expect(duck.events.some((event) => event.method === "set" && event.value != null && Math.abs(event.value - DUCK_GAIN) < 1e-6 && event.time === 0)).toBe(true);
    expect(duck.events.some((event) => event.method === "set" && event.time === DUCK_HOLD_SEC)).toBe(true);
    expect(duck.events.some((event) => event.method === "linear" && event.value === 1 && event.time === DUCK_HOLD_SEC + DUCK_RELEASE_SEC)).toBe(true);

    const shatter = rig.sources.find((source) => source.buffer?.duration === 1.406);
    const reassemble = rig.sources.find((source) => source.buffer?.duration === 1.03);
    expect(shatter?.detune.value).toBe(-40);
    expect(shatter?.started).toEqual({ when: 0, offset: undefined });
    expect(reassemble?.started?.when).toBeCloseTo(0.62, 5);
    expect(reassemble?.started?.offset).toBeUndefined();

    rig.audio.onBurst(1.65);
    expect(shatter?.stopped).toBeCloseTo(0.055, 5);

    rig.audio.setEnabled(false);
    expect(fade.events.some((event) => event.method === "linear" && event.value === 0 && event.time === FADE_OUT_SEC)).toBe(true);
    expect(rig.timeouts.some((timer) => timer.ms === FADE_OUT_SEC * 1000 + 40)).toBe(true);
  });

  it("schedules the stinger from the decoded peak and skips it after the lock", async () => {
    const clock = { t: 1000 };
    const rig = harness({ clock });
    rig.audio.setEnabled(true, { gesture: true });
    await settled();
    clock.t = 4000;
    rig.audio.onLock(1.12);
    const stinger = rig.sources.find((source) => source.buffer?.duration === 5.55);
    expect(stinger?.started?.when).toBe(0);
    expect(stinger?.started?.offset).toBeCloseTo(2.32, 5);
    expect(rig.audio.events.some((event) => event.name === "stinger" && event.detail?.includes("impact=3.440"))).toBe(true);
    clock.t = 4016;
    rig.ctx.currentTime = 0.016;
    rig.audio.followLock(0.016 / 1.12);
    expect(stinger?.dest?.gain.events.some((event) => event.method === "set" && event.value === 1 && event.time === 0.016)).toBe(true);
    expect(stinger?.dest?.gain.events.some((event) => event.method === "linear" && event.value === 0 && event.time === 0.136)).toBe(true);

    const stalled = harness({ clock });
    stalled.audio.setEnabled(true, { gesture: true });
    await settled();
    clock.t = 8000;
    stalled.audio.onLock(1.12);
    clock.t = 9500;
    stalled.ctx.currentTime = 1.5;
    stalled.audio.followLock(0.05);
    const retriggered = stalled.sources.filter((source) => source.buffer?.duration === 5.55);
    expect(retriggered.length).toBeGreaterThan(1);
    expect(retriggered.at(-1)?.started?.offset).toBeCloseTo(3.44 - 1.12 * 0.95, 2);

    const late = harness();
    late.audio.setEnabled(true);
    late.audio.onLock(0.2);
    expect(late.fetches).toEqual([]);
    clock.t = 0;
    const lateClock = { t: 0 };
    const missed = harness({ clock: lateClock });
    missed.audio.setEnabled(true);
    missed.audio.onLock(0.2);
    lateClock.t = 500;
    await missed.audio.unlock();
    await settled();
    expect(missed.sources.some((source) => source.buffer?.duration === 5.55)).toBe(false);
    expect(missed.sources.some((source) => source.loop)).toBe(true);
    expect(missed.audio.events.some((event) => event.name === "stinger-skip")).toBe(true);
  });

  it("throttles hover, keeps it quieter, and skips it for reduced motion", async () => {
    const clock = { t: 0 };
    const rig = harness({ clock, random: () => 1 });
    rig.audio.setEnabled(true, { gesture: true });
    await settled();
    rig.audio.hover();
    rig.audio.hover();
    clock.t = HOVER_GAP_MS - 1;
    rig.audio.hover();
    const hovers = () => rig.sources.filter((source) => source.buffer?.duration === 0.756);
    expect(hovers()).toHaveLength(1);
    expect(hovers()[0].detune.value).toBe(60);
    expect(hovers()[0].dest?.gain.value).toBeCloseTo(HOVER_GAIN, 5);
    clock.t = HOVER_GAP_MS;
    rig.audio.hover();
    expect(hovers()).toHaveLength(2);

    const still = harness({ reducedMotion: true });
    still.audio.setEnabled(true, { gesture: true });
    await settled();
    still.audio.hover();
    still.audio.hover();
    expect(still.sources.filter((source) => source.buffer?.duration === 0.756)).toHaveLength(0);
    expect(still.sources.some((source) => source.loop)).toBe(true);
  });

  it("trims the mp3 loop and suspends when the tab hides", async () => {
    const mp3 = harness({ extension: "mp3" });
    mp3.audio.setEnabled(true, { gesture: true });
    await settled();
    const ambient = mp3.sources.find((source) => source.loop);
    expect(ambient?.loopStart).toBeGreaterThan(0);
    expect(ambient?.loopStart).toBeCloseTo(576 / 1000, 5);
    expect(ambient?.loopEnd).toBeCloseTo(2 - 0.03, 5);
    expect(mp3.fetches.every((url) => url.endsWith(".mp3"))).toBe(true);

    let handler = () => {};
    const doc = {
      visibilityState: "visible",
      addEventListener: (_type: "visibilitychange", cb: () => void) => {
        handler = cb;
      },
      removeEventListener() {},
    };
    const rig = harness({ document: doc });
    rig.audio.setEnabled(true, { gesture: true });
    await settled();
    expect(rig.ctx.state).toBe("running");
    doc.visibilityState = "hidden";
    handler();
    expect(rig.ctx.state).toBe("suspended");
    doc.visibilityState = "visible";
    handler();
    expect(rig.ctx.state).toBe("running");
  });
});

describe("swarm audio wiring", () => {
  it("ships the Krea pack and no longer credits the synth as CC0", () => {
    for (const name of AUDIO_NAMES) {
      expect(statSync(`public/lab/swarm/audio/${name}.ogg`).size).toBeGreaterThan(1000);
      expect(statSync(`public/lab/swarm/audio/${name}.mp3`).size).toBeGreaterThan(1000);
    }
    const licence = readFileSync("public/lab/swarm/audio/LICENSE-NOTE.md", "utf8");
    expect(licence).toContain("Krea Business plan");
    const notes = readFileSync("public/lab/swarm/audio/NOTES.md", "utf8");
    expect(notes).toContain("ambient-loop");
    const sounds = readFileSync("public/lab/swarm/SOUNDS.md", "utf8");
    expect(sounds).toContain("Krea");
    expect(sounds).toContain("Business");
    expect(sounds).toContain("Web Audio");
    expect(sounds).not.toContain("CC0");
    const engine = readFileSync("app/lab/swarm/engine/createEngine.ts", "utf8");
    expect(engine).not.toContain("audio.hit");
    expect(engine).not.toContain("audio.grain");
    expect(engine).not.toContain("startHum");
    expect(engine).toContain("onLock");
    expect(engine).toContain("onBurst");
    expect(engine).toContain("audio.hover");
    const page = readFileSync("app/lab/swarm/SwarmExperience.tsx", "utf8");
    expect(page).toContain('aria-pressed={sound}');
    expect(page).toContain(".swarm-sound");
    expect(page).toContain("gesture: true");
    expect(page).not.toContain("sound: stored");
    expect(page).toContain("reducedMotion: reduce");
  });
});
