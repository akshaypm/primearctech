# The Swarm prototype

Route: `/lab/swarm` on `codex/swarm-prototype`. The homepage, FieldRelay routes, `/build-brief`, legal pages, and APIs were not changed. Nothing here sends mail or changes DNS.

Preview: `npm run dev`, then open `/lab/swarm`. Sound stays off until the bottom-right toggle is pressed.

## What shipped

- A skippable ink loader. Placeholder boot lines are marked in `app/lab/swarm/engine/copy.ts`. The hairline is the real GPU/font/compile progress, not a timer.
- The creature is a low-poly eagle with the wings spread and the head in profile, standing in for a peregrine. The mesh is the Eagle from Quaternius Animal Pack Vol.2, CC0. Source and licence are in `public/lab/swarm/ASSETS.md`.
- 12,288 points are sampled on the surface, with extra weight on the silhouette, the head, and the wing leading edges. Each shard is a thin blade, about 1:5 to 1:6, lying along the feather flow: root to tip on the wings, head to tail on the body. Only the trailing edge and the tail lift off the surface. Mobile draws a strided 5,120 of the same points. The bake is `public/lab/swarm/falcon.bin` (589,840 bytes).
- The shards are polished chrome. Albedo runs from mineral white `#F1EFE9` to light steel `#C9CED2`. Reflections come from three.js `RoomEnvironment`, pulled toward a cool neutral, with small specular peaks and no bloom pass. Crevices darken toward a soft grey, not black. About 1.1% of the shards are orange `#D8643E`: the wing leading edges and a single eye. The background stays ink `#111315`, with a subtle radial lift to `#191C1F` behind the bird.
- Desktop framing keeps the eagle in the right half (mesh coverage about x 50–90%, y 19–74%). Nothing sits in the headline column. On a 390-wide screen the eagle fills the top half, about 86% of the width, wings spread, beak to the left. Cursor movement lifts nearby feathers. A click contracts them and then bursts. Idle motion is a slow breath plus a wing settle about every six seconds. Springs are unchanged (`SPRING_K` 18, `SPRING_C` 9).
- Sound is original Web Audio synthesis, CC0, documented in `public/lab/swarm/SOUNDS.md`. Nothing is downloaded.
- `prefers-reduced-motion` and a failed WebGL context both keep the same poster and skip the canvas. Poster: `public/lab/swarm/poster.webp` (21,034 bytes).

## Silhouette and contrast

The settled mesh, drawn as a pure black silhouette, reads as a bird of prey: hooked beak to the left, two swept wings, tail between them. Those tests are `artifacts/swarm/1440-silhouette.png` and `artifacts/swarm/390-silhouette.png`.

On the lit frames the same pose is ice-white on ink. Measured relative luminance of creature pixels against a background sample: about 150× at 1440×900 (bird 0.67, ink 0.0044) and about 89× at 390×844 (bird 0.62, ink 0.007). Both clear the 4× floor. The headline, mineral white on the ink column, measured about 14.7:1 at desktop and 14.2:1 at 390. The bird does not cross into that column.

## Performance, measured here

No GPU. Chromium was ANGLE SwiftShader. `window.__SWARM__` frame gaps during the recordings:

| Viewport | Shards | DPR | FPS | p50 frame | p95 frame | avg frame |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | 12,288 | 1 | ~18 | 33 ms | 344 ms | 63 ms |
| 390×844 | 5,120 | 1 | ~6 | 185 ms | 327 ms | 146 ms |

A second load with `deviceScaleFactor: 2` reported DPR 1.5 and 12,288 shards, so the cap is in force. The recording itself ran at DPR 1. The spikes are Playwright readback on SwiftShader. This VM cannot show whether a laptop holds 60. Both faces of each feather are drawn, which costs more on the small grid than the previous single-sided icicles.

`npm test` passed: 26 unit tests, the production `vinext build`, and the rendered-HTML checks. Log: `artifacts/swarm/test-and-build.log`.

## Other weak spots

- The desktop recording is 77.5 s and the mobile recording is 16.2 s. Both show the loader, the lock, a cursor sweep, and a click. The pulse stills are mid-contraction.
- The beak is a small hook. It reads on the desktop silhouette and on the lit desktop frame. At 390 it is easier to lose in the head feathers.
- The wing tips are low-poly and a little ragged. That is the Quaternius mesh, not a flame of orange shards.
- Recordings were taken with sound off. The hum, bass hit, and grains were not heard in this environment.
- The poster is a compressed settled frame. It is within the 200KB cap.
- Grain and vignette are CSS, not a post-process pass. There is no bloom.
