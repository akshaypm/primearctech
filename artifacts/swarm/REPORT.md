# The Swarm, round 3

The hero is the client falcon mesh, not a generated creature. Desktop loads `falcon-web.glb` (150,000 triangles, Draco). Below 768px the page loads `falcon-mobile.glb` (40,000 triangles). At rest the mesh is polished chrome. The blades are hidden until the cursor, the click, or the lock.

## Rest pose, against the render

The attached Blender still was not on disk. `primearc/creature/3d/renders/hunyuan-chrome-hero.png` and `primearc/creature/ref3d-C-padded.png` were not in the workspace, so there is no side-by-side file. The comparison below is against that render as it was shown with the brief: black ground, bird on the right, three-quarter side, bright chrome, orange only on the wing leading edges and the eye.

Three passes:

1. The first frame was the right animal and the orange mask landed, but the wingtips touched the top edge, the head crossed the headline, and the lights clipped most of the metal to white.
2. The bird moved into the right half and shrank until every edge had more than 6% of margin. Exposure and the key light came down so the feather grooves stay grey metal. The upper wing faces are still hotter than the Blender frame. They read as chrome, not as a flat white card.
3. On a 390px screen the same mesh was too wide and sat on the headline. It is smaller now and sits entirely in the top half.

Desktop rest, measured on `1440-hero.png` with the headline and the sound label left out of the bounds: left edge at 51% of the width, right margin 10.8%, top 17.1%, bottom 12.3%. Mean linear luminance of the bird is 0.599, against 0.0078 in the empty ground beside it, about 77 times. The phone bird, measured above the headline, has margins of 13.1% left, 13.8% right, and 6.9% top, and its lowest pixel is at 48.8% of the height. Its luminance ratio is about 82 times. Headline ink is `#111315` and the type is `#f1efe9`, about 16:1.

Orange is not painted by hand. The GLB colour JPEG is a mask. A texel becomes `#D8643E` only when it is a saturated orange. Grey metal stays `#E8E8E8`.

## What the interaction does

After the boot readout, about 8,000 blades on desktop and 3,000 on a phone stream in from off screen and land on the surface. The mesh fades in as they arrive. The lock bass hit still fires as the ease crosses 0.9, and only if sound is on.

At rest the blade count is zero. The mesh idles with a slow hover, a very small wing-root twist in the vertex shader, and a small camera drift.

The cursor opens a hole in the mesh. The hole is the cursor's world distance, and its size scales with the bird so a phone does not dissolve the whole animal. The rim of that hole is a thin orange band. Blades inside the radius kick off the surface and drift on a swirl, then the same overdamped spring (k = 18, c = 9, about 1.2s, no overshoot) brings them home and the mesh closes.

A click hides the mesh and holds every blade in the shape of the bird for 0.6s, then the spring reassembles it. The click plays the bass hit when sound is on. Touch still ripples instead of bursting.

## Performance, measured here

No GPU. Chromium was ANGLE SwiftShader. These are the frame gaps in `window.__SWARM__` during the recordings, which include the cursor sweep and the click. The recording itself ran at DPR 1. A separate load with `deviceScaleFactor: 2` reported DPR 1.5 and 8,000 blades, so the cap is in force. The phone cap is 1.25.

| Viewport | Mesh | Blades | DPR | FPS | p50 | p95 | avg |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | 150,000 tris | 8,000, hidden at rest | 1 | ~23 | 33 ms | 114 ms | 41 ms |
| 390×844 | 40,000 tris | 3,000, hidden at rest | 1 | ~9 | 64 ms | 225 ms | 87 ms |

This machine does not hold 60. The desktop median is a frame every 33 ms, with a long tail when the click turns all 8,000 blades on. The phone is slower than that. Sampling the blades took about 21 ms on desktop and 8 ms on the phone, once, during the loader.

`npm test` passed: 26 unit tests, the production `vinext build`, and the rendered-HTML checks. Log: `artifacts/swarm/test-and-build.log`. Poster: `public/lab/swarm/poster.webp` (32,056 bytes).

## Licence

The falcon is client-supplied. `public/lab/swarm/ASSETS.md` does not call it CC0. The page does not download an HDRI. Reflections are a PMREM of three.js `RoomEnvironment`. Sound is still original Web Audio and CC0, in `public/lab/swarm/SOUNDS.md`.

The homepage, FieldRelay, `/build-brief`, legal pages, and APIs were not changed. Nothing here sends mail or changes DNS.
