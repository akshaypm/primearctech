#!/usr/bin/env python3
"""Rewrite baked GLBs so images point at shared UASTC KTX2 files.

Geometry and Draco buffers stay. Embedded WebP bytes are dropped.
Originals remain in public/network/original/.
"""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path

ROOT = Path("/workspace/public/network")
SRC = ROOT / "original"
DST = ROOT / "ktx"
TEX = ROOT / "tex"


def parse_glb(data: bytes) -> tuple[dict, bytes]:
    if data[:4] != b"glTF":
        raise SystemExit("not a glb")
    json_len, json_type = struct.unpack_from("<I4s", data, 12)
    if json_type != b"JSON":
        raise SystemExit("missing json chunk")
    meta = json.loads(data[20 : 20 + json_len])
    off = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<I4s", data, off)
    if bin_type != b"BIN\x00":
        raise SystemExit("missing bin chunk")
    return meta, data[off + 8 : off + 8 + bin_len]


def pad(buf: bytearray, alignment: int = 4) -> None:
    while len(buf) % alignment:
        buf.append(0)


def image_hash(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()[:16]


def rewrite(name: str) -> None:
    meta, blob = parse_glb((SRC / f"{name}-baked.glb").read_bytes())
    views = meta.get("bufferViews", [])
    drop: set[int] = set()
    for image in meta.get("images", []):
        view_index = image.get("bufferView")
        if view_index is None:
            uri = image.get("uri", "")
            digest = Path(uri).stem[:16]
        else:
            view = views[view_index]
            start = view.get("byteOffset", 0)
            digest = image_hash(blob[start : start + view["byteLength"]])
            drop.add(view_index)
        ktx = TEX / f"{digest}.ktx2"
        if not ktx.exists() or ktx.stat().st_size < 64:
            raise SystemExit(f"{name}: missing ktx2 {digest}")
        image.clear()
        image["uri"] = f"../tex/{digest}.ktx2"
        image["mimeType"] = "image/ktx2"

    kept: list[int] = [i for i in range(len(views)) if i not in drop]
    remap = {old: new for new, old in enumerate(kept)}
    packed = bytearray()
    new_views = []
    for old in kept:
        view = dict(views[old])
        start = view.get("byteOffset", 0)
        length = view["byteLength"]
        pad(packed, 4)
        view["byteOffset"] = len(packed)
        packed += blob[start : start + length]
        new_views.append(view)
    meta["bufferViews"] = new_views
    if meta.get("buffers"):
        meta["buffers"][0]["byteLength"] = len(packed)

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if "bufferView" in node and isinstance(node["bufferView"], int):
                if node["bufferView"] not in remap:
                    raise SystemExit(f"{name}: dangling bufferView {node['bufferView']}")
                node["bufferView"] = remap[node["bufferView"]]
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(meta.get("accessors", []))
    walk(meta.get("meshes", []))
    walk(meta.get("images", []))

    used = [ext for ext in meta.get("extensionsUsed", []) if ext != "EXT_texture_webp"]
    required = [ext for ext in meta.get("extensionsRequired", []) if ext != "EXT_texture_webp"]
    if "KHR_texture_basisu" not in used:
        used.append("KHR_texture_basisu")
    if "KHR_texture_basisu" not in required:
        required.append("KHR_texture_basisu")
    meta["extensionsUsed"] = used
    meta["extensionsRequired"] = required
    for texture in meta.get("textures", []):
        ext = texture.get("extensions") or {}
        webp = ext.pop("EXT_texture_webp", None)
        source = None
        if isinstance(webp, dict):
            source = webp.get("source")
        if source is None:
            source = texture.get("source")
        ext["KHR_texture_basisu"] = {"source": source}
        texture["extensions"] = ext
        texture.pop("source", None)

    payload = json.dumps(meta, separators=(",", ":")).encode("utf-8")
    while len(payload) % 4:
        payload += b" "
    pad(packed, 4)
    out = bytearray()
    total = 12 + 8 + len(payload) + 8 + len(packed)
    out += struct.pack("<4sII", b"glTF", 2, total)
    out += struct.pack("<I4s", len(payload), b"JSON")
    out += payload
    out += struct.pack("<I4s", len(packed), b"BIN\x00")
    out += packed
    DST.mkdir(parents=True, exist_ok=True)
    dest = DST / f"{name}-baked.glb"
    dest.write_bytes(out)
    print(f"{name}: {dest.stat().st_size} bytes, dropped {len(drop)} images")


def main() -> None:
    for name in ["loader", "hero", "input", "layers", "attn", "loss", "emb"]:
        rewrite(name)


if __name__ == "__main__":
    main()
