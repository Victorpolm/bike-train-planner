import { fetchJson, HttpError } from "./http.ts";
import type { Place } from "./routing.ts";

const categories: Record<string, string> = {
  public_bath: "Bath / spa", spa: "Spa", swimming_pool: "Swimming pool", water_park: "Water park",
  parking: "Car park", bicycle_parking: "Bicycle parking", restaurant: "Restaurant", cafe: "Café",
  hotel: "Hotel", museum: "Museum", hospital: "Hospital", attraction: "Attraction", station: "Station",
};
const text = (value: unknown) => typeof value === "string" ? value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

export function photonPlaces(data: unknown): Place[] {
  const features = record(data).features;
  if (!Array.isArray(features)) return [];
  return features.flatMap(feature => {
    const p = record(record(feature).properties), geometry = record(record(feature).geometry);
    const coordinates = geometry.coordinates, name = text(p.name), city = text(p.city);
    if (!name || text(p.countrycode).toUpperCase() !== "CH" || geometry.type !== "Point" || !Array.isArray(coordinates)) return [];
    const [lon, lat] = coordinates;
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < 45.81 || lat > 47.81 ||
      typeof lon !== "number" || !Number.isFinite(lon) || lon < 5.95 || lon > 10.5) return [];
    const street = [text(p.street), text(p.housenumber)].filter(Boolean).join(" ");
    const town = [text(p.postcode), city].filter(Boolean).join(" ");
    const category = categories[text(p.osm_value)] ?? "Place";
    const label = city && !name.toLocaleLowerCase().includes(city.toLocaleLowerCase()) ? `${name}, ${city}` : name;
    // OSM feature IDs are not timetable stop IDs. Route to the actual place.
    return [{ label, lat, lon, kind: "poi", detail: [category, street, town].filter(Boolean).join(" · "), source: "photon" as const }];
  });
}

const pausedUntil = new WeakMap<typeof fetch, number>();
export async function suggestPointsOfInterest(query: string, signal: AbortSignal, fetcher: typeof fetch): Promise<Place[]> {
  if ((pausedUntil.get(fetcher) ?? 0) > Date.now()) throw new HttpError(429);
  const params = new URLSearchParams({ q: query.trim(), limit: "6", lang: "en", bbox: "5.95,45.81,10.5,47.81" });
  try {
    const data = await fetchJson<unknown>(`https://photon.komoot.io/api/?${params}`, signal, 20_000, fetcher);
    return photonPlaces(data);
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) pausedUntil.set(fetcher, Date.now() + Math.max(60_000, error.retryAfterMs ?? 0));
    throw error;
  }
}
