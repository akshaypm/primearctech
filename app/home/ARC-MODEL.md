# Swapping the Arc for an artist GLB

The homepage layout, lighting, camera, and post do not change when the mesh does. The only switch is `arcModelConfig.url` in `app/home/arc-model.ts`.

## What to export

- A single `.glb`, Y-up, no cameras and no lights. The studio rig stays in `arc-scene.ts`.
- Origin on the floor, midway between the two footings.
- The arch lies in the XY plane and occupies +Y, the same way the procedural arc does: left footing near `x = -3.5`, right footing near `x = 3.5`, crown near `y = 3.4`. Overall width about 7.2 units.
- Save it at `public/models/arc.glb`.

## How the orange band finds the fins

Name every fin `fin` (or `fin-001`, `fin-002`, …), or set `userData.fin = true` on each fin mesh.

Order is `userData.index` if it is a number, otherwise the trailing number in the name, otherwise traversal order. Index `0` is the footing at −X and the last index is the footing at +X.

Author every fin in the same metal. The loader assigns the anodised orange material (`#D8643E`) to three consecutive fins and moves that band as the hero scrolls. Do not bake the orange into only three fins if the band should travel.

If the file should keep its own materials and ignore the scroll band, set `userData.staticBand = true` on the root.

## Turn it on

```ts
export const arcModelConfig: { url: string | null } = {
  url: "/models/arc.glb",
};
```

Leave `url` as `null` to keep the procedural arc. A failed load falls back to the still at `public/arc/arc-still.webp`. The hero markup does not change.
