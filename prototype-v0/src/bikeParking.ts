import { haversineKm, type Point } from "./routing.ts";

export const PARKING_SOURCE = "https://opentransportdata.swiss/en/cookbook/road-traffic-cookbook/bike-and-car-parking/";
export const PARKING_DOWNLOAD = "https://data.opentransportdata.swiss/en/dataset/bike-and-car-parking/permalink";
export const OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright";
export type ParkingProvider = "official" | "osm";
type ParkingReference = { provider: ParkingProvider; id: string; url: string };
export type BikeParking = Point & { id: string; name: string; operator: string; type: string;
  covered: boolean | null; capacity: number | null; publicAccess: boolean | null; traits: string[]; url?: string;
  access?: string; fee?: boolean | null; openingHours?: string; parkingType?: string; sources?: ParkingReference[] };
export type ParkingData = { facilities: BikeParking[]; fetchedAt: string; source: string; coverage: string; stale?: boolean;
  provider?: ParkingProvider; updatedAt?: string };
type ClosestBikeParking = { facility: BikeParking; distanceKm: number };

// Accept a coordinate, independent of how it was selected (start point now,
// a separately authorised GPS fix later). Rank the whole loaded dataset.
export function closestBikeParking<T extends Point & { id: string }>(facilities: readonly T[], from: Point | null): { facility: T; distanceKm: number } | null {
  const valid = (p: Point) => Number.isFinite(p.lat) && Number.isFinite(p.lon)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  if (!from || !valid(from)) return null;
  let closest: { facility: T; distanceKm: number } | null = null;
  for (const facility of facilities) {
    if (!valid(facility)) continue;
    const distanceKm = haversineKm(from, facility);
    if (!Number.isFinite(distanceKm)) continue;
    if (!closest || distanceKm < closest.distanceKm
      || distanceKm === closest.distanceKm && facility.id < closest.facility.id) closest = { facility, distanceKm };
  }
  return closest;
}

export function parkingDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
}
type Geometry = { type?: string; coordinates?: number[]; geometries?: Geometry[] };
type Feature = { id?: string; geometry?: Geometry; properties?: Record<string, unknown> };
function point(g?: Geometry): Point | null {
  if (g?.type === "GeometryCollection") return g.geometries?.map(point).find(Boolean) ?? null;
  if (g?.type !== "Point" || !Array.isArray(g.coordinates)) return null;
  const [lon, lat] = g.coordinates;
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
}
export function parseBikeParking(value: unknown, fetchedAt = new Date().toISOString()): ParkingData {
  const raw = value as { features?: Feature[] };
  if (!Array.isArray(raw?.features)) throw new Error("Invalid parking dataset");
  const facilities = new Map<string, BikeParking>();
  for (const feature of raw.features) {
    const p = feature.properties, coordinate = point(feature.geometry);
    if (p?.parkingFacilityCategory !== "BIKE" || !coordinate || typeof feature.id !== "string") continue;
    // The official feed includes a small number of neighbouring-country facilities.
    const capacities = Array.isArray(p.capacities) ? p.capacities as { categoryType?: string; total?: number }[] : [];
    const capacity = capacities.find(c => c.categoryType === "STANDARD")?.total;
    const type = typeof p.parkingFacilityType === "string" ? p.parkingFacilityType : "BIKE_PARKING";
    const traits = Array.isArray(p.bikeFacilityTraits) ? (p.bikeFacilityTraits as { bikeFacilityTraitNameI18n?: Record<string, string> }[])
      .map(t => (t.bikeFacilityTraitNameI18n?.en ?? t.bikeFacilityTraitNameI18n?.de ?? "").trim()).filter(Boolean) : [];
    const links = p.callToAction as { externalDesktop?: Record<string, string> } | undefined;
    const rawUrl = links?.externalDesktop?.en ?? links?.externalDesktop?.de;
    const url = typeof rawUrl === "string" && /^https:\/\//.test(rawUrl) ? rawUrl : undefined;
    facilities.set(feature.id, { id: feature.id, ...coordinate,
      name: typeof p.displayName === "string" ? p.displayName : "Bicycle parking",
      operator: typeof p.operator === "string" ? p.operator : "Operator not supplied", type,
      covered: type.includes("COVERED") ? true : null,
      capacity: Number.isInteger(capacity) && capacity! >= 0 ? capacity! : null,
      publicAccess: typeof p.publicAccess === "boolean" ? p.publicAccess : null, traits, url,
      sources: [{ provider: "official", id: feature.id, url: PARKING_SOURCE }] });
  }
  return { facilities: [...facilities.values()], fetchedAt, source: PARKING_SOURCE, provider: "official",
    coverage: "Official station and partner facilities in Switzerland and nearby border areas; not an inventory of every bicycle rack." };
}

export function parkingAccess(facility: BikeParking): string {
  if (facility.publicAccess === false && ["yes", "public", "permissive"].includes(facility.access ?? "")) return "Sources disagree on access; restrictions may apply";
  const labels: Record<string, string> = { yes: "Public access; check any access conditions", public: "Public access; check any access conditions",
    permissive: "Access permitted by the owner; conditions may change", private: "Private access", no: "Access not permitted",
    customers: "Customers only", members: "Members only", permit: "Permit required", destination: "Access for visitors to this destination" };
  if (facility.access) return labels[facility.access] ?? `Access: ${facility.access}; check conditions`;
  return facility.publicAccess === false ? "Restricted access" : facility.publicAccess === true
    ? "Public access; check any access conditions" : "Access conditions not supplied";
}

export function parkingDetails(facility: BikeParking): string[] {
  return [facility.operator, facility.type === "BIKE_STATION" ? "Bicycle station" : "Bicycle parking",
    ...(facility.parkingType ? [`Parking type: ${facility.parkingType.replaceAll("_", " ")}`] : []),
    facility.covered === true ? "Covered" : facility.covered === false ? "Not covered" : "Cover information not supplied",
    facility.capacity === null ? "Capacity not supplied" : `${facility.capacity} bicycle places in total (not availability)`,
    parkingAccess(facility),
    facility.fee === true ? "Fee applies; check tariff" : facility.fee === false ? "Mapped as free of charge" : "Fee information not supplied",
    ...(facility.openingHours ? [`Mapped opening hours: ${facility.openingHours} (not checked for arrival)`] : []), ...facility.traits];
}

function osmIdentity(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!["www.openstreetmap.org", "openstreetmap.org", "osm.org", "www.osm.org"].includes(parsed.hostname)) return null;
    return parsed.pathname.match(/^\/(node|way|relation)\/([1-9][0-9]*)\/?$/)?.slice(1).join("/") ?? null;
  } catch { return null; }
}

// Source IDs (or an explicit OSM object link) establish identity. Proximity alone
// must not collapse opposite-side racks, separate stands or station enclosures.
export function mergeBikeParking(datasets: readonly ParkingData[]): BikeParking[] {
  const facilities: BikeParking[] = [], identities = new Map<string, number>();
  for (const dataset of datasets) for (const facility of dataset.facilities) {
    const keys = (facility.sources ?? [{ provider: dataset.provider ?? "official", id: facility.id }])
      .map(ref => `${ref.provider}:${ref.id}`);
    const linked = osmIdentity(facility.url);
    if (linked) keys.push(`osm:${linked}`);
    const index = keys.map(key => identities.get(key)).find(value => value !== undefined);
    if (index === undefined) {
      keys.forEach(key => identities.set(key, facilities.length)); facilities.push(facility); continue;
    }
    const previous = facilities[index];
    // Repeated objects from the same provider are the same record, not capacity to add.
    if (previous.sources?.some(ref => facility.sources?.some(next => ref.provider === next.provider && ref.id === next.id))) continue;
    const refs = [...(previous.sources ?? []), ...(facility.sources ?? [])];
    const osm = facility.sources?.some(ref => ref.provider === "osm") ? facility : previous;
    const conflicts: string[] = [];
    const value = <T,>(a: T | null | undefined, b: T | null | undefined, label: string): T | null => {
      if (a != null && b != null && a !== b) { conflicts.push(`${label} differs between sources; check facility details.`); return null; }
      return a ?? b ?? null;
    };
    const capacity = value(previous.capacity, facility.capacity, "Capacity"), covered = value(previous.covered, facility.covered, "Cover");
    const access = value(previous.publicAccess, facility.publicAccess, "Access");
    facilities[index] = { ...previous, capacity, covered,
      publicAccess: previous.publicAccess === false || facility.publicAccess === false ? false : access,
      access: osm.access, fee: value(previous.fee, facility.fee, "Fee"), openingHours: osm.openingHours,
      parkingType: osm.parkingType, sources: refs, traits: [...new Set([...previous.traits, ...facility.traits, ...conflicts])] };
    keys.forEach(key => identities.set(key, index));
  }
  return facilities;
}
