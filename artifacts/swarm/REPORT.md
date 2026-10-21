# The Swarm prototype

Route: `/lab/swarm` on `codex/swarm-prototype`. The homepage, FieldRelay routes, `/build-brief`, legal pages, and APIs were not changed. Nothing here sends mail or changes DNS.

Preview: `npm run dev`, then open `/lab/swarm`. Sound stays off until the bottom-right toggle is pressed.

## What shipped

- A skippable ink loader. Placeholder boot lines are marked in `app/lab/swarm/engine/copy.ts`. The hairline is the real GPU/font/compile progress, not a timer.
- The creature is a rough-legged buzzard, *Buteo lagopus*, standing in for a peregrine: wings half raised, perch removed. The scan is CC0. Source, Zenodo file, and licence are in `public/lab/swarm/ASSETS.md`.
- 12,288 points were sampled by surface area, with extra weight on the head, the beak, and creases. Positions and smoothed outward normals are baked to `public/lab/swarm/falcon.bin` (393,232 bytes). Mobile draws a strided 5,120 of the same points. Each shard is a flat-shaded icicle with a nearly square section, lit by one key from the upper left and a dim rim from behind. Faces stay near black. Edges catch mineral white `#F1EFE9`. About 4% of the shards, along the spine and the wing edge, are orange `#D8643E`.
- At rest the hawk sits in the right half of the desktop frame, beak toward the headline, camera a little below the body. On a 390-wide screen it sits in the top band, fully in frame, with the headline underneath. Cursor movement pushes nearby shards along curl noise and an overdamped spring (about 1.2s, no overshoot). A click contracts them onto the seam and then bursts. Idle motion is a slow breath plus a wing settle about every six seconds.
- Sound is original Web Audio synthesis, CC0, documented in `public/lab/swarm/SOUNDS.md`. Nothing is downloaded.
- `prefers-reduced-motion` and a failed WebGL context both keep the same poster and skip the canvas. Poster: `public/lab/swarm/poster.webp` (41,504 bytes).

## Critique against igloo.inc

Three passes on stills, compared with the polar bear on igloo.inc:

1. Shards grown straight out of the surface at roughly three times the old length turned the wing into a comb and the head into a starburst. A points-only render of the same bake is obviously a hawk. The spikes were not.
2. Shorter icicles, a wider tilt so neighbours separate, darker faces, and a tight mineral rim. The beak, the raised wing, the tail, and the feet came back. Ink shows between facets. Orange reads as a line of hot shards along the back and the wing, not a stripe painted through the body.
3. Head shards shortened again. The skull is still the soft part: a cluster of crystals, not a portrait. The rest of the bird holds.

It is a hawk built from separate steel shards. It is not igloo's bear. That bear is a fat volume, so long crystals can stand off it and stay an animal. This wing is a thin sheet. Crystals long enough to match that bear leave the silhouette, which is why the extrusion is about 1.6× the previous hound uniform (`uShard` 0.15 desktop, 0.17 mobile, against the old 0.094) rather than the 3–5× that was asked for. Girth and tilt do the work of making each shard a facet instead of a hair.

## Performance, measured here

No GPU. Chromium was ANGLE SwiftShader. `window.__SWARM__` frame gaps during the recordings:

| Viewport | Shards | DPR | FPS | p50 frame | p95 frame | avg frame |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | 12,288 | 1 | ~15 | 33 ms | 456 ms | 80 ms |
| 390×844 | 5,120 | 1 | ~10 | 95 ms | 209 ms | 90 ms |

A second load with `deviceScaleFactor: 2` reported DPR 1.5 and 12,288 shards, so the cap is in force. The recording itself ran at DPR 1. The p50 of 33 ms with p95 spikes near 450 ms is Playwright readback on SwiftShader, not a steady shader cost. Separate critique loads measured the JS tick at about 0.4 ms desktop and 0.3 ms mobile. This VM cannot show whether a laptop holds 60.

`npm test` passed: 26 unit tests, the production `vinext build`, and the rendered-HTML checks. Log: `artifacts/swarm/test-and-build.log`.

## Other weak spots

- The desktop recording is 37.1 s and the mobile recording is 12.6 s. Both show the loader, the lock, a cursor sweep, and a click. The pulse stills are mid-contraction.
- The head is the least convincing part of the sculpture. The wing edge is clearer than the beak.
- Recordings were taken with sound off. The hum, bass hit, and grains were not heard in this environment.
- The poster is a compressed settled frame. It is within the 200KB cap and a little soft.
- Grain and vignette are CSS, not a post-process pass.
