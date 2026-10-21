# The Swarm prototype

Route: `/lab/swarm` on `codex/swarm-prototype`. The homepage, FieldRelay routes, `/build-brief`, legal pages, and APIs were not changed. Nothing here sends mail or changes DNS.

Preview: `npm run dev`, then open `/lab/swarm`. Sound stays off until the bottom-right toggle is pressed.

## What shipped

- A skippable ink loader. Placeholder boot lines are marked in `app/lab/swarm/engine/copy.ts`. The hairline is the real GPU/font/compile progress, not a timer, so it often reaches full before the ~3.5s type finishes.
- 32,768 desktop shards and 8,192 mobile shards. Each one is a flat-shaded diamond splinter, lit with two runtime matcaps. Orange `#D8643E` is only the interior seam.
- At rest the shards form one left-facing hound on the right of the desktop frame. Cursor movement pushes nearby shards along curl noise and an overdamped spring (about 1.2s, no overshoot). A click contracts them onto the seam and then bursts. Scroll yaws and stretches the swarm toward a placeholder next section.
- Sound is original Web Audio synthesis, CC0, documented in `public/lab/swarm/SOUNDS.md`. Nothing is downloaded.
- `prefers-reduced-motion` and a failed WebGL context both keep the same poster and skip the canvas. Poster: `public/lab/swarm/poster.webp` (12,684 bytes).

## Critique against igloo.inc

Three visual passes:

1. The first frame was almost black. ShaderMaterial was writing linear colour without encoding it back to sRGB, so the steel sat under the ink. Encoding fixed the exposure and the first brighter matcap then went too far: a flat grey fur ball.
2. A darker matcap, a slit in the coat, and a shorter fringe. The orange seam became one thread. The head was still a scribble.
3. Coat tangents were laid on the surface, and the head and snout were taken out of the outward fringe. The silhouette reads as one hound, not dots, not a noise field, and not a blob.

It still does not match igloo's polar bear. That bear is a field of separate bright icicles. This coat is brushed steel fibre: the splinters are real, but at rest they pack into a hatch, especially through the torso. The head and neck are the softest part. Mobile is thinner because it has a quarter of the shards, and you can see through the body more than on desktop. That is the main gap, and it is still in the build.

## Performance, measured here

No GPU. Chromium was ANGLE SwiftShader. `window.__SWARM__` frame gaps:

| Viewport | Shards | DPR | FPS | p50 frame | p95 frame | JS tick |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | 32,768 | 1 (cap confirmed at 1.5 with DPR 2) | ~30 | 33 ms | 45 ms | ~1 ms |
| 390×844 | 8,192 | 1 | ~6.5 | 154 ms | 304 ms | ~1 ms |

Desktop holding 33 ms with a 1 ms tick matches a 30 Hz headless vsync more than a saturated shader. This VM cannot show whether a mid laptop holds 60. The mobile page submitted the same kind of tick in about 1 ms and then waited ~150 ms for the next frame, on a smaller buffer and fewer shards. That pattern looks like headless scheduling on a narrow viewport, not a shader that is four times heavier. A phone GPU was not measured.

`npm test` passed: 27 unit tests, production `vinext build`, and the rendered-HTML checks. Log: `artifacts/swarm/test-and-build.log`.

## Other weak spots

- The desktop recording is 97 s because Playwright's WebGL readback stalls are inside the take. The mobile recording is 15.5 s. Both show the loader, the lock, a cursor sweep, and a click.
- The desktop pulse still is mid-contraction. The mobile pulse still shows the body flattened onto the seam. A separate capture at the end of the 250 ms contract reduced the hound to that seam before the burst.
- The loader still is mid-type with the hairline already full, because asset loading finished first.
- Recordings were taken with sound off. The hum, bass hit, and grains were not heard in this environment.
- The poster is a compressed settled frame. It is small and a little soft.
- Grain and vignette are CSS, not a post-process pass.
