import { parseTopoReply, routeWithinSwitzerland, simplifyTopoLine, topoQuery, type TopoReply } from "../src/swisstopo.ts";
import type { Point } from "../src/routing.ts";

const cache = new Map<string, { expires: number; reply: TopoReply }>();
export async function handleSwisstopo(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let points: Point[];
  try {
    const body = await request.text();
    if (body.length > 100000) return new Response("Route too large", { status: 413 });
    points = JSON.parse(body).points;
    if (!Array.isArray(points) || points.length > 1500 || !routeWithinSwitzerland(points)) throw new Error("Invalid route");
  } catch { return new Response("A Swiss route is required", { status: 400 }); }
  const simplified = simplifyTopoLine(points), key = JSON.stringify(simplified.map(p => [p.lon.toFixed(6), p.lat.toFixed(6)]));
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return Response.json(existing.reply, { headers: { "Cache-Control": "private, no-store" } });
  const combined = AbortSignal.any([request.signal, AbortSignal.timeout(9000)]);
  const features: TopoReply["features"] = [];
  let complete = true, completed = 0;
  try {
    for (let start = 0; start < simplified.length - 1; start += 119) {
      if (completed >= 3) { complete = false; break; }
      const chunk = simplified.slice(start, start + 120);
      const query = topoQuery(chunk);
      const response = await fetcher("https://api3.geo.admin.ch/rest/services/api/MapServer/identify?" + query, { signal: combined });
      if (!response.ok) throw new Error("Swisstopo unavailable");
      const raw = await response.json() as { results?: unknown[] };
      features.push(...parseTopoReply(raw));
      if ((raw.results?.length ?? 0) >= 200) complete = false;
      completed++;
    }
  } catch {
    if (!completed) return Response.json({ error: "Swisstopo check unavailable. Road access is not verified." }, { status: 503 });
    complete = false;
  }
  const reply: TopoReply = { features: [...new Map(features.map(f => [f.layer + ":" + f.id, f])).values()], complete, checkedAt: new Date().toISOString(),
    ...(!complete ? { note: "Partial swisstopo check: query limits or a service interruption left sections unchecked." } : {}) };
  if (complete) {
    if (cache.size >= 80) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 3600000, reply });
  }
  return Response.json(reply, { headers: { "Cache-Control": "private, no-store" } });
}
