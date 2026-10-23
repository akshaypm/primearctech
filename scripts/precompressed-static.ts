import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const TYPES: Record<string, string> = {
  ".bin": "application/octet-stream",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".ktx2": "image/ktx2",
  ".wasm": "application/wasm",
  ".js": "text/javascript",
};

/** Serve a sibling .br or .gz for public network binaries when the browser asks for it. */
export function precompressedStatic(root: string): Plugin {
  return {
    name: "precompressed-static",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split("?")[0];
        if (!raw || !/\.(bin|json|glb|ktx2|wasm|js)$/.test(raw)) return next();
        const accept = String(req.headers["accept-encoding"] || "");
        let file: string;
        try {
          file = path.join(root, "public", decodeURIComponent(raw));
        } catch {
          return next();
        }
        const type = TYPES[path.extname(file)];
        if (!type || !fs.existsSync(file)) return next();
        const encoding = accept.includes("br") && fs.existsSync(`${file}.br`) ? "br" : accept.includes("gzip") && fs.existsSync(`${file}.gz`) ? "gzip" : "";
        if (!encoding) return next();
        const body = `${file}.${encoding === "br" ? "br" : "gz"}`;
        res.statusCode = 200;
        res.setHeader("Content-Type", type);
        res.setHeader("Content-Encoding", encoding);
        res.setHeader("Vary", "Accept-Encoding");
        res.setHeader("Content-Length", String(fs.statSync(body).size));
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        fs.createReadStream(body).pipe(res);
      });
    },
  };
}
