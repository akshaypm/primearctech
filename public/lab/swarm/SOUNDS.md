# Swarm sounds

The sounds in `/lab/swarm` were generated with Krea under the client's Krea Business plan on 21 Oct 2026. The models were ElevenLabs Music v2.5 and ByteDance Seed Audio 1.0, accessed through Krea. Each cue ships as `.ogg` (Opus) and `.mp3` in `public/lab/swarm/audio/`. Provenance and the licence terms are in `audio/LICENSE-NOTE.md`. Generation, levels, and the loop seam are in `audio/NOTES.md`.

Playback is one Web Audio `AudioContext`. The page prefers `.ogg` when `canPlayType` accepts `audio/ogg; codecs="opus"` or `audio/ogg`, and falls back to `.mp3`. Nothing is fetched until the visitor turns sound on. A remembered on choice (`localStorage` key `primearc-swarm-sound`) does not play until a gesture.

| Moment | File | Behaviour |
| --- | --- | --- |
| Bed | `ambient-loop` | Looping `AudioBufferSourceNode` (`loop = true`, not an `<audio loop>` element). Fades in over 2.5 s and out over 0.6 s. About −6 dB under the SFX bus. Ducks about 4 dB for 0.8 s when shatter plays. The context suspends while the tab is hidden. |
| Falcon lock | `boot-stinger` | If sound is already on during the loader, the impact (the peak sample in the decoded buffer, about 3.4 s) is aligned to the lock frame. If sound is turned on after that frame, the stinger does not play. |
| Click burst | `shatter` | Starts with the burst. A shatter that is already playing fades out over 50 ms. Detune is ±40 cents. |
| Return | `reassemble` | Scheduled so the file ends as the beak-to-tail return completes. |
| Cursor dissolve | `hover` | Plays when the dissolve begins, at most once every 700 ms, about −3 dB under the SFX bus, detune ±60 cents. No hover sound on touch, and none when `prefers-reduced-motion` is set. |

Stinger, shatter, and reassemble enter the SFX bus at unity. Hover is the quieter one-shot above. The SFX bus runs through a compressor (threshold −6 dB, ratio 4) into a master gain. The bed bypasses that compressor. While the toggle is off, nothing plays.
