# Swarm mesh

The hero is a low-poly eagle with the wings spread and the head in profile. It stands in for a peregrine: a hawk, built for precision and speed.

The mesh is the Eagle from Quaternius Animal Pack Vol.2. Points are area-weighted, with extra weight on the silhouette, the head, and the wing leading edges. Each shard lies on the surface along the feather flow: root to tip on the wings, head to tail on the body. Only the trailing edge and the tail carry a slight lift.

| | |
| --- | --- |
| Subject | Eagle, wings spread |
| Author | Quaternius |
| Pack | Animal Pack Vol.2 |
| Page | https://opengameart.org/content/animated-animales-low-poly |
| File | https://opengameart.org/sites/default/files/Animal%20Pack%20Vol.2%20by%20%40Quaternius.zip |
| Licence | CC0 1.0 Universal. Public domain. https://creativecommons.org/publicdomain/zero/1.0/ |
| Bake | `public/lab/swarm/falcon.bin` |

CC0 does not require credit. The pack page is listed so the source stays traceable.

The bake is little-endian, version 2. Header: magic `FALC`, version, count, record size. Each record is 48 bytes: position xyz, normal xyz, feather tangent xyz, length, then seam, wing, lift, and eye bytes. Desktop reads the full set. Mobile reads a strided subset.
