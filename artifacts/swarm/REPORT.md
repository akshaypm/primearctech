# Swarm round 6

Draft only. Chrome lighting, burst timing, and blade counts are unchanged. 2,000 desktop blades, 900 mobile.

## Orange line

The wing edge is no longer chrome with a tint. Where the line is, the fragment is base `#D8643E`, emissive `#D8643E` at 1.15, roughness 0.3, metalness 0. The fresnel coat is off on those pixels. The stroke is one continuous band, 1.5% of the 2.814 wingspan from edge to edge.

On `1440-rest.png` the bright core of the extended wing is 8px median, 12px at the 90th percentile. Hot pixels (red above 170 and clearly warmer than green and blue) average rgb 221, 137, 101 on desktop and 213, 132, 97 at 390. `#D8643E` is 216, 100, 62. ACES plus the diffuse lobe lifts it a little. It reads orange on both stills.

## Eye

The 390 eye was a few mask texels and they were not landing. Both eyes are now small discs in mesh space, the same centers on both GLBs. `1440-rest.png` and `390-rest.png` each show one orange dot on the head. The far eye stays on the other side of the head.

## Dissolve

The cursor front no longer mixes a band of the lighting to orange. The hole is the same. The tint is an emissive hairline on the cut, about 2px, and it fades over 150ms after the front stops. Blades are the same chrome material as before.

`1440-dissolve.png` and `390-dissolve.png` are the local hole with the blades up. There is no orange coil on the body. `1440-burst.png` and `390-burst.png` keep the orange on the wing edge and the eye. The blades stay grey.

## This machine

Chromium is SwiftShader. Desktop: 30 fps, average frame 41ms, p50 33ms, p95 123ms, max 205ms, 2,000 blades. Mobile: 11 fps, average 72ms, p50 71ms, p95 210ms, max 339ms, 900 blades. `deviceScaleFactor: 2` reports dpr 1.5. Poster is 27,558 bytes at quality 68. Reduced motion is `swarm is-still`. No page errors. The right edge of `1440-rest.png` is the page background (rgb 18, 20, 22).

Desktop recording 51.8s, cropped from a 22×14 grey pad to 1418×886. Mobile recording 13.7s, cropped from a 6×13 pad to 384×830. The stills are the viewport.

`1440-rest.png` is the rest pose, `1440-dissolve.png` is the cursor hole, `1440-burst.png` is the hang. The 390 files match. `1440-hero.png`, `1440-scatter.png`, and `1440-pulse.png` are the same three frames.
