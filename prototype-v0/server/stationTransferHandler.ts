import packed from "./data/station-transfers.json" with { type: "json" };
import { transferEndpointKey, type StaticTransferEndpoint, type TransferEndpointQuery, type TransferFeed } from "../src/staticTransfers.ts";

type StopRow = [id: string, original: string, didok: string, parent: number, platform: string, locationType: string];
type Data = { feed: TransferFeed; stops: StopRow[]; rules: [number, number, number][] };
let index: Promise<ReturnType<typeof prepare>> | undefined;
function prepare(data: Data) {
  const ids = new Map<string, number>(), originals = new Map<string, number[]>(), stations = new Map<string, number[]>();
  const append = (map: Map<string, number[]>, key: string, value: number) => { const values = map.get(key) ?? []; values.push(value); map.set(key, values); };
  data.stops.forEach((s, i) => { ids.set(s[0], i); if (s[1] && s[1] !== s[0]) append(originals, s[1], i); if (s[2]) append(stations, s[2], i); });
  const rules = new Map<number, Record<string, number>>();
  for (const [from, to, seconds] of data.rules) {
    const row = rules.get(from) ?? {}; row[data.stops[to][0]] = seconds; rules.set(from, row);
  }
  return { feed: data.feed, stops: data.stops, ids, originals, stations, rules };
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
  const didok = exact?.[2] || graph?.[2] || (data.stations.has(query.ref) ? query.ref : query.stopId && data.stations.has(query.stopId) ? query.stopId : "");
  const graphDidok = graph?.[2] || (query.stopId && data.stations.has(query.stopId) ? query.stopId : "");
  if (exact && graphDidok && exact[2] !== graphDidok) return missing("unmapped");
  let candidates: number[];
  const code = platform(query.platform ?? "");
  if (exact && exact[5] !== "1" && exact[4]) {
    candidates = [data.ids.get(exact[0])!, ...data.originals.get(exact[1]) ?? []];
    candidates = [...new Set(candidates)].filter(i => !code || matchesPlatform(data.stops[i][4], code));
    if (!code) candidates = [data.ids.get(exact[0])!];
  } else {
    candidates = didok ? data.stations.get(didok) ?? [] : data.originals.get(query.ref) ?? [];
    candidates = candidates.filter(i => data.stops[i][5] !== "1" && matchesPlatform(data.stops[i][4], code));
  }
  if (candidates.length !== 1) return missing(candidates.length ? "ambiguous" : "unmapped");
  const i = candidates[0];
  return { key, status: "matched", id: data.stops[i][0], minimums: data.rules.get(i) ?? {}, feed: data.feed };
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
      || q.platform !== undefined && (typeof q.platform !== "string" || q.platform.length > 40))) return json({ error: "Invalid endpoints" }, 400);
    const data = await load();
    return json({ feed: data.feed, endpoints: endpoints.map(q => resolve(q, data)) });
  } catch { return json({ error: "Station transfer lookup unavailable" }, 503); }
}
