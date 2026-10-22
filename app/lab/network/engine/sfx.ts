/**
 * Hook for later per-scene positional SFX.
 * M1 records the beat and the listener position on the existing audio clock.
 * It does not load a second AudioContext.
 */

export type SfxAudio = {
  mark: (name: string, detail?: string) => void;
};

export type SceneSfxCall = {
  beat: string;
  x: number;
  y: number;
  z: number;
};

export type SceneSfx = {
  at: (beat: string, position: { x: number; y: number; z: number }) => void;
  calls: SceneSfxCall[];
};

export function createSceneSfx(audio: SfxAudio): SceneSfx {
  const calls: SceneSfxCall[] = [];
  return {
    calls,
    at(beat, position) {
      const call = { beat, x: position.x, y: position.y, z: position.z };
      calls.push(call);
      audio.mark("scene-sfx", `${beat} ${call.x.toFixed(2)},${call.y.toFixed(2)},${call.z.toFixed(2)}`);
    },
  };
}
