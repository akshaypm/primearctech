# Swarm round 4

Draft only. No sends, no DNS, no deploy. The homepage, `/fieldrelay`, `/build-brief`, legal pages, APIs, and `DESIGN.md` are unchanged.

The falcon is the client mesh. It is not CC0. Sound is still original Web Audio and CC0 (`public/lab/swarm/SOUNDS.md`). There is no environment file to licence: the studio is a PMREM built in the page.

## Chrome

The body is `MeshStandardMaterial`, metalness 1, roughness 0.08, colour `#E8E8E8`, `envMapIntensity` 1. Tone mapping is ACES at exposure 1. The environment is a dark room (linear radiance about 0.06) plus two wide softboxes aimed at the wing reflections and a tight lamp on the beak.

`clearcoat: 1` / `clearcoatRoughness: 0.05` is not on the material. On this machine that physical permutation drops the 150k mesh to a few frames a second under SwiftShader, so the coat is a Schlick fresnel in the fragment shader (`0.42 * pow(1 - ndotv, 5)`). A real GPU can run the physical shader. These recordings cannot.

On `1440-hero.png`, bird pixels to the right of the headline (luma above 48):

| | |
| --- | --- |
| count | 150,317 |
| p10 / p50 / p90 luma | 108 / 199 / 219 |
| deep (48–100) | 8.3% |
| mid (100–180) | 28.4% |
| bright (180–235) | 63.3% |
| clipped (above 235) | 0.1% |
| orange pixels | 2,910 |

That is short of the 30–40% deep-band target. The wings are the bright mass, which matches the Blender still. The head, chest, and feather gaps are the dark part, and they are not as dark as `#2a2d31`–`#50555b` across a third of the body. Adding more horizon light to force that split washed the grooves (an earlier pass in this round moved p10 from the previous capture’s 94 up to 120). This capture keeps the grooves.

Layout at 1440×900, unchanged framing: headline right edge x=578, bird x=730–1393, y=154–864. Gap 152px, right inset 46px, top 154px, bottom 35px.

## Orange

The mask is unchanged. A texel is orange only when saturation is at least 0.55 and value at least 0.18, inside the red hue. On `falcon-mask.jpg` the median horizontal run is 3px, against 7px at saturation 0.32, about 43% of the previous width. Pixel count fell from 19,833 to 8,550. The stripe is emissive `#D8643E` at intensity 0.4. The eye stays. The upper wing is still a broken line, because the paint sits on separate UV islands. Eroding the JPEG deleted the eye, so the masks were not rebaked.

## Burst

3,000 blades on desktop, 1,200 on mobile. Hidden at rest. Each blade is a flat tapered diamond, about 2–3× the round-3 length (`scaleY` 0.26–0.36), with the same chrome env as the body at roughness 0.06 and `envMapIntensity` 1.2.

Motion, in group space, along the surface normal:

- 0.25s out, ease-out quartic
- 0.50s hang, spinning about the normal so the face sweeps the env
- 0.90s return, delayed from beak (`boundingBox.min.x`) to tail, ease-out cubic
- stretch `min(2.8, 1 + speed * 0.7)` along that axis

The cursor dissolve uses the same blade and the same overdamped spring (k=18, c=9).

`1440-pulse.png` is the hang, about 0.3–0.7s after the click. Blade pixels: 36% deep, 33% mid, 32% bright, 0.1% clipped. p10 / p50 / p90 luma 74 / 134 / 223. The outline is still a falcon (wings up, head left, tail right), not the round-3 grey cloud. It is dense. 3,000 blades cover the bird, so it reads as a shard falcon rather than a handful of separate feathers. The left edge of the burst is x=644, 66px clear of the headline.

The white ring is 120ms, additive, not tone-mapped, camera-facing, centred on the hit. The hang still is taken after it has gone. `1440-flash.png` is that frame from `swarm-1440.mp4` (about 36.6s). The ring sits on the bird.

## This machine

Chromium is SwiftShader. Desktop: reported 12.5 fps, average frame 79ms, p50 33ms, p95 365ms, max 444ms, 3,000 blades, sample 13ms. Mobile: 12.9 fps, average 68ms, p50 57ms, p95 201ms, max 304ms, 1,200 blades. `deviceScaleFactor: 2` reports dpr 1.5, so the cap holds. The recordings themselves are dpr 1, because this Chrome reports a device pixel ratio of 1. Poster is 26,732 bytes at quality 68. Reduced motion is `swarm is-still`, canvas and loader `display: none`. No page errors.

Desktop recording 44.9s. Mobile recording 13.5s.

## Critique

`hunyuan-chrome-hero.png` was not in the workspace (not under `primearc/`, not under `/opt/cursor/artifacts`, not in git). The attached still was used as the visual reference. `side-by-side.png` is round 3 against round 4, and it says so on the image.

Against that Blender still:

- Rest pose is the same bird, same framing, with dark feather gaps, a darker head and chest, a thin orange leading edge, and an orange eye. Round 3 was a near-white body with a thick stripe. The deep area is still less than a third of the bird.
- The upper orange edge is dashed. The lower edge is a thin continuous line. The eye is there.
- The click is a falcon of sharp chrome blades with white faces and grey ones, plus the flash ring in the recording. Round 3 was a soft grey cloud. The hang is still crowded.

Three passes this round: a needle ball that left the frame, horizon lights that washed the rest pose, then this capture. Stopped here.

## Kept

Loader, sound toggle, springs, one renderer, one `gsap.ticker` loop, DPR caps, the mobile GLB below 768px, the HTML headline and `/build-brief`, and the reduced-motion poster.
