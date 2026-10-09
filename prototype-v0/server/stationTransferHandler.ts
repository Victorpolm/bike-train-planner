import packed from "./data/station-transfers.json" with { type: "json" };
import { transferEndpointKey, type StaticTransferEndpoint, type TransferEndpointQuery, type TransferFeed } from "../src/staticTransfers.ts";

type StopRow = [id: string, original: string, didok: string, parent: number, platform: string, locationType: string];
type Data = { feed: TransferFeed; stops: StopRow[]; rules: [number, number, number][] };
let index: Promise<ReturnType<typeof prepare>> | undefined;
function prepare(data: Data) {
  const ids = new Map<string, number>(), originals = new Map<string, number[]>(), stations = new Map<string, number[]>();
  const append = (map: Map<string, number[]>, key: string, value: number) => { const values = map.get(key) ?? []; values.push(value); map.set(key, values); };
  data.stops.forEach((s, i) => { ids.set(s[0], i); if (s[1] && s[1] !== s[0]) append(originals, s[1], i); if (s[2]) append(stations, s[2], i); });
  const rules = new Map<number, Record<string, number>>(), stationMaximums = new Map<string, number>();
  for (const [from, to, seconds] of data.rules) {
    const row = rules.get(from) ?? {}; row[data.stops[to][0]] = seconds; rules.set(from, row);
    const station = data.stops[from][2];
    if (station && station === data.stops[to][2])
      stationMaximums.set(station, Math.max(stationMaximums.get(station) ?? 0, seconds));
  }
  return { feed: data.feed, stops: data.stops, ids, originals, stations, rules, stationMaximums };
}
async function load() {
  return index ??= (async () => {
    const bytes = Uint8Array.from(atob(packed.gzip), c => c.charCodeAt(0));
    const decoded = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return prepare(await new Response(decoded).json() as Data);
  })().catch(error => { index = undefined; throw error; });
}
const platform = (s: string) => s.trim().replace(/\s+/g, "").toUpperCase();
const matchesPlatform = (actual: string, wanted: string) => platform(actual) === wanted || !!wanted && platform(actual).split("/").includes(wanted);
function resolve(query: TransferEndpointQuery, data: Awaited<ReturnType<typeof load>>): StaticTransferEndpoint {
  const key = transferEndpointKey(query), missing = (status: "unmapped" | "ambiguous"): StaticTransferEndpoint => ({ key, status, feed: data.feed });
  const rowAt = (id: string) => { const i = data.ids.get(id); return i === undefined ? undefined : data.stops[i]; };
  const exact = rowAt(query.ref), graph = query.stopId ? rowAt(query.stopId) : undefined;
  // IDs come from the supplied DIDOK/original_stop_id columns, never SLOID arithmetic or name similarity.
  const originalStations = new Set((data.originals.get(query.ref) ?? []).map(i => data.stops[i][2]).filter(Boolean));
  const refDidok = exact?.[2] || (data.stations.has(query.ref) ? query.ref : originalStations.size === 1 ? [...originalStations][0] : "");
  const graphDidok = graph?.[2] || (query.stopId && data.stations.has(query.stopId) ? query.stopId : "");
  if (refDidok && graphDidok && refDidok !== graphDidok) return missing("unmapped");
  const didok = refDidok || graphDidok;
  let candidates: number[];
  const code = platform(query.platform ?? "");
  if (exact && exact[5] !== "1" && exact[4] && !query.platformChanged) {
    candidates = [data.ids.get(exact[0])!, ...data.originals.get(exact[1]) ?? []];
    candidates = [...new Set(candidates)].filter(i => !code || matchesPlatform(data.stops[i][4], code));
    if (!code) candidates = [data.ids.get(exact[0])!];
  } else {
    candidates = didok ? data.stations.get(didok) ?? [] : data.originals.get(query.ref) ?? [];
    candidates = candidates.filter(i => data.stops[i][5] !== "1" && matchesPlatform(data.stops[i][4], code));
  }
  // Aggregate only an identified station without a platform. Never rescue an
  // unknown SLOID, a contradictory station, or an explicit unmatched platform.
  const stationMaximumSeconds = !code && didok && (query.ref === didok || exact && !exact[4] || !exact && originalStations.size === 1)
    ? data.stationMaximums.get(didok) : undefined;
  if (candidates.length !== 1) return stationMaximumSeconds !== undefined
    ? { key, status: "station", stationId: didok, stationMaximumSeconds, feed: data.feed }
    : missing(candidates.length ? "ambiguous" : "unmapped");
  const i = candidates[0];
  return { key, status: "matched", id: data.stops[i][0], stationId: data.stops[i][2], stationMaximumSeconds,
    minimums: data.rules.get(i) ?? {}, feed: data.feed };
}
export async function handleStationTransfers(request: Request): Promise<Response> {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 8192) return json({ error: "Request too large" }, 413);
    const { endpoints } = JSON.parse(raw) as { endpoints: TransferEndpointQuery[] };
    if (!Array.isArray(endpoints) || !endpoints.length || endpoints.length > 24 || endpoints.some(q => !q || typeof q.ref !== "string" || !q.ref || q.ref.length > 160
      || q.stopId !== undefined && (typeof q.stopId !== "string" || q.stopId.length > 160)
      || q.platformChanged !== undefined && typeof q.platformChanged !== "boolean"
      || q.platform !== undefined && (typeof q.platform !== "string" || q.platform.length > 40))) return json({ error: "Invalid endpoints" }, 400);
    const data = await load();
    return json({ feed: data.feed, endpoints: endpoints.map(q => resolve(q, data)) });
  } catch { return json({ error: "Station transfer lookup unavailable" }, 503); }
}
