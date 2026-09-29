import { closestBikeParking, OSM_COPYRIGHT } from "./bikeParking.ts";
import type { Point } from "./routing.ts";

export type AmenityCategory = "water" | "toilets";
export type Amenity = Point & { id: string; name: string; url: string; categories: AmenityCategory[];
  potable: "yes" | "no" | "unknown"; area: boolean; tags: Record<string, string> };
export type AmenityData = { schema: 1; provider: "osm"; facilities: Amenity[]; fetchedAt: string;
  source: string; updatedAt?: string; stale?: boolean };
export const OSM_AMENITY_API = "https://overpass.osm.ch/api/interpreter";
// One fixed regional query serves both toggles, without sending the user's route.
export const OSM_AMENITY_QUERY = '[out:json][timeout:30];(nwr["amenity"~"^(drinking_water|fountain|toilets)$"];nwr["drinking_water"="yes"];nwr["man_made"="drinking_fountain"];);out center tags;';
const retainedTags = ["amenity", "man_made", "operator", "access", "access:conditional", "drinking_water", "drinking_water:legal", "drinking_water:access",
  "drinking_water:seasonal", "toilets:access", "fee", "charge", "opening_hours", "seasonal", "intermittent", "bottle", "wheelchair",
  "changing_table", "toilets:wheelchair", "toilets:position", "toilets:disposal", "unisex", "male", "female", "centralkey", "locked", "indoor", "operational_status"];
const validPoint = (p: Point) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

export function parseOsmAmenities(value: unknown, fetchedAt = new Date().toISOString()): AmenityData {
  const raw = value as { elements?: { type?: string; id?: number; lat?: number; lon?: number;
    center?: Point; tags?: Record<string, unknown> }[]; remark?: string; osm3s?: { timestamp_osm_base?: string } } | null;
  if (!Array.isArray(raw?.elements) || raw.remark) throw new Error("Incomplete OSM amenities response");
  const facilities = new Map<string, Amenity>();
  for (const element of raw.elements) {
    if (!element || !["node", "way", "relation"].includes(element.type ?? "") || !Number.isSafeInteger(element.id) || element.id! <= 0) continue;
    const p = element.type === "node" ? element as Point : element.center;
    if (!p || !validPoint(p) || !element.tags || typeof element.tags !== "object") continue;
    const tag = (key: string) => typeof element.tags![key] === "string" ? element.tags![key] as string : undefined;
    if (["disused", "abandoned", "demolished", "removed", "construction", "proposed"].some(key => ["yes", "true", "1"].includes(tag(key) ?? "")
      || !!tag(`${key}:amenity`) || !!tag(`${key}:man_made`))) continue;
    const categories: AmenityCategory[] = [];
    if (["drinking_water", "fountain"].includes(tag("amenity") ?? "") || tag("drinking_water") === "yes" || tag("man_made") === "drinking_fountain") categories.push("water");
    if (tag("amenity") === "toilets") categories.push("toilets");
    if (!categories.length) continue;
    const drinking = tag("drinking_water"), legal = tag("drinking_water:legal");
    // Explicit negatives/conflicts beat the implicit drinking-water amenity tag.
    const potable = drinking === "no" ? "no" : legal === "no" ? "unknown"
      : drinking === "yes" || !drinking && (tag("amenity") === "drinking_water" || tag("man_made") === "drinking_fountain") ? "yes" : "unknown";
    const object = `${element.type}/${element.id}`;
    const tags = Object.fromEntries(retainedTags.flatMap(key => tag(key) === undefined ? [] : [[key, tag(key)!]]));
    facilities.set(object, { id: `osm:${object}`, lat: p.lat, lon: p.lon, url: `https://www.openstreetmap.org/${object}`,
      name: tag("name") ?? tag("name:en") ?? tag("name:de") ?? (categories.length === 2 ? "Toilets and water" : categories[0] === "toilets" ? "Toilets" : tag("amenity") === "fountain" ? "Water fountain" : "Water point"),
      categories, potable, tags, area: element.type !== "node" });
  }
  const updatedAt = raw.osm3s?.timestamp_osm_base;
  return { schema: 1, provider: "osm", facilities: [...facilities.values()], fetchedAt, source: OSM_COPYRIGHT,
    updatedAt: updatedAt && /^\d{4}-\d{2}-\d{2}T/.test(updatedAt) && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : undefined };
}

export function validAmenityData(value: unknown): value is AmenityData {
  const data = value as AmenityData;
  return !!data && data.schema === 1 && data.provider === "osm" && data.source === OSM_COPYRIGHT
    && Number.isFinite(Date.parse(data.fetchedAt)) && Array.isArray(data.facilities) && data.facilities.length <= 100000
    && data.facilities.every(f => f && validPoint(f) && /^osm:(node|way|relation)\/[1-9]\d*$/.test(f.id)
      && f.url === `https://www.openstreetmap.org/${f.id.slice(4)}` && typeof f.name === "string" && typeof f.area === "boolean"
      && ["yes", "no", "unknown"].includes(f.potable) && Array.isArray(f.categories) && f.categories.length > 0 && f.categories.length <= 2
      && f.categories.every(c => c === "water" || c === "toilets") && f.tags && typeof f.tags === "object" && !Array.isArray(f.tags)
      && Object.values(f.tags).every(v => typeof v === "string"));
}

const publicAccess = ["yes", "public", "permissive"];
export function amenityAccessValue(f: Amenity, category: AmenityCategory) {
  return f.tags[category === "water" ? "drinking_water:access" : "toilets:access"] ?? f.tags.access;
}
export function amenityRestricted(f: Amenity, category: AmenityCategory): boolean {
  const access = amenityAccessValue(f, category);
  return !!access && !publicAccess.includes(access) && access !== "unknown"
    || !!f.tags["access:conditional"] || f.tags.locked === "yes"
    || category === "toilets" && !!f.tags.centralkey && f.tags.centralkey !== "no"
    || ["closed", "off", "out_of_service", "non_operational", "non-operational", "broken", "no"].includes(f.tags.operational_status ?? "")
    || ["closed", "off"].includes(f.tags.opening_hours?.trim().toLowerCase() ?? "");
}
export function amenityAccess(f: Amenity, category: AmenityCategory): string {
  const value = amenityAccessValue(f, category);
  const labels: Record<string, string> = { yes: "Public access mapped", public: "Public access mapped", permissive: "Access permitted by the owner",
    private: "Private access", no: "Access not permitted", customers: "Customers only", members: "Members only", permit: "Permit required", destination: "Visitors to this destination only", centralkey: "Special access key required" };
  return value ? labels[value] ?? `Mapped access: ${value}` : "Access conditions not supplied";
}
export const AMENITY_STYLES = {
  drink: { color: "#12699d", label: "Mapped drinking water" }, nonDrink: { color: "#b64432", label: "Not drinking water" },
  public: { color: "#19715c", label: "Public access mapped" }, restricted: { color: "#99540f", label: "Restricted / unavailable" },
  waterUnknown: { color: "#626973", label: "Drinkability unconfirmed" }, toiletUnknown: { color: "#626973", label: "Access unknown" },
};
export function amenityStyle(f: Amenity, category: AmenityCategory) {
  if (category === "water" && f.potable === "no") return AMENITY_STYLES.nonDrink;
  if (amenityRestricted(f, category)) return AMENITY_STYLES.restricted;
  if (category === "water") return f.potable === "yes" ? AMENITY_STYLES.drink : AMENITY_STYLES.waterUnknown;
  return publicAccess.includes(amenityAccessValue(f, category) ?? "") ? AMENITY_STYLES.public : AMENITY_STYLES.toiletUnknown;
}
export function closestAmenity(facilities: readonly Amenity[], from: Point | null, category: AmenityCategory) {
  return closestBikeParking(facilities.filter(f => f.categories.includes(category) && !amenityRestricted(f, category)
    && (category !== "water" || f.potable === "yes")), from);
}
export function amenityDetails(f: Amenity, category: AmenityCategory): string[] {
  const tags = f.tags;
  const details = [amenityStyle(f, category).label, amenityAccess(f, category),
    tags.fee === "yes" ? "Fee applies; check the tariff" : tags.fee === "no" ? "Mapped as free of charge" : tags.fee ? `Mapped fee: ${tags.fee}; check the terms` : "Fee not supplied",
    tags.opening_hours ? `Mapped hours: ${tags.opening_hours} (not checked for arrival)` : "Opening hours unknown"];
  if (category === "water") {
    details.push(f.potable === "yes" ? "Mapped as drinking water; check local signs. No live quality or flow check." : f.potable === "no" ? "Do not use this point as drinking water." : "Do not assume this water is drinkable; check local signs.");
    if (tags.drinking_water) details.push(`Water tag: ${tags.drinking_water}`);
    if (tags["drinking_water:legal"] === "no") details.push('Mapped with a “No drinking water” sign / no official approval.');
    details.push(tags.bottle === "yes" ? "Bottle filling mapped" : tags.bottle === "no" ? "Bottle filling not suitable" : "Bottle filling unknown");
  }
  for (const [key, label] of [["operator", "Operator"], ["charge", "Mapped charge"], ["seasonal", "Seasonal operation"], ["drinking_water:seasonal", "Seasonal water"],
    ["intermittent", "Intermittent flow"], ["wheelchair", "Wheelchair access"], ["toilets:wheelchair", "Toilet wheelchair access"], ["changing_table", "Changing table"],
    ["toilets:position", "Toilet type"], ["unisex", "Unisex"], ["male", "Male facilities"], ["female", "Female facilities"], ["centralkey", "Access key"],
    ["locked", "Locked"], ["indoor", "Indoors"], ["operational_status", "Mapped operating status"], ["access:conditional", "Conditional access"]]) {
    if (tags[key]) details.push(`${label}: ${tags[key]}`);
  }
  if (f.area) details.push("Mapped area/line centre; entrance not verified.");
  if (f.categories.length > 1) details.push("This mapped place includes both water and toilets.");
  return details;
}
