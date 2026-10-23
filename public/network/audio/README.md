# PrimeArc clay sound pack (v1, 23 Oct 2026 IST)

Source: Krea Seed Audio (bytedance/seed-audio-1.0), 16 generations, processed in `work/build.py`
(trim → HP filter → fades → equal-power loop crossfades → R128 normalise → 4x-oversampled limiter at -4 dBTP → Opus/MP3).
Raw takes in `raw/`, job ids in `work/jobs.tsv`, analysis plots in `work/png/`.

## Hook names
`handoff/INTEGRATION.md` contains **no** sound/cue hooks. The real names come from the sound engine
`app/lab/swarm/engine/audio.ts` on `akshaypm/primearctech@codex/swarm-prototype`:
`AUDIO_NAMES = ["ambient-loop","boot-stinger","shatter","reassemble","hover"]`. Those five files keep the same names, so they drop in
(copy `*.ogg` + `*.mp3` to `public/lab/swarm/audio/`). The engine requests `.ogg`, so the Opus streams also come in an Ogg container.
- `boot-stinger`: the engine aligns the loudest sample (`bufferPeakTime`) to the lock. That sample is the clay "thock" at **3.513 s**, so the loader resolves at 3.5 s.
- `shatter` / `reassemble`: reused for the layers stack sliding apart and back together.
- New cues need new hooks: `click`, `tock`, `drag-loop`, `roll-loop`, `pulse`, `dive`, `pebbles`, `book-close` (see manifest.json).

## Mix rules
- Sound is OFF by default, with a visible toggle. Nothing is fetched until the toggle is ON *and* the user has made a gesture.
- Ambient starts on the first gesture and fades in over 2.5 s. It ducks by 4 dB under one-shots.
- Files: UI -24 LUFS, ambient -30 LUFS, one-shots -20 LUFS, all ≤ -3.6 dBTP after encode. Runtime gains in the manifest are ≤ 1.0, so nothing is ever loud. Keep the master compressor.
- Loops: decode into an AudioBuffer with `loop=true`. Prefer webm/ogg. For MP3, set loopStart = 576/sr (the engine already does this).
- Debounce hover to ≥120 ms (the engine uses 700 ms). Randomise detune by ±60 cents on hover, click and tock.

## Krea spend (audio)
Balance went from 31066.93 to 30866.04, so **200.89 credits** were spent (cap 300). Seed Audio bills about 1.84 credits per second of output, not a flat rate per clip.
16 clips were billed (12 first takes plus 4 variants). A 60 s ambient variant was cancelled before completion and was not charged.
