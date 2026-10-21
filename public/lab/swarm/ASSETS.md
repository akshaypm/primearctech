# Swarm mesh

The hero is a rough-legged buzzard, *Buteo lagopus*, with the wings half raised. It stands in for a peregrine: a hawk, built for precision and speed.

The wooden perch in the scan is not sampled. Points are surface-area weighted, with extra weight on the head, the beak, and creases, then stored as positions and smoothed outward normals.

| | |
| --- | --- |
| Subject | Rough-legged buzzard, inventory MP 163 |
| Holder | Virtual Museums of Małopolska |
| Museum record | https://muzea.malopolska.pl/en/objects-list/2395 |
| Sketchfab | https://sketchfab.com/3d-models/rough-legged-buzzard-e440e7d726f3411aa81ae37b10357124 |
| File used | https://zenodo.org/records/10325804/files/e440e7d726f3411aa81ae37b10357124.glb |
| Zenodo record | https://zenodo.org/records/10325804 |
| Licence | CC0 1.0 Universal. Public domain. https://creativecommons.org/publicdomain/zero/1.0/ |
| Bake | `public/lab/swarm/falcon.bin` |

CC0 does not require credit. The museum and the Zenodo record are listed so the source stays traceable.

The bake is little-endian. Header: magic `FALC`, version 1, count, reserved. Each record is 32 bytes: position xyz, normal xyz, length, then seam and wing bytes. Desktop reads the full set. Mobile reads a strided subset.
