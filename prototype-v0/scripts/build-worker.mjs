import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "vite";

// Embed the small compiled frontend so the Worker needs no extra asset binding.
// Only dist is read: source, environment files and credentials cannot be bundled.
const assets = {};
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
async function collect(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "server" || entry.name.startsWith(".")) continue;
    const file = path.join(directory, entry.name), key = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collect(file, key);
    else if (entry.isFile()) assets[key] = { type: types[path.extname(entry.name)] ?? "application/octet-stream", data: (await readFile(file)).toString("base64") };
  }
}
await collect("dist");
await build({ configFile: false, publicDir: false, plugins: [{
  name: "compiled-bike-assets",
  resolveId(id) { if (id === "virtual:bike-assets") return "\0bike-assets"; },
  load(id) { if (id === "\0bike-assets") return `export default ${JSON.stringify(assets)}`; },
}], build: { outDir: "dist/server", emptyOutDir: true, target: "es2022", minify: true,
  lib: { entry: "server/worker.ts", formats: ["es"], fileName: () => "index.js" },
} });
