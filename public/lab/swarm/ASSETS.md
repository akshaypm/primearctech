# Swarm falcon

The hero is a falcon mesh supplied by the client. It is not a procedural animal. Both files are centred, with the head facing -X. `falcon-web.glb` is the desktop mesh (about 150k triangles, Draco). `falcon-mobile.glb` is the phone mesh (about 40k triangles). The page uses the mobile file below 768px.

| | |
| --- | --- |
| Subject | Falcon, wings raised, head toward -X |
| Source | Client-supplied Blender export |
| Files | `public/lab/swarm/falcon-web.glb`, `public/lab/swarm/falcon-mobile.glb` |
| Compression | Draco, decoded with the three.js decoder in `public/lab/swarm/draco/` |
| Generator | Khronos glTF Blender I/O |

The colour texture is a mask, not albedo. It is extracted to `falcon-mask.jpg` (1024) and `falcon-mask-mobile.jpg` (512) so the page can load it as an image instead of a blob. Polished chrome stays `#E8E8E8`. A texel becomes `#D8643E` only where the texture is a strongly saturated orange, which keeps the wing leading edges thin and leaves the eye. Using the texture as albedo makes the metal look dirty.

Draco decodes in `draco-worker.js`, a same-origin worker. The site content security policy does not allow workers built from blob URLs.

Reflections come from a PMREM built in the page: three softbox panels over a dark floor, not a flat grey room. The map is generated at load, so there is no environment file to fetch.

Blades are not stored. About 3,000 on desktop and 1,200 on mobile are sampled from the mesh surface when the page loads and hidden at rest. They are the burst and the cursor dissolve, not the resting bird.
