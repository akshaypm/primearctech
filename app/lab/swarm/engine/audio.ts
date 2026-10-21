/**
 * Krea sound pack, played with one AudioContext.
 * Nothing is fetched until sound is on and the visitor has gestured.
 * See public/lab/swarm/SOUNDS.md.
 */

export const AUDIO_NAMES = ["ambient-loop", "boot-stinger", "shatter", "reassemble", "hover"] as const;

export type ClipName = (typeof AUDIO_NAMES)[number];

export const AMBIENT_DB = -6;
export const HOVER_DB = -3;
export const DUCK_DB = -4;
export const AMBIENT_GAIN = 10 ** (AMBIENT_DB / 20);
export const HOVER_GAIN = 10 ** (HOVER_DB / 20);
export const DUCK_GAIN = 10 ** (DUCK_DB / 20);
export const FADE_IN_SEC = 2.5;
export const FADE_OUT_SEC = 0.6;
export const DUCK_HOLD_SEC = 0.8;
export const DUCK_RELEASE_SEC = 0.12;
export const HOVER_GAP_MS = 700;
export const SHATTER_CENTS = 40;
export const HOVER_CENTS = 60;
export const STINGER_MIN_LEAD = 0.25;
export const LOCK_FLEX_SEC = 0.3;
export const COMPRESSOR = { threshold: -6, ratio: 4, knee: 12, attack: 0.01, release: 0.2 };

export type AudioEvent = { t: number; name: string; detail?: string };

export type PeakBuffer = {
  sampleRate: number;
  numberOfChannels: number;
  getChannelData: (channel: number) => Float32Array;
};

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> }>;

type VisibilityDoc = {
  visibilityState: string;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
};

export type AudioDeps = {
  fetch?: FetchLike;
  createContext?: () => AudioContext;
  extension?: "ogg" | "mp3";
  now?: () => number;
  random?: () => number;
  reducedMotion?: boolean;
  document?: VisibilityDoc | null;
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
};

export type SwarmAudio = {
  setEnabled: (on: boolean, opts?: { gesture?: boolean }) => void;
  unlock: () => Promise<void>;
  onLock: (durationSeconds: number, progress?: number) => void;
  /** Picture progress driven by the audio clock, or null when the stinger is not running. */
  readLock: () => number | null;
  onBurst: (endsInSeconds: number) => void;
  hover: () => void;
  mark: (name: string, detail?: string) => void;
  events: AudioEvent[];
  dispose: () => void;
};

type Clips = Record<ClipName, AudioBuffer>;

type Voice = {
  kind: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
  when: number;
};

type FadeJob = { from: number; to: number; fromT: number; toT: number };

export function extensionFor(canPlayType: (type: string) => string): "ogg" | "mp3" {
  const opus = canPlayType('audio/ogg; codecs="opus"');
  const ogg = canPlayType("audio/ogg");
  if (opus === "probably" || opus === "maybe" || ogg === "probably" || ogg === "maybe") return "ogg";
  return "mp3";
}

/** Place the stinger so its impact sample is heard as the lock finishes. */
export function stingerStart(impact: number, lockIn: number): { offset: number; delay: number } {
  const lead = Math.max(0, lockIn);
  if (impact <= lead) return { offset: 0, delay: lead - impact };
  return { offset: impact - lead, delay: 0 };
}

/** Audio-clock time of the impact sample. `lockAt = currentTime + (impact - offset)`. */
export function lockAtFor(currentTime: number, impact: number, offset: number): number {
  return currentTime + (impact - offset);
}

/**
 * How long the picture should run so it meets the impact.
 * The designed remainder is kept when the file can hit it.
 * Otherwise the picture may flex by ±300 ms. Null means skip the stinger.
 */
export function stingerLead(nominalRemaining: number, impact: number): number | null {
  const nominal = Math.max(0, nominalRemaining);
  if (nominal < STINGER_MIN_LEAD) return null;
  const lead = Math.min(nominal, Math.max(0, impact));
  if (Math.abs(lead - nominal) > LOCK_FLEX_SEC + 1e-6) return null;
  return lead;
}

/** Place reassemble so the buffer ends when the return finishes. */
export function reassembleStart(duration: number, endsIn: number): { offset: number; delay: number } {
  const end = Math.max(0, endsIn);
  if (duration <= end) return { offset: 0, delay: end - duration };
  return { offset: Math.max(0, duration - end), delay: 0 };
}

/** Loudest absolute sample. Coarse stride, then a local refine, so ogg and mp3 agree. */
export function bufferPeakTime(buffer: PeakBuffer): number {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const length = channels[0]?.length ?? 0;
  if (!length || buffer.sampleRate <= 0) return 0;
  const stride = Math.max(1, Math.floor(buffer.sampleRate / 200));
  let bestIndex = 0;
  let best = 0;
  const levelAt = (index: number) => {
    let peak = 0;
    for (const data of channels) {
      const sample = Math.abs(data[index] ?? 0);
      if (sample > peak) peak = sample;
    }
    return peak;
  };
  for (let i = 0; i < length; i += stride) {
    const peak = levelAt(i);
    if (peak > best) {
      best = peak;
      bestIndex = i;
    }
  }
  const from = Math.max(0, bestIndex - stride);
  const to = Math.min(length - 1, bestIndex + stride);
  for (let i = from; i <= to; i++) {
    const peak = levelAt(i);
    if (peak > best) {
      best = peak;
      bestIndex = i;
    }
  }
  return bestIndex / buffer.sampleRate;
}

function defaultContext(): AudioContext {
  if (typeof window === "undefined") throw new Error("Web Audio unavailable");
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio unavailable");
  return new Ctor();
}

export function createAudio(deps: AudioDeps = {}): SwarmAudio {
  const fetchImpl: FetchLike = deps.fetch ?? ((url) => fetch(url));
  const now = deps.now ?? (() => performance.now());
  const rand = deps.random ?? Math.random;
  const reducedMotion = deps.reducedMotion === true;
  const doc: VisibilityDoc | null = deps.document === undefined
    ? (typeof document === "undefined" ? null : document)
    : deps.document;
  const schedule = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number);
  const cancel = deps.clearTimeout ?? ((id: number) => clearTimeout(id));

  const events: AudioEvent[] = [];
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let fade: GainNode | null = null;
  let duck: GainNode | null = null;
  let sfx: GainNode | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let buffers: Clips | null = null;
  let inflight: Promise<void> | null = null;
  let extension: "ogg" | "mp3" | null = deps.extension ?? null;
  let enabled = false;
  let unlocked = false;
  let disposed = false;
  let session = 0;
  let pendingActivate: Promise<void> | null = null;
  let stingerState: "idle" | "armed" | "starting" | "played" | "skipped" = "idle";
  let pendingLock: { origin: number; at: number } | null = null;
  let lockSpan = 0;
  let lockFrom = 0;
  let stingerImpact = -1;
  let lockDrive: { startAt: number; lockAt: number; from: number; hit: boolean } | null = null;
  let lockArmedMarked = false;
  let pendingBurst: { endsIn: number; at: number } | null = null;
  let lastHover = -Infinity;
  let ambientSource: AudioBufferSourceNode | null = null;
  let ambientLive = false;
  let ambientStopping = false;
  let ambientTimer: number | null = null;
  let ambientLevel = 0;
  let fadeJob: FadeJob | null = null;
  let onVisibility: (() => void) | null = null;
  const voices: Voice[] = [];

  function mark(name: string, detail?: string) {
    const event: AudioEvent = { t: now(), name };
    if (detail !== undefined) event.detail = detail;
    events.push(event);
  }

  function hidden() {
    return doc?.visibilityState === "hidden";
  }

  function pickExtension() {
    if (extension) return extension;
    if (deps.extension) {
      extension = deps.extension;
      return extension;
    }
    if (doc && "createElement" in doc) {
      extension = extensionFor((type) => (doc as Document).createElement("audio").canPlayType(type));
      return extension;
    }
    if (typeof document !== "undefined") {
      const probe = document.createElement("audio");
      extension = extensionFor((type) => probe.canPlayType(type));
      return extension;
    }
    extension = "ogg";
    return extension;
  }

  function ensureContext() {
    if (ctx || disposed) return ctx;
    ctx = (deps.createContext ?? defaultContext)();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    fade = ctx.createGain();
    fade.gain.value = 0;
    fade.connect(master);
    duck = ctx.createGain();
    duck.gain.value = 1;
    duck.connect(fade);
    sfx = ctx.createGain();
    sfx.gain.value = 1;
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = COMPRESSOR.threshold;
    compressor.knee.value = COMPRESSOR.knee;
    compressor.ratio.value = COMPRESSOR.ratio;
    compressor.attack.value = COMPRESSOR.attack;
    compressor.release.value = COMPRESSOR.release;
    sfx.connect(compressor);
    compressor.connect(master);
    if (doc && !onVisibility) {
      onVisibility = () => {
        if (!ctx) return;
        if (hidden()) {
          void ctx.suspend();
          mark("hidden");
          return;
        }
        if (enabled && unlocked) {
          void ctx.resume();
          mark("visible");
          startAmbient();
          if (stingerState === "armed") void prepareStinger();
        }
      };
      doc.addEventListener("visibilitychange", onVisibility);
    }
    return ctx;
  }

  async function resumeIfAudible() {
    if (!ctx || hidden()) return;
    if (ctx.state === "suspended") await ctx.resume();
  }

  function commandedGain(at: number) {
    if (!fadeJob) return ambientLevel;
    const span = fadeJob.toT - fadeJob.fromT;
    if (span <= 1e-5) return fadeJob.to;
    const u = Math.min(1, Math.max(0, (at - fadeJob.fromT) / span));
    return fadeJob.from + (fadeJob.to - fadeJob.from) * u;
  }

  function rampFade(to: number, seconds: number) {
    if (!ctx || !fade) return;
    const at = ctx.currentTime;
    const from = commandedGain(at);
    fade.gain.cancelScheduledValues(at);
    fade.gain.setValueAtTime(from, at);
    fade.gain.linearRampToValueAtTime(to, at + seconds);
    fadeJob = { from, to, fromT: at, toT: at + seconds };
    ambientLevel = to;
  }

  function applyLoop(source: AudioBufferSourceNode, buffer: AudioBuffer) {
    source.buffer = buffer;
    source.loop = true;
    if (extension === "mp3") {
      const delay = 576 / buffer.sampleRate;
      source.loopStart = delay;
      source.loopEnd = Math.max(delay + 0.1, buffer.duration - 0.03);
    }
  }

  function startAmbient() {
    if (!ctx || !fade || !duck || !buffers || !enabled || !unlocked || disposed || hidden()) return;
    if (ambientLive && !ambientStopping) return;
    if (ambientTimer !== null) {
      cancel(ambientTimer);
      ambientTimer = null;
    }
    ambientStopping = false;
    if (!ambientLive) {
      const buffer = buffers["ambient-loop"];
      const source = ctx.createBufferSource();
      applyLoop(source, buffer);
      source.connect(duck);
      source.onended = () => {
        if (ambientSource === source) {
          ambientSource = null;
          ambientLive = false;
        }
      };
      source.start(ctx.currentTime);
      ambientSource = source;
      ambientLive = true;
      mark("ambient-start", extension ?? "ogg");
    }
    rampFade(AMBIENT_GAIN, FADE_IN_SEC);
  }

  function stopAmbient() {
    if (!ctx || !fade || !ambientLive) return;
    ambientStopping = true;
    rampFade(0, FADE_OUT_SEC);
    if (ambientTimer !== null) cancel(ambientTimer);
    const source = ambientSource;
    ambientTimer = schedule(() => {
      ambientTimer = null;
      if (enabled || !source) return;
      try { source.stop(); } catch { /* already stopped */ }
      if (ambientSource === source) {
        ambientSource = null;
        ambientLive = false;
      }
    }, FADE_OUT_SEC * 1000 + 40);
  }

  function duckAmbient() {
    if (!ctx || !duck) return;
    const at = ctx.currentTime;
    duck.gain.cancelScheduledValues(at);
    duck.gain.setValueAtTime(DUCK_GAIN, at);
    duck.gain.setValueAtTime(DUCK_GAIN, at + DUCK_HOLD_SEC);
    duck.gain.linearRampToValueAtTime(1, at + DUCK_HOLD_SEC + DUCK_RELEASE_SEC);
    mark("duck", `${DUCK_DB}`);
  }

  async function fetchAll() {
    const audio = ctx;
    if (!audio) throw new Error("Web Audio unavailable");
    const ext = pickExtension();
    mark("load-start", ext);
    const loaded = await Promise.all(AUDIO_NAMES.map(async (name) => {
      const url = `/lab/swarm/audio/${name}.${ext}`;
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`audio ${response.status} ${url}`);
      const bytes = await response.arrayBuffer();
      const decoded = await audio.decodeAudioData(bytes.slice(0));
      return [name, decoded] as const;
    }));
    const clips = {} as Clips;
    for (const [name, buffer] of loaded) clips[name] = buffer;
    return clips;
  }

  function ensureLoaded() {
    if (buffers) return Promise.resolve();
    if (!inflight) {
      inflight = fetchAll().then(
        (clips) => {
          buffers = clips;
        },
        (error) => {
          inflight = null;
          throw error;
        },
      );
    }
    return inflight;
  }

  function fadeVoice(voice: Voice, fadeSec: number) {
    if (!ctx) return;
    const at = ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(at);
      const current = Number.isFinite(voice.gain.gain.value) ? voice.gain.gain.value : 0;
      voice.gain.gain.setValueAtTime(Math.max(0, current), at);
      voice.gain.gain.linearRampToValueAtTime(0, at + fadeSec);
    } catch { /* node already closed */ }
    try { voice.source.stop(Math.max(voice.when, at + fadeSec + 0.005)); } catch { /* already stopped */ }
  }

  function silence(kind: string, fadeSec: number) {
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].kind !== kind) continue;
      fadeVoice(voices[i], fadeSec);
      voices.splice(i, 1);
    }
  }

  function stopVoices(fadeSec: number) {
    for (const voice of voices) fadeVoice(voice, fadeSec);
    voices.length = 0;
  }

  function startVoice(kind: string, buffer: AudioBuffer, opts: { gain: number; detune: number; offset: number; delay: number }) {
    if (!ctx || !sfx) return;
    const gain = ctx.createGain();
    gain.gain.value = opts.gain;
    gain.connect(sfx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.detune.value = opts.detune;
    source.connect(gain);
    const when = ctx.currentTime + Math.max(0, opts.delay);
    const offset = Math.max(0, Math.min(opts.offset, Math.max(0, buffer.duration - 0.001)));
    if (offset > 0) source.start(when, offset);
    else source.start(when);
    voices.push({ kind, source, gain, when });
  }

  function skipStinger(reason: string) {
    if (stingerState === "played" || stingerState === "skipped") return;
    stingerState = "skipped";
    pendingLock = null;
    lockDrive = null;
    mark("stinger-skip", reason);
  }

  function beginStinger(progress: number) {
    if (stingerState === "played" || stingerState === "skipped") return;
    if (!buffers || !ctx || !enabled || !unlocked || disposed || lockSpan <= 0) return;
    const clamped = Math.min(1, Math.max(0, progress));
    if (pendingLock && clamped <= 0.001) {
      const elapsed = Math.max(0, (now() - pendingLock.at) / 1000);
      if (elapsed > pendingLock.origin + 0.05) {
        skipStinger("elapsed");
        return;
      }
    }
    const buffer = buffers["boot-stinger"];
    if (stingerImpact < 0) stingerImpact = bufferPeakTime(buffer);
    const nominal = lockSpan * (1 - clamped);
    const lead = stingerLead(nominal, stingerImpact);
    if (lead == null) {
      skipStinger(clamped > 0 ? "late" : "short");
      return;
    }
    const offset = Math.max(0, stingerImpact - lead);
    if (offset >= buffer.duration - 0.01) {
      skipStinger("offset");
      return;
    }
    const startAt = ctx.currentTime;
    const lockAt = lockAtFor(startAt, stingerImpact, offset);
    stingerState = "played";
    pendingLock = null;
    lockDrive = { startAt, lockAt, from: clamped, hit: false };
    startVoice("stinger", buffer, { gain: 1, detune: 0, offset, delay: 0 });
    const impactIn = lockAt - startAt;
    mark("stinger", `offset=${offset.toFixed(3)} delay=0.000 impact=${stingerImpact.toFixed(3)} remaining=${nominal.toFixed(3)} impactIn=${impactIn.toFixed(3)} lockAt=${lockAt.toFixed(3)}`);
  }

  async function prepareStinger() {
    if (stingerState !== "armed") return;
    stingerState = "starting";
    const ticket = session;
    try {
      const context = ensureContext();
      if (!context) throw new Error("Web Audio unavailable");
      if (context.state === "suspended") await resumeIfAudible();
      await ensureLoaded();
    } catch (error) {
      if (session === ticket && stingerState === "starting") stingerState = "armed";
      mark("load-error", error instanceof Error ? error.message : "load-error");
      return;
    }
    if (stingerState !== "starting") return;
    if (session !== ticket || !enabled || !unlocked || disposed) {
      stingerState = "idle";
      return;
    }
    if (hidden()) {
      stingerState = "armed";
      return;
    }
    stingerState = "armed";
    beginStinger(lockFrom);
  }

  function playShatter() {
    if (!buffers || !ctx) return;
    silence("shatter", 0.05);
    const detune = (rand() * 2 - 1) * SHATTER_CENTS;
    startVoice("shatter", buffers.shatter, { gain: 1, detune, offset: 0, delay: 0 });
    duckAmbient();
    mark("shatter", `detune=${detune.toFixed(2)}`);
  }

  function scheduleReassemble(endsIn: number) {
    if (!buffers || !ctx) return;
    silence("reassemble", 0.05);
    const buffer = buffers.reassemble;
    const plan = reassembleStart(buffer.duration, endsIn);
    if (plan.delay <= 0 && plan.offset >= buffer.duration - 0.005) {
      mark("reassemble-skip", "late");
      return;
    }
    startVoice("reassemble", buffer, { gain: 1, detune: 0, offset: plan.offset, delay: plan.delay });
    mark("reassemble", `delay=${plan.delay.toFixed(3)} offset=${plan.offset.toFixed(3)} dur=${buffer.duration.toFixed(3)} endsIn=${endsIn.toFixed(3)}`);
  }

  function flushBurst() {
    if (!pendingBurst) return;
    const elapsed = Math.max(0, (now() - pendingBurst.at) / 1000);
    const endsIn = pendingBurst.endsIn - elapsed;
    pendingBurst = null;
    if (endsIn <= 0.05) return;
    if (elapsed < 0.12) playShatter();
    scheduleReassemble(endsIn);
  }

  function afterLoad() {
    if (!enabled || !unlocked || !buffers || !ctx || disposed) return;
    if (hidden()) return;
    startAmbient();
    if (stingerState === "armed" || stingerState === "starting") {
      if (ctx.state === "running") beginStinger(lockFrom);
      else void prepareStinger();
    }
    flushBurst();
  }

  async function activate() {
    const ticket = session;
    try {
      if (!ensureContext()) return;
      const loading = ensureLoaded();
      await resumeIfAudible();
      await loading;
    } catch (error) {
      mark("load-error", error instanceof Error ? error.message : "load-error");
      return;
    }
    if (ticket !== session || !enabled || !unlocked || disposed) return;
    afterLoad();
  }

  function begin() {
    try {
      if (!ensureContext()) return Promise.resolve();
      void resumeIfAudible();
      const task = activate().finally(() => {
        if (pendingActivate === task) pendingActivate = null;
      });
      pendingActivate = task;
      return task;
    } catch (error) {
      mark("audio-unavailable", error instanceof Error ? error.message : "unavailable");
      return Promise.resolve();
    }
  }

  function onLock(durationSeconds: number, progress = 0) {
    if (!enabled || disposed) return;
    if (stingerState === "played" || stingerState === "skipped") return;
    const clamped = Math.min(1, Math.max(0, progress));
    const remaining = Math.max(0, durationSeconds) * (1 - clamped);
    if (stingerLead(remaining, Number.POSITIVE_INFINITY) == null) {
      skipStinger(clamped > 0 ? "late" : "short");
      return;
    }
    lockSpan = durationSeconds;
    lockFrom = clamped;
    if (!pendingLock) pendingLock = { origin: remaining, at: now() };
    if (!lockArmedMarked) {
      lockArmedMarked = true;
      mark("lock-armed", remaining.toFixed(3));
    }
    if (!unlocked) {
      stingerState = "armed";
      return;
    }
    if (buffers && ctx && ctx.state === "running") {
      beginStinger(clamped);
      return;
    }
    if (stingerState !== "starting") {
      stingerState = "armed";
      void prepareStinger();
    }
  }

  function readLock(): number | null {
    if (!lockDrive || !ctx || stingerState !== "played" || !enabled) return null;
    const span = lockDrive.lockAt - lockDrive.startAt;
    const u = span > 0 ? (ctx.currentTime - lockDrive.startAt) / span : 1;
    const clamped = Math.min(1, Math.max(0, u));
    const picture = lockDrive.from + (1 - lockDrive.from) * clamped;
    if (clamped >= 1 && !lockDrive.hit) {
      lockDrive.hit = true;
      const lateMs = (ctx.currentTime - lockDrive.lockAt) * 1000;
      mark("stinger-hit", `lateMs=${lateMs.toFixed(1)}`);
    }
    return picture;
  }

  function onBurst(endsInSeconds: number) {
    if (!enabled || !unlocked || disposed) return;
    if (!buffers || !ctx) {
      pendingBurst = { endsIn: endsInSeconds, at: now() };
      mark("burst-pending", endsInSeconds.toFixed(3));
      return;
    }
    playShatter();
    scheduleReassemble(endsInSeconds);
  }

  function hover() {
    if (reducedMotion || !enabled || !unlocked || disposed) return;
    const t = now();
    if (t - lastHover < HOVER_GAP_MS) return;
    if (!buffers || !ctx) return;
    lastHover = t;
    const detune = (rand() * 2 - 1) * HOVER_CENTS;
    startVoice("hover", buffers.hover, { gain: HOVER_GAIN, detune, offset: 0, delay: 0 });
    mark("hover", `detune=${detune.toFixed(2)}`);
  }

  return {
    events,
    mark,
    setEnabled(on, opts) {
      if (disposed) return;
      if (on) {
        const was = enabled;
        enabled = true;
        if (opts?.gesture) unlocked = true;
        if (!opts?.gesture) {
          if (!was) mark("enabled", "remembered");
          return;
        }
        if (!was) mark("enabled", "gesture");
        void begin();
        return;
      }
      const was = enabled;
      enabled = false;
      session += 1;
      pendingBurst = null;
      lockDrive = null;
      if (stingerState !== "played" && stingerState !== "skipped") {
        stingerState = "idle";
        pendingLock = null;
        lockArmedMarked = false;
      }
      if (was) mark("disabled");
      stopAmbient();
      stopVoices(0.05);
    },
    unlock() {
      if (disposed) return Promise.resolve();
      const first = !unlocked;
      unlocked = true;
      if (!enabled) {
        if (first) mark("unlock");
        return Promise.resolve();
      }
      if (first) mark("unlock");
      if (!ensureContext()) return Promise.resolve();
      void resumeIfAudible();
      if (!first && buffers && ambientLive && !ambientStopping) return Promise.resolve();
      return begin();
    },
    onLock,
    readLock,
    onBurst,
    hover,
    dispose() {
      if (disposed) return;
      disposed = true;
      enabled = false;
      session += 1;
      if (ambientTimer !== null) cancel(ambientTimer);
      ambientTimer = null;
      if (doc && onVisibility) doc.removeEventListener("visibilitychange", onVisibility);
      onVisibility = null;
      stopVoices(0.02);
      try { ambientSource?.stop(); } catch { /* already stopped */ }
      try { compressor?.disconnect(); } catch { /* already gone */ }
      try { master?.disconnect(); } catch { /* already gone */ }
      void ctx?.close();
      ctx = null;
      mark("dispose");
    },
  };
}
