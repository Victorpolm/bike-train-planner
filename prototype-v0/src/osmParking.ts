import { OSM_COPYRIGHT, type BikeParking, type ParkingData } from "./bikeParking.ts";

export const OSM_PARKING_API = "https://overpass.osm.ch/api/interpreter";
// This regional server contains Switzerland, so no caller-supplied query or location is sent.
export const OSM_PARKING_QUERY = '[out:json][timeout:30];nwr["amenity"="bicycle_parking"];out center tags;';
type Element = { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> };
const yesNo = (value?: string): boolean | null => value === "yes" ? true : value === "no" ? false : null;
const retained = ["maxstay", "surveillance", "supervised", "locked", "access:conditional", "fee:conditional", "authentication",
  "indoor", "level", "level:ref", "entrance", "description", "description:en", "description:de", "operator", "website",
  "cargo_bike", "capacity:cargo_bike", "bicycle_parking:position", "covered", "opening_hours", "seasonal"];

export function parseOsmParking(value: unknown, fetchedAt = new Date().toISOString()): ParkingData {
  const raw = value as { elements?: Element[]; remark?: string; osm3s?: { timestamp_osm_base?: string } } | null;
  // Overpass can return HTTP 200 with a timeout remark and partial elements.
  if (!Array.isArray(raw?.elements) || raw.remark) throw new Error("Incomplete OSM parking response");
  const facilities = new Map<string, BikeParking>();
  for (const element of raw.elements) {
    const tags = element.tags, position = element.type === "node" ? element : element.center;
    if (!tags || tags.amenity !== "bicycle_parking" || !["node", "way", "relation"].includes(element.type ?? "")
      || !Number.isSafeInteger(element.id) || element.id! <= 0 || !Number.isFinite(position?.lat) || !Number.isFinite(position?.lon)
      || Math.abs(position!.lat!) > 90 || Math.abs(position!.lon!) > 180) continue;
    if (["yes", "true", "1"].includes(tags.disused ?? "") || ["yes", "true", "1"].includes(tags.abandoned ?? "")) continue;
    const object = `${element.type}/${element.id}`, url = `https://www.openstreetmap.org/${object}`;
    const capacity = /^\d+$/.test(tags.capacity ?? "") ? Number(tags.capacity) : null;
    const access = tags["access:bicycle"] ?? tags.access;
    const publicAccess = ["yes", "public", "permissive"].includes(access ?? "") ? true
      : ["private", "no", "customers", "members", "permit", "destination"].includes(access ?? "") ? false : null;
    facilities.set(object, { id: `osm:${object}`, lat: position!.lat!, lon: position!.lon!,
      name: tags.name ?? tags["name:en"] ?? tags["name:de"] ?? "Bicycle parking",
      operator: tags.operator ?? "Operator not supplied", type: "BIKE_PARKING", covered: yesNo(tags.covered),
      capacity: capacity !== null && Number.isSafeInteger(capacity) ? capacity : null, publicAccess, access,
      parkingType: tags.bicycle_parking, fee: yesNo(tags.fee), openingHours: tags.opening_hours, url,
      tags: Object.fromEntries(retained.filter(k => typeof tags[k] === "string").map(k => [k, tags[k]])),
      locationRole: element.type !== "node" ? "area" : tags.entrance && tags.entrance !== "no" ? "entrance" : "point",
      traits: element.type === "node" ? [] : ["Mapped parking area/line; distance uses its representative centre, not an entrance."],
      sources: [{ provider: "osm", id: object, url, retrievedAt: fetchedAt }] });
  }
  const timestamp = raw.osm3s?.timestamp_osm_base;
  return { facilities: [...facilities.values()], fetchedAt, provider: "osm", source: OSM_COPYRIGHT,
    updatedAt: timestamp && /^\d{4}-\d{2}-\d{2}T/.test(timestamp) && Number.isFinite(Date.parse(timestamp)) ? timestamp : undefined,
    coverage: "OpenStreetMap bicycle parking in the Swiss regional extract; coverage and access information may be incomplete." };
}
