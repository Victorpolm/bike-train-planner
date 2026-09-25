import type { Point } from "./routing.ts";

export const PARKING_SOURCE = "https://opentransportdata.swiss/en/cookbook/road-traffic-cookbook/bike-and-car-parking/";
export const PARKING_DOWNLOAD = "https://data.opentransportdata.swiss/en/dataset/bike-and-car-parking/permalink";
export type BikeParking = Point & { id: string; name: string; operator: string; type: string;
  covered: boolean | null; capacity: number | null; publicAccess: boolean | null; traits: string[]; url?: string };
export type ParkingData = { facilities: BikeParking[]; fetchedAt: string; source: string; coverage: string; stale?: boolean };
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
      publicAccess: typeof p.publicAccess === "boolean" ? p.publicAccess : null, traits, url });
  }
  return { facilities: [...facilities.values()], fetchedAt, source: PARKING_SOURCE,
    coverage: "Official station and partner facilities in Switzerland and nearby border areas; not an inventory of every bicycle rack." };
}
