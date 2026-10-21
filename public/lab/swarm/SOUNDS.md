# Swarm sounds

Every sound in `/lab/swarm` is synthesized in the browser with the Web Audio API when it plays. No audio files are downloaded, and no samples from freesound.org or any other library are used.

| Moment | Source | Licence |
| --- | --- | --- |
| Loader hum | `app/lab/swarm/engine/audio.ts` `startHum`. Two detuned sine oscillators (46 Hz and 46.7 Hz), a quiet filtered triangle at 92 Hz, and a looping noise buffer through a lowpass at 180 Hz. | Original synthesis. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). |
| Lock and click bass hit | `audio.ts` `hit`. A sine dropping from 84 Hz to 34 Hz, a sub sine from 42 Hz to 28 Hz, and a short lowpassed noise transient. | Original synthesis. CC0 1.0. |
| Cursor disturbance ticks | `audio.ts` `grain`. 45 ms noise grains through a bandpass between about 1.4 kHz and 4 kHz, plus a very quiet sine partial. | Original synthesis. CC0 1.0. |

Sound is off until the visitor chooses SOUND ON. The choice is stored in `localStorage` under `primearc-swarm-sound`.
