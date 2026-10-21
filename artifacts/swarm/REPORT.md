# Swarm round 5

Draft only. No sends, no DNS, no deploy. The homepage, `/fieldrelay`, `/build-brief`, legal pages, APIs, and `DESIGN.md` are unchanged.

The falcon is the client mesh. It is not CC0. Sound is still original Web Audio and CC0 (`public/lab/swarm/SOUNDS.md`). The studio is a PMREM built in the page.

## Chrome

The body is `MeshStandardMaterial`, metalness 1, roughness 0.08, colour `#E8E8E8`, `envMapIntensity` 1. Tone mapping is ACES at exposure 1. The room is darker on the floor than on the walls. Two narrow softboxes sit off the mean wing reflection, so neighbouring feathers split between the lamp and the dark floor. A small lamp still catches the beak.

`clearcoat: 1` is not on the material. On this machine that physical permutation drops the mesh to a few frames a second under SwiftShader, so the coat is a Schlick fresnel in the fragment shader (`0.42 * pow(1 - ndotv, 5)`).

On `1440-hero.png`, bird pixels to the right of x=700 with luma above 28, excluding pixels that match the background:

| | |
| --- | --- |
| count | 153,452 |
| p10 / p50 / p90 luma | 63 / 104 / 211 |
| deep (luma 28–85, the `#2a2d31`–`#55555b` band) | 35.2% |
| mid (85–170) | 41.4% |
| bright (170–235) | 23.2% |
| clipped (above 235) | 0.1% |
| orange pixels | 441 |

35% is the top of the 25–35% aim. Round 4 was 8% deep, p50 luma 199, and the wings were a white mass. The wings now carry dark feathers next to bright ones. The head and chest stay darker than the wings.

Layout at 1440×900: headline right edge x=578, bird x=738–1408, y=154–864. Gap 160px, right inset 31px, top 154px, bottom 35px. The right inset is tighter than round 4 because the outer feather tips now clear the luma threshold.

## Orange

The wing paint is no longer the texture mask. The mask breaks across UV islands, so the leading edge is a world-space band on the vertex position. The raised wing uses the front of the wing (low local x) with a smoothstep about 1.5% of a 2.81 wingspan. The extended wing uses the top rim of the rearward wing (local y against x). The eye stays on the mask, and only on the head (`x < -0.22`, small span), so the old dashed wing texels do not come back. Emissive `#D8643E` at intensity 0.4 is unchanged.

## Burst

2,000 blades on desktop, 900 on mobile. Hidden at rest. Width scale is 0.28, down from 0.40. Radial travel is 0.6× the round-4 lift (about 0.08–0.13). Length is `scaleY` 0.18–0.25. At the first hang the blades still pointed straight out and the outline was a cloud, because half the blade length was larger than the travel. They now lie mostly along the wing, with a small radial tilt, and the mesh stays up.

The mesh does not fade globally. A 48³ grid marks the home cell of each blade that has moved more than 0.03, and the fragment shader discards only those cells. The cursor dissolve is the existing local hole. It does not set that grid and it does not hide the rest of the bird. `1440-scatter.png` is that local dissolve.

`1440-pulse.png` is the hang, about 0.3–0.7s after the click. The outline is still a falcon: wings up, head left, tail right, talons below. The white ring is 120ms, additive, camera-facing. `1440-flash.png` is that frame from the recording, about 35.8s in.

## Scrollbar

The hero route was drawing a scrollbar because `.swarm-hero` (100vh) plus `.swarm-next` (78vh) is taller than the viewport, and `scrollbar-color` forced a classic track. At 1440 the content width was 1425. `html:has(.swarm)` now uses `scrollbar-width: none`, and the hero is clamped to 100vh. Wheel scroll still reaches the next section, which is what fades the bird. After the change, `clientWidth` is 1440 and matches `innerWidth`. The rightmost pixels of `1440-hero.png` are the page background, not a track.

## This machine

Chromium is SwiftShader. Desktop: reported 26.8 fps, average frame 43ms, p50 33ms, p95 140ms, max 315ms, 2,000 blades, sample 19ms. Mobile: 11.2 fps, average 73ms, p50 78ms, p95 183ms, max 300ms, 900 blades. `deviceScaleFactor: 2` reports dpr 1.5, so the cap holds. Recordings are dpr 1. Poster is 27,534 bytes at quality 68. Reduced motion is `swarm is-still`, canvas and loader `display: none`. No page errors.

Desktop recording 46.8s. Mobile recording 14.0s. Playwright padded both videos with a grey strip (22×14 desktop, 6×13 mobile). The mp4 and webm are cropped to the page. The stills are the viewport and were not cropped.

## Critique

The attached Blender render was not on disk. The prompt named `/workspace/primearc/creature/3d/renders/hunyuan-chrome-hero.png`, and that path is not in the workspace, not in git, and not under `/opt/cursor/artifacts`. `side-by-side.png` is round 4 against round 5, and the labels say so. There is no `target.png`.

Against the Blender still, from memory of the attachment:

- Rest pose is the same bird and the same framing. The wings are no longer a flat white. Dark feathers sit between bright ones. The body is darker than the wings. Deep share is 35%, at the top of the asked range.
- Both leading edges are one line. The eye is there. The old dashed mask is not used on the wings.
- The hang reads as a falcon made of separated blades. The mesh stays, with holes only where a blade has left. The cursor dissolve stays local.

Three lighting passes this round: wide boxes left the wings white, a darker floor crushed the bird to about 59% deep, then this capture. Stopped here.

## Kept

Loader, sound toggle, springs, one renderer, one `gsap.ticker` loop, DPR caps, the mobile GLB below 768px, the HTML headline and `/build-brief`, and the reduced-motion poster.
