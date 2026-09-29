import { handleParking } from "./parkingHandler.ts";
import { handleAmenities, handleServices } from "./amenityHandler.ts";
import { handleSwisstopo } from "./swisstopoHandler.ts";
import assets from "virtual:bike-assets";
import { handleTimetable, type TimetableEnvironment } from "./timetableHandler.ts";
import { handleOjp, type OjpEnvironment } from "./ojpHandler.ts";
import { handleFare, type FareEnvironment } from "./fareHandler.ts";

export default {
  async fetch(request: Request, env: OjpEnvironment & TimetableEnvironment & FareEnvironment): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/amenities/v1") return handleAmenities(request);
    if (path.startsWith("/api/services/")) return handleServices(request);
    if (path === "/api/parking" || path.startsWith("/api/parking/v3/")) return handleParking(request);
    if (path === "/api/terrain") return handleSwisstopo(request);
    if (path.startsWith("/api/timetable/")) return handleTimetable(request, env);
    if (path.startsWith("/api/ojp/")) return handleOjp(request, env);
    if (path.startsWith("/api/fares/")) return handleFare(request, env);
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
