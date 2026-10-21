/**
 * All swarm sound is synthesized here. Nothing is fetched.
 * See public/lab/swarm/SOUNDS.md.
 */

export type SwarmAudio = {
  setEnabled: (on: boolean) => void;
  startHum: () => void;
  stopHum: () => void;
  hit: () => void;
  grain: () => void;
  dispose: () => void;
};

export function createAudio(): SwarmAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let humGain: GainNode | null = null;
  let humNodes: AudioNode[] = [];
  let enabled = false;
  let lastGrain = 0;

  function context() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio unavailable");
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    return ctx;
  }

  function noise(seconds: number) {
    const audio = context();
    const length = Math.floor(audio.sampleRate * seconds);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x1234567;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      data[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
    return buffer;
  }

  return {
    setEnabled(on) {
      enabled = on;
      if (!on) this.stopHum();
      else if (ctx?.state === "suspended") void ctx.resume();
    },
    startHum() {
      if (!enabled) return;
      const audio = context();
      if (audio.state === "suspended") void audio.resume();
      this.stopHum();
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, audio.currentTime + 0.7);
      gain.connect(master!);
      humGain = gain;

      const a = audio.createOscillator();
      a.type = "sine";
      a.frequency.value = 46;
      const aGain = audio.createGain();
      aGain.gain.value = 0.55;
      a.connect(aGain).connect(gain);

      const b = audio.createOscillator();
      b.type = "sine";
      b.frequency.value = 46.7;
      const bGain = audio.createGain();
      bGain.gain.value = 0.28;
      b.connect(bGain).connect(gain);

      const c = audio.createOscillator();
      c.type = "triangle";
      c.frequency.value = 92;
      const cFilter = audio.createBiquadFilter();
      cFilter.type = "lowpass";
      cFilter.frequency.value = 280;
      const cGain = audio.createGain();
      cGain.gain.value = 0.08;
      c.connect(cFilter).connect(cGain).connect(gain);

      const src = audio.createBufferSource();
      src.buffer = noise(2);
      src.loop = true;
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 180;
      filter.Q.value = 0.7;
      const nGain = audio.createGain();
      nGain.gain.value = 0.12;
      src.connect(filter).connect(nGain).connect(gain);

      a.start();
      b.start();
      c.start();
      src.start();
      humNodes = [a, b, c, src, gain];
    },
    stopHum() {
      if (!ctx || !humGain) {
        humNodes = [];
        humGain = null;
        return;
      }
      const now = ctx.currentTime;
      humGain.gain.cancelScheduledValues(now);
      humGain.gain.setValueAtTime(Math.max(0.0001, humGain.gain.value), now);
      humGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      const nodes = humNodes;
      humNodes = [];
      humGain = null;
      window.setTimeout(() => {
        for (const node of nodes) {
          const stoppable = node as AudioScheduledSourceNode;
          if (typeof stoppable.stop === "function") {
            try { stoppable.stop(); } catch { /* already stopped */ }
          }
          node.disconnect();
        }
      }, 520);
    },
    hit() {
      if (!enabled) return;
      const audio = context();
      if (audio.state === "suspended") void audio.resume();
      const now = audio.currentTime;
      const bus = audio.createGain();
      bus.gain.setValueAtTime(0.9, now);
      bus.connect(master!);

      const body = audio.createOscillator();
      body.type = "sine";
      body.frequency.setValueAtTime(84, now);
      body.frequency.exponentialRampToValueAtTime(34, now + 0.22);
      const bodyGain = audio.createGain();
      bodyGain.gain.setValueAtTime(0.0001, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.7, now + 0.012);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      body.connect(bodyGain).connect(bus);

      const sub = audio.createOscillator();
      sub.type = "sine";
      sub.frequency.setValueAtTime(42, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.28);
      const subGain = audio.createGain();
      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      sub.connect(subGain).connect(bus);

      const src = audio.createBufferSource();
      src.buffer = noise(0.2);
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.12);
      const nGain = audio.createGain();
      nGain.gain.setValueAtTime(0.22, now);
      nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      src.connect(filter).connect(nGain).connect(bus);

      body.start(now);
      sub.start(now);
      src.start(now);
      body.stop(now + 0.7);
      sub.stop(now + 0.7);
      src.stop(now + 0.25);
    },
    grain() {
      if (!enabled) return;
      const audio = context();
      if (audio.state === "suspended") return;
      const nowMs = performance.now();
      if (nowMs - lastGrain < 55) return;
      lastGrain = nowMs;
      const now = audio.currentTime;
      const src = audio.createBufferSource();
      src.buffer = noise(0.08);
      const filter = audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1400 + Math.random() * 2600;
      filter.Q.value = 3.2;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      src.connect(filter).connect(gain).connect(master!);
      const ping = audio.createOscillator();
      ping.type = "sine";
      ping.frequency.value = 1800 + Math.random() * 1400;
      const pingGain = audio.createGain();
      pingGain.gain.setValueAtTime(0.012, now);
      pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      ping.connect(pingGain).connect(master!);
      src.start(now);
      ping.start(now);
      src.stop(now + 0.06);
      ping.stop(now + 0.04);
    },
    dispose() {
      this.stopHum();
      void ctx?.close();
      ctx = null;
      master = null;
    },
  };
}
