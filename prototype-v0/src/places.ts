import { MAJOR_STATIONS } from "./majorStations.ts";
import { fetchJson } from "./http.ts";
import type { Place } from "./routing.ts";

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
export function mergePlaces(...lists: Place[][]): Place[] {
  const unique = new Map<string, Place>();
  for (const p of lists.flat()) {
    const key = p.stopId ?? `${normalizePlace(p.label)}:${p.lat.toFixed(5)}:${p.lon.toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, p);
  }
  return [...unique.values()].slice(0, 8);
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
  let places = local, successes = 0;
  publish(places);
  const transport = `https://transport.opendata.ch/v1/locations?${new URLSearchParams({ query: query.trim(), type: "all" })}`;
  const geo = `https://api3.geo.admin.ch/rest/services/ech/SearchServer?${new URLSearchParams({ searchText: query.trim(), type: "locations", origins: "address,gazetteer,zipcode,gg25", limit: "6", sr: "4326" })}`;
  const jobs = [
    fetchJson<{ stations?: TransportLocation[] }>(transport, signal, 20_000, fetcher).then(transportPlaces),
    fetchJson<GeoResponse>(geo, signal, 20_000, fetcher).then(addressPlaces),
  ];
  await Promise.allSettled(jobs.map(job => job.then(found => {
    if (signal.aborted) return;
    successes++;
    // Street matches take precedence for an address query, while known rail hubs stay immediate for city queries.
    places = /\d/.test(query) ? mergePlaces(found, places) : mergePlaces(places, found);
    publish(places);
  })));
  if (signal.aborted) throw signal.reason;
  if (successes === 2 && fetcher === fetch) {
    if (cache.size >= 50) cache.delete(cache.keys().next().value!);
    cache.set(key, places);
  }
  return { unavailable: successes === 0 };
}

export async function geocode(searchText: string, signal = new AbortController().signal, fetcher: typeof fetch = fetch): Promise<Place> {
  if (signal.aborted) throw signal.reason;
  const exact = KNOWN_PLACES.find(p => normalizePlace(p.label) === normalizePlace(searchText));
  if (exact) return exact;
  // Searching typed text can proceed on the first usable provider response.
  // The autocomplete itself continues collecting suggestions until selection.
  const child = new AbortController(), abort = () => child.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  return new Promise<Place>((resolve, reject) => {
    let settled = false;
    void suggestPlaces(searchText, child.signal, found => {
      if (!settled && found.length && !signal.aborted) {
        settled = true; resolve(found[0]); child.abort();
      }
    }, fetcher).then(status => {
      if (!settled) reject(new Error(status.unavailable
        ? "Location lookup is unavailable. Please try again, or choose a suggested station."
        : `No Swiss location found for “${searchText}”. Try a place, stop or street name.`));
    }).catch(error => { if (!settled) reject(error); })
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
