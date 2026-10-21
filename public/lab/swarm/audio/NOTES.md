# PrimeArc hero sound pack: notes

All times are IST (UTC+5:30), 21 Oct 2026. Source generations are in `raw/`. The build script is `work/build.py`, the measurement scripts are `work/measure.py` and `work/seam.py`, and the mastered WAVs are in `work/*.wav`.
Each sound ships as `.mp3` (LAME 128 kbps CBR, 44.1 kHz) and `.ogg` (Opus 96 kbps VBR, 48 kHz). The pack is **2,174,819 bytes** in total (10 audio files), under the 2.5 MB cap.
Per-file waveform and log-spectrogram PNGs are in `png/`. The contact sheet is `sheet.png`.

## Budget (Krea compute units)

| | credits |
|---|---|
| Balance before | 32,476.89 |
| Job 1: Seed Audio, shatter SFX | 4.63 |
| Job 2: ElevenLabs Music v2.5, 80 s ambient | 888.89 |
| Job 3: ElevenLabs Music v2.5, 6 s stinger | 444.44 |
| **Total spent** | **1,337.96** |
| Balance after | 31,138.93 |

**The 1,300-credit cap was exceeded by about 38 credits.** For every audio model, `preflight: true` returned `compute_units: null`, so no quote was available ahead of time. I measured each job's cost from the `get_balance` delta and ran the jobs one at a time. I had assumed music pricing was linear in length (about 11.1 credits/s after the 80 s job), which predicted roughly 67 credits for the 6 s stinger. The actual charge was 444.44, so there is clearly a large per-job minimum or floor. I stopped generating as soon as I saw that. Because of it, there is only one ambient take (not two), and reassemble and hover are derived from existing material instead of being generated. The Krea Agent was not used. Note that the balance is workspace-wide, so another user's concurrent usage would show up in these deltas. The before and after values match the sum of the three deltas exactly.

Models available (list_models, audio): elevenlabs/music, music-v2, music-v2.5, elevenlabs/tts, bytedance/seed-audio-1.0. There is no dedicated SFX model. Seed Audio is described as "speech, dialogue, and sound design", so I used it for the SFX.

## Final levels (measured on the shipped files; SFX measured with 3 s of trailing silence for short-term)

| file | dur (s) | integrated LUFS | max short-term LUFS | true peak dBTP | size (B) |
|---|---|---|---|---|---|
| ambient-loop.mp3 | 66.04* | -22.5 | -21.7 | -10.9 | 1,057,061 |
| ambient-loop.ogg | 66.00 | -22.0 | -21.2 | -10.7 | 869,380 |
| boot-stinger.mp3 | 5.59* | -16.4 | -16.4 | -3.4 | 89,904 |
| boot-stinger.ogg | 5.55 | -16.0 | -16.0 | -2.8 | 66,651 |
| shatter.mp3 | 1.44* | -14.5 | -18.3 | -4.5 | 23,448 |
| shatter.ogg | 1.41 | -14.2 | -18.0 | -3.9 | 14,837 |
| reassemble.mp3 | 1.07* | -13.9 | -18.6 | -4.2 | 17,597 |
| reassemble.ogg | 1.03 | -13.2 | -18.0 | -3.0 | 12,159 |
| hover.mp3 | 0.78* | -17.1 | -24.3 | -4.3 | 12,999 |
| hover.ogg | 0.76 | -16.8 | -24.0 | -4.1 | 10,783 |

\* The MP3 container duration includes LAME encoder delay and padding. The audio content is the same length as the OGG.
There are no clipped samples in any master. I mastered the SFX to a -4.2 dBTP ceiling so that the lossy encodes still land at or below -3 dBTP.

---

## 1. ambient-loop (66.0 s)
- **Approach:** generated. One ElevenLabs Music v2.5 take, then a seamless loop built in numpy (not a raw cut).
- **Model:** `elevenlabs/music-v2.5`, `music_length_ms: 80000`, `force_instrumental: true`. Job `52c72184-c4b6-4590-b4c4-85a4e9169740`. **888.89 credits.**
- **Prompt:** "Instrumental cinematic dark ambient soundscape for a premium sci-fi film title sequence. Deep, steady low sub-bass drone as the foundation, held throughout. Slowly evolving glassy and metallic shimmer pads, like light gliding across polished chrome, swelling and receding in long phrases. A faint, high crystalline texture floating above, delicate and airy. Slow pulse feel around 64 BPM, but absolutely no percussion, no drums, no beats, no risers, no vocals, no melody hooks. Restrained, minimal, expensive, cold and elegant, like a Hollywood sci-fi score cue. Constant even intensity from start to end with no intro build and no ending, so it can loop seamlessly."
- **Processing:** Trimmed the first 0.30 s, then took the 0.30–69.30 s region. Applied a 3.0 s equal-power (sin/cos) crossfade: the last 3 s fade out over the first 3 s, and the result is 66.0 s long. Applied linear gain to -22.0 LUFS integrated. There is no limiter, so the loop stays sample-continuous.
- **Seam check (numeric):** The wrap step |x[last]→x[0]| is 0.0020 in the WAV, 0.0052 in the decoded MP3, and 0.0054 in the decoded OGG. For comparison, the body's 99.9th-percentile sample-to-sample step is 0.0163, and its maximum is 0.035. The 10 ms RMS change across the seam is 1.7–1.9 dB, against a body p99 of about 2.5 dB and a body p99.9 of 3.1 dB. **There is no discontinuity spike, and the seam is statistically indistinguishable from the body.**
- **Analysis:** The raw take had a loudness range of only 0.9 LU (very even), and its per-0.5 s RMS stayed within ±0.6 dB. It contains no transients: there are zero 10 ms jumps above 6 dB. The spectrogram shows no percussion and no vocal formants, only sustained low partials plus slow high-band swells.
- **Issues/caveats:** (a) This is a single take with no A/B. (b) The sub energy is strong. It sounds fine on headphones but may read as rumble on cheap laptop speakers, so consider a high-shelf or low-cut at runtime if needed. (c) **MP3 looping in browsers is not gapless** because of encoder delay. Loop the `.ogg` through Web Audio (`AudioBufferSourceNode.loop = true`). If you must use the MP3, trim the encoder delay with `loopStart` and `loopEnd`. HTML `<audio loop>` will gap with either format.

## 2. boot-stinger (5.55 s)
- **Approach:** cut and redesigned from a generated music piece. The generated take placed the impact at 0.55 s with almost no rise, so I built the rise from the take itself. The first 3.4 s is the post-impact ring tail **reversed**: a reverse swell, high-passed at 60 Hz, faded in on a 2.2 s exponential curve and set at -5 dB. It joins with a 12 ms crossfade into the original impact plus 2.15 s of tail, with a 0.9 s fade-out. The impact lands at about 3.40 s.
- **Model:** `elevenlabs/music-v2.5`, `music_length_ms: 6000`, `force_instrumental: true`. Job `f9d0e157-f6dc-4941-ab71-7bf43ddf6cf5`. **444.44 credits.**
- **Prompt:** "Instrumental cinematic sci-fi logo stinger, six seconds. A restrained rising tension of glassy metallic shimmer and a low sub-bass swell building for about four seconds, then resolving into one single deep, clean, powerful low impact boom with a short polished metallic ring tail. Premium Hollywood sci-fi score sound design, cold and elegant. No drums, no drum kit, no EDM riser, no whoosh, no vocals, no melody."
- **Levels:** -16.0 LUFS integrated (OGG) and -16.4 (MP3), with a true peak of -2.8 / -3.4 dBTP.
- **Issues:** The generated impact is not perfectly "one clean hit". Its tail has several smaller re-hits or rumble pulses, with onsets at about +0.9, +1.25 and +1.5 s after the impact. Because the rise is that same tail reversed, faint reversed flutters also appear between 1.3 and 3.0 s. On the spectrogram they show up as broadband vertical streaks in the low band. Nothing tonal or drum-kit-like is visible, but on good speakers it could read as a slightly "grainy" or pulsing swell rather than a smooth one. The rise is also mostly low-mid. It lacks the glassy high shimmer the prompt asked for.

## 3. shatter (1.40 s)
- **Approach:** generated directly with Seed Audio (sound design), then trimmed.
- **Model:** `bytedance/seed-audio-1.0`. Job `9b2b3b1c-716e-4679-9544-bb6a62544d2f`. **4.63 credits.** The raw take is 2.56 s.
- **Prompt:** "Sound design only, no speech, no music, no voice. A single crisp cinematic shatter: a fast cascade of thin polished chrome blades and fine glass shards tinkling apart, layered over one deep, clean sub-bass impact underneath. Very short, about one second, quick natural decay into silence. Premium Hollywood sci-fi foley, clean studio recording, no reverb wash, no whoosh, no drums."
- **Processing:** Trimmed to 1.40 s from the onset. Applied a 6 ms fade-in and a 0.55 s curved decay fade, plus an 8 ms end fade. Normalised to -18.0 LUFS max short-term with a true-peak-safe limiter.
- **Analysis:** The low band (<100 Hz) carries real energy: RMS -22 dB against -21 dB full-band, so the sub hit is present. The take is a cascade of about 6 tinkle onsets over 1.1 s. No speech or vocals are visible.
- **Issues:** The source MP3 from Seed Audio is band-limited at about 16 kHz, so the top "air" sparkle is missing. The cascade is fairly dense and "foley" rather than hyper-polished. The attack is deliberately hard: the first 10 ms sits at -14.7 dB.

## 4. reassemble (1.02 s)
- **Approach:** **derived, not generated** (budget). It is the shatter take reversed (0.02–1.45 s), pitched up by about 5.8 semitones with `asetrate` ×1.4 (which also shortens it to 1.02 s), high-passed at 120 Hz, given a 0.35 s curved fade-in, and finished with a 35 ms end fade.
- **Model/credits:** no new generation. It reuses Seed Audio job `9b2b3b1c…` (0 extra credits).
- **Levels:** -18.0 LUFS max short-term and -3.0 dBTP (OGG). The MP3 is -18.6 and -4.2.
- **Issues:** The pitch-up makes it obviously related to the shatter, which is thematically good (shatter then reverse). However, the reversed cascade has a slightly "chattery" texture, and the ending lands on the reversed attack with only a 35 ms fade, so it reads as a sharp "lock" click rather than a soft resolve. The last 10 ms sits at -23 dB. There is no tonal resolution.

## 5. hover (0.75 s)
- **Approach:** **derived, not generated** (budget). The base is the ambient take (20.0–20.75 s), double high-passed at 2.5 kHz and low-passed at 12 kHz, which isolates the glassy and crystalline layer. On top is the shatter take's tail (1.0–1.75 s), pitched ×1.25, high-passed at 3 kHz, and mixed at -12 dB for a faint metallic glint. The envelope is a 180 ms curved fade-in and a 400 ms curved fade-out.
- **Model/credits:** no new generation. It reuses the ambient and shatter jobs (0 extra credits).
- **Levels:** **-24.0 LUFS max short-term (a deliberate 6 dB below the -18 SFX target)** and -4.1 dBTP. The brief asks for hover to be "very quiet / non-fatiguing when repeated", and at -18 it sat as loud as the shatter. If you want strict -18, apply +6 dB at runtime or re-run `work/build.py` with `target=-18`.
- **Issues:** It is tonal (stable horizontal partials are visible in the spectrogram) and has soft edges, which suits repetition. Because it comes from the ambient bed, it shares that pitch centre: good for coherence, but it can blend into the drone when the ambient is playing loud. Apply 60–120 ms of retrigger debouncing in JS.

---

## Integration tips
- Sound is off by default. Create the `AudioContext` on the user's toggle gesture, then decode all files up front (about 2.2 MB total, or about 1 MB without the ambient).
- Prefer `.ogg` (Opus) and use `.mp3` as the Safari/old-browser fallback.
- Suggested runtime bus gains: ambient 0.6–0.8, stinger 1.0, shatter 0.8, reassemble 0.7, hover 0.35–0.5. Duck the ambient by about 4 dB for 1.5 s on the stinger and shatter.
