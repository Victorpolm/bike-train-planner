import { MAJOR_STATIONS } from "./majorStations.ts";
import { fetchJson } from "./http.ts";
import { haversineKm, type Place, type Point } from "./routing.ts";
import { suggestPointsOfInterest } from "./poiPlaces.ts";

export const MAX_WAYPOINTS = 4;
export function mapPlace(point: Point): Place {
  if (!validPoint(point.lat, point.lon)) throw new Error("Choose a valid point on the map.");
  return { lat: point.lat, lon: point.lon, label: `Map point · ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`, kind: "map" };
}

// Naming never moves the selected coordinates or turns a nearby feature into a
// selected transit stop. Coordinates remain usable if the naming service fails.
export async function nameMapPlace(point: Point, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Place> {
  const fallback = mapPlace(point);
  signal.throwIfAborted();
  try {
    const params = new URLSearchParams({ geometry: `${point.lon},${point.lat}`, geometryType: "esriGeometryPoint",
      layers: "all:ch.swisstopo.amtliches-gebaeudeadressverzeichnis,ch.swisstopo.swissnames3d",
      sr: "4326", mapExtent: `${point.lon - .02},${point.lat - .02},${point.lon + .02},${point.lat + .02}`,
      imageDisplay: "1000,1000,96", tolerance: "50", returnGeometry: "true", limit: "10", lang: "en" });
    type Feature = { attributes?: Record<string, unknown>; properties?: Record<string, unknown>;
      geometry?: { x?: number; y?: number }; };
    const data = await fetchJson<{ results?: Feature[] }>(`https://api3.geo.admin.ch/rest/services/ech/MapServer/identify?${params}`, signal, 6000, fetcher);
    signal.throwIfAborted();
    const candidates = (data.results ?? []).flatMap(feature => {
      const attributes = feature.attributes ?? feature.properties ?? {};
      const raw = attributes.label ?? attributes.adr_label ?? attributes.name;
      if (typeof raw !== "string" || !raw.trim()) return [];
      const name = raw.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      const town = typeof attributes.com_name === "string" ? attributes.com_name : "";
      const distance = validPoint(feature.geometry?.y, feature.geometry?.x)
        ? haversineKm(point, { lat: feature.geometry!.y!, lon: feature.geometry!.x! }) : Infinity;
      return [{ name: town && !name.includes(town) ? `${name}, ${town}` : name, distance }];
    }).filter(candidate => candidate.distance <= .5).sort((a, b) => a.distance - b.distance);
    return candidates[0] ? { ...fallback, label: `Near ${candidates[0].name}` } : fallback;
  } catch (error) {
    signal.throwIfAborted();
    return fallback;
  }
}

export type TransportLocation = { id: string | null; name: string; icon?: string | null;
  coordinate?: { x: number | null; y: number | null } };
export const normalizePlace = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const KNOWN_PLACES: Place[] = [
  ...MAJOR_STATIONS.map(s => ({ lat: s.lat, lon: s.lon, label: s.name, stopId: s.id, kind: "train" })),
  // Coordinates from the recorded Zürich–Laax provider response in fixtures/.
  { label: "Laax GR, posta", stopId: "8509786", lat: 46.806492, lon: 9.258086, kind: "bus" },
];
export function localSuggestions(query: string): Place[] {
  const text = normalizePlace(query);
  if (text.length < 2) return [];
  return KNOWN_PLACES.filter(p => normalizePlace(p.label).includes(text))
    .sort((a, b) => Number(normalizePlace(b.label).startsWith(text)) - Number(normalizePlace(a.label).startsWith(text)))
    .slice(0, 6);
}
function validPoint(lat: unknown, lon: unknown): boolean {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 &&
    typeof lon === "number" && Number.isFinite(lon) && Math.abs(lon) <= 180;
}
export function transportPlaces(data: { stations?: TransportLocation[] }): Place[] {
  return (Array.isArray(data.stations) ? data.stations : []).filter(s => s.name && validPoint(s.coordinate?.x, s.coordinate?.y))
    .map(s => ({ label: s.name, lat: s.coordinate!.x!, lon: s.coordinate!.y!, stopId: s.id ?? undefined, kind: s.icon ?? undefined }));
}
function uniquePlaces(lists: Place[][]): Place[] {
  const unique = new Map<string, Place>();
  for (const p of lists.flat()) {
    const key = p.stopId ?? `${normalizePlace(p.label)}:${p.lat.toFixed(5)}:${p.lon.toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, p);
  }
  return [...unique.values()];
}
export function mergePlaces(...lists: Place[][]): Place[] { return uniquePlaces(lists).slice(0, 8); }
const words = (text: string) => normalizePlace(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
function matchingWords(query: string, place: Place): number {
  const candidate = words(`${place.label} ${place.detail ?? ""}`);
  return words(query).filter(word => candidate.some(part => /^\d+$/.test(word) ? part === word : part.startsWith(word))).length;
}
function matchesWholeQuery(query: string, place: Place): boolean {
  const count = words(query).length;
  return count > 0 && matchingWords(query, place) === count;
}
export function rankPlaces(query: string, places: Place[]): Place[] {
  const key = words(query).join(" ");
  const score = (place: Place) => (matchesWholeQuery(query, place) ? 1000 : 0) + matchingWords(query, place) * 20
    + (words(place.label).join(" ") === key ? 100 : words(place.label).join(" ").startsWith(key) ? 50 : 0);
  // Rank the entire pool before limiting it: early town/station replies must not
  // fill every slot before a more relevant named destination arrives.
  return uniquePlaces([places]).sort((a, b) => score(b) - score(a)).slice(0, 8);
}
type GeoResponse = { results?: { attrs?: { lat?: number; lon?: number; label?: string; detail?: string } }[] };
function addressPlaces(data: GeoResponse): Place[] {
  return (data.results ?? []).flatMap(({ attrs: a }) => {
    if (!a || !validPoint(a.lat, a.lon)) return [];
    const raw = a.label || a.detail || "";
    const label = typeof DOMParser === "undefined" ? raw.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&")
      : new DOMParser().parseFromString(raw, "text/html").body.textContent ?? "";
    return label.trim() ? [{ label: label.replace(/\s+/g, " ").trim(), lat: a.lat!, lon: a.lon!, kind: "address" }] : [];
  });
}
const cache = new Map<string, Place[]>();
// Publish each provider independently: a slow address service must not hide stop suggestions.
export async function suggestPlaces(query: string, signal: AbortSignal, publish: (places: Place[]) => void,
  fetcher: typeof fetch = fetch): Promise<{ unavailable: boolean }> {
  const key = normalizePlace(query), local = localSuggestions(query);
  if (signal.aborted) throw signal.reason;
  if (key.length < 2) { publish([]); return { unavailable: false }; }
  if (fetcher === fetch && cache.has(key)) { publish(cache.get(key)!); return { unavailable: false }; }
  let places = local, candidates = local, successes = 0;
  publish(places);
  const transport = `https://transport.opendata.ch/v1/locations?${new URLSearchParams({ query: query.trim(), type: "all" })}`;
  const geo = `https://api3.geo.admin.ch/rest/services/ech/SearchServer?${new URLSearchParams({ searchText: query.trim(), type: "locations", origins: "address,gazetteer,zipcode,gg25", limit: "6", sr: "4326" })}`;
  const jobs = [
    fetchJson<{ stations?: TransportLocation[] }>(transport, signal, 20_000, fetcher).then(transportPlaces),
    fetchJson<GeoResponse>(geo, signal, 20_000, fetcher).then(addressPlaces),
  ];
  // Photon explicitly supports search-as-you-type; keep short prefixes local
  // to the two existing services and honour any public-provider rate limit.
  if (key.length >= 3) jobs.push(suggestPointsOfInterest(query, signal, fetcher));
  await Promise.allSettled(jobs.map(job => job.then(found => {
    if (signal.aborted) return;
    successes++;
    // Street matches take precedence for an address query, while known rail hubs stay immediate for city queries.
    candidates = /\d/.test(query) ? [...found, ...candidates] : [...candidates, ...found];
    places = rankPlaces(query, candidates);
    publish(places);
  })));
  if (signal.aborted) throw signal.reason;
  if (successes === jobs.length && fetcher === fetch) {
    if (cache.size >= 50) cache.delete(cache.keys().next().value!);
    cache.set(key, places);
  }
  return { unavailable: successes === 0 };
}

export async function geocode(searchText: string, signal = new AbortController().signal, fetcher: typeof fetch = fetch): Promise<Place> {
  if (signal.aborted) throw signal.reason;
  const exact = KNOWN_PLACES.find(p => normalizePlace(p.label) === normalizePlace(searchText));
  if (exact) return exact;
  // A partial town match cannot stand in for a named venue in that town.
  // Proceed early only when the candidate covers the whole typed query.
  const child = new AbortController(), abort = () => child.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  return new Promise<Place>((resolve, reject) => {
    let settled = false, hadSuggestions = false;
    void suggestPlaces(searchText, child.signal, found => {
      hadSuggestions ||= found.length > 0;
      const match = found.find(place => matchesWholeQuery(searchText, place));
      if (!settled && match && !signal.aborted) {
        settled = true; resolve(match); child.abort();
      }
    }, fetcher).then(status => {
      if (!settled) reject(new Error(status.unavailable
        ? "Location lookup is unavailable. Please try again, or choose a suggested station."
        : hadSuggestions ? `No exact match for “${searchText}”. Choose a suggestion, add the street address, or select the place on the map.`
          : `No Swiss location found for “${searchText}”. Try a place, stop or street name.`));
    }).catch(error => { if (!settled) reject(error); })
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
