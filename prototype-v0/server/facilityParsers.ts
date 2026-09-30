import { FACILITY_STATIONS, ruralWaterUrl, validSwissPoint, type FacilityData, type FacilityJob } from "../src/facilitySources.ts";
import type { Amenity } from "../src/osmAmenities.ts";

const text = (v: unknown, max = 500) => typeof v === "string" ? v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
export function decodeHtml(value: string) {
  return value.replace(/&(?:quot|apos|amp|lt|gt|#(?:x[0-9a-f]+|\d+));/gi, s => {
    const named: Record<string, string> = { "&quot;": '"', "&apos;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">" };
    if (named[s.toLowerCase()]) return named[s.toLowerCase()];
    const n = s[2].toLowerCase() === "x" ? parseInt(s.slice(3, -1), 16) : Number(s.slice(2, -1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  });
}
export function parseRuralWater(html: string, slug: string, fetchedAt: string): Amenity[] {
  const page = decodeHtml(html), coordinate = page.match(/"coordinates"\s*:\s*\{\s*"lat"\s*:\s*([\d.]+)\s*,\s*"lng"\s*:\s*([\d.]+)\s*\}/);
  const name = text(page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (!coordinate || !name || !/Flims Laax Falera Management AG/.test(page)) throw new Error("Rural source format changed");
  const lat = Number(coordinate[1]), lon = Number(coordinate[2]);
  if (!validSwissPoint(lat, lon) || lat < 46.7 || lat > 47 || lon < 9.1 || lon > 9.5) throw new Error("Unexpected rural location");
  const negative = /kein(?:e?s)?\s+Trinkwasser|nicht\s+trinkbar/i.test(page);
  const potable = negative ? "no" : /Offizielles\s+Trinkwasser/i.test(page) ? "yes" : "unknown";
  const url = ruralWaterUrl(slug);
  return [{ id: `graubuenden:${slug}`, name, lat, lon, url, area: false, categories: ["water"], potable,
    tags: { amenity: "fountain" },
    provenance: { provider: "graubuenden", retrievedAt: fetchedAt,
      note: "Publisher map position and drinking-water description. Public access, seasonal shutdowns and current flow have not been checked on site." },
    additionalSources: [{ kind: "feed", label: "Source: Graubünden Tourism / Flims Laax Falera", url, date: fetchedAt.slice(0, 10),
      note: "Published information; retrieval is not an on-site check." }] }];
}

function stationHours(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"], result: string[] = [];
  for (const block of value.slice(0, 15)) {
    if (!block || !Array.isArray(block.openinghours)) continue;
    const period = [text(block.valid_from, 50), text(block.valid_until, 50)].filter(Boolean).join(" to ");
    for (const h of block.openinghours.slice(0, 25)) {
      if (!h || !Number.isInteger(h.day_from) || !Number.isInteger(h.day_to) || h.day_from < 0 || h.day_to > 6 || h.day_to < h.day_from) continue;
      const a = text(h.time_from, 8), b = text(h.time_to, 8);
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(a) || !/^\d{2}:\d{2}(:\d{2})?$/.test(b)) continue;
      result.push(`${period ? `[${period}] ` : ""}${days[h.day_from]}${h.day_to === h.day_from ? "" : `-${days[h.day_to]}`} ${a.slice(0, 5)}-${b.slice(0, 5)}${block.holiday ? " (holiday schedule)" : ""}`);
    }
  }
  return result.join("; ").slice(0, 1800);
}

export function parseStationFacilities(value: unknown, stationId: string, fetchedAt: string): Amenity[] {
  const station = FACILITY_STATIONS.find(s => s.id === stationId);
  const data = value as { type?: string; features?: { geometry?: { type?: string; coordinates?: unknown[] }; properties?: Record<string, any> }[] };
  if (!station || data?.type !== "FeatureCollection" || !Array.isArray(data.features) || data.features.length > 5000) throw new Error("Invalid station source");
  const records = new Map<string, Amenity>();
  for (const f of data.features) {
    const p = f?.properties;
    if (!p || String(p.station_uic) !== stationId || f.geometry?.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates ?? [];
    if (!validSwissPoint(lat, lon)) continue;
    const key = text(p.url_identifier, 180), type = text(p.subcategory, 80);
    if (!/^[a-z0-9_-]+$/i.test(key)) continue;
    const tags: Record<string, string> = {}, categories: Amenity["categories"] = [];
    let potable: Amenity["potable"] = "unknown";
    if (["toilet", "toilet_sbb"].includes(type)) { categories.push("toilets"); tags.amenity = "toilets"; }
    else if (["drinking_water", "fountain"].includes(type)) { categories.push("water"); tags.amenity = type; potable = type === "drinking_water" ? "yes" : "unknown"; }
    else if (["supermarket", "food", "bakery", "cafe", "restaurant", "take_away", "fast_food"].includes(type)) {
      categories.push("food");
      if (["supermarket", "food", "bakery"].includes(type)) tags.shop = type === "food" ? "convenience" : type;
      else tags.amenity = type === "take_away" ? "fast_food" : type;
    } else continue; // Generic shops, kiosks, machines and rental are not proof of food/repair service.
    const hours = stationHours(p.openinghours); if (hours) tags.opening_hours = hours;
    const from = Date.parse(p.valid_from), until = Date.parse(p.valid_until) + (/^\d{4}-\d{2}-\d{2}$/.test(p.valid_until ?? "") ? 86400000 - 1 : 0), now = Date.parse(fetchedAt);
    if (Number.isFinite(from) && from > now || Number.isFinite(until) && until < now) tags.operational_status = "closed";
    const floor = text(p.floor?.name?.en ?? p.floor?.name?.de ?? p.floor?.name?.fr ?? p.floor?.name?.it, 180);
    if (Number.isFinite(p.floor?.level)) tags.level = String(p.floor.level);
    const plan = `https://plans.trafimage.ch/${station.alias}`, url = `https://api.insa.geops.ch/export/geo/stations/${stationId}/services`;
    const name = text(p.name_en ?? p.name ?? p.display_name, 300) || (categories[0] === "toilets" ? "Station toilet" : "Station facility");
    records.set(key, { id: `sbb:${stationId}:${key}`, name, lat, lon: lon as number, area: false, url, categories, potable, tags,
      location: { building: station.name, ...(floor ? { floorLabel: floor } : {}),
        directions: text(p.location_details_en || p.location_details_de || p.location_details_fr || p.location_details_it),
        planUrl: plan, planLabel: `Open ${station.name} station plan` },
      provenance: { provider: "sbb", retrievedAt: fetchedAt, updatedAt: text(p.modified, 40) || undefined,
        note: "SBB station-plan position. The plan floor and more specific location description can differ; follow the location text and current signs. Entrance and indoor route are not verified.",
        ...(stationId === "8503000" && key === "geo-mcclean-hygienecenter-wcdusche-5cdb"
          ? { referenceOsmIds: ["osm:node/4424615154", "osm:node/4833061590"] } : {}) },
      additionalSources: [{ kind: "feed", label: "Source: © SBB CFF FFS · public Trafimage station data", url, date: fetchedAt.slice(0, 10), note: "Provider data; no live access or facility availability check." }] });
  }
  return [...records.values()];
}

export function facilityData(job: FacilityJob, facilities: Amenity[], fetchedAt: string): FacilityData {
  return { schema: 1, provider: job.provider, key: job.key, facilities, fetchedAt };
}
