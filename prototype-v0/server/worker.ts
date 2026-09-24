import assets from "virtual:bike-assets";
import { handleOjp, type OjpEnvironment } from "./ojpHandler.ts";

export default {
  async fetch(request: Request, env: OjpEnvironment): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/ojp/")) return handleOjp(request, env);
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    const asset = assets[path === "/" ? "/index.html" : path];
    if (!asset) return new Response("Not found", { status: 404 });
    const bytes = Uint8Array.from(atob(asset.data), c => c.charCodeAt(0));
    return new Response(request.method === "HEAD" ? null : bytes, { headers: {
      "Content-Type": asset.type, "X-Content-Type-Options": "nosniff",
      "Cache-Control": path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    } });
  },
};
