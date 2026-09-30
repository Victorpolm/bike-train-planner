import type { Amenity, AmenityCategory } from "./osmAmenities.ts";
import { safePublicLink } from "./amenityLocation.ts";

export type FacilityProvider = "graubuenden" | "sbb" | "swisstlm3d";
export const FACILITY_SOURCES = {
  graubuenden: { label: "Graubünden Tourism · rural water pilot", url: "https://www.graubuenden.ch/de/ausflugsziele", scope: "Eight published refill locations around Flims, Laax, Sagogn and Trin." },
  sbb: { label: "© SBB CFF FFS · station facilities", url: "https://doc.trafimage.ch/", scope: "Ten pilot stations; locations and floors from public station-plan data." },
  swisstlm3d: { label: "© swisstopo · swissTLM3D", url: "https://www.swisstopo.admin.ch/en/landscape-model-swisstlm3d", scope: "February 2026 edition, prepared 30 September 2026. Topographic fountains and springs; incomplete coverage and no drinking-water confirmation." },
} as const;
// Identifiers and aliases observed in SBB's public station-plan catalogue.
export const FACILITY_STATIONS = [
  { id: "8503000", name: "Zürich HB", alias: "zuerich-hb" }, { id: "8507000", name: "Bern", alias: "bern" },
  { id: "8500010", name: "Basel SBB", alias: "basel-sbb" }, { id: "8501120", name: "Lausanne", alias: "lausanne" },
  { id: "8501008", name: "Genève", alias: "geneve" }, { id: "8505000", name: "Luzern", alias: "luzern" },
  { id: "8506000", name: "Winterthur", alias: "winterthur" }, { id: "8506302", name: "St. Gallen", alias: "st-gallen" },
  { id: "8500218", name: "Olten", alias: "olten" }, { id: "8505300", name: "Lugano", alias: "lugano" },
] as const;
export const RURAL_WATER_PAGES = ["sagogn-planezzas", "crestasee", "fidazerhof-fidaz", "via-vilada-sagogn", "cresta-sagogn",
  "via-lavanuz-laax-murschetg", "via-rezga-trin-mulin", "dorfplatz-trin"] as const;
export const ruralWaterUrl = (slug: string) => `https://www.graubuenden.ch/de/ausflugsziele/wasserbrunnen-${slug}`;

export type FacilityProvenance = { provider: FacilityProvider; retrievedAt: string; updatedAt?: string; datasetDate?: string;
  note: string; referenceOsmIds?: string[] };
export type FacilityData = { schema: 1; provider: FacilityProvider; key: string; fetchedAt: string; facilities: Amenity[]; stale?: boolean };
export type FacilityJob = { key: string; provider: FacilityProvider; label: string; path: string };
export const FACILITY_JOBS: FacilityJob[] = [
  ...RURAL_WATER_PAGES.map(slug => ({ key: `graubuenden/${slug}`, provider: "graubuenden" as const, label: `Water · ${slug.replaceAll("-", " ")}`, path: `/api/facilities/v1/graubuenden/${slug}` })),
  ...FACILITY_STATIONS.map(s => ({ key: `sbb/${s.id}`, provider: "sbb" as const, label: s.name, path: `/api/facilities/v1/sbb/${s.id}` })),
  { key: "swisstlm3d", provider: "swisstlm3d", label: "swissTLM3D", path: "/api/facilities/v1/swisstlm3d" },
];
export type FacilityLoad = FacilityJob & { status: "idle" | "loading" | "ready" | "error"; data?: FacilityData; error?: string };
export const validSwissPoint = (lat: unknown, lon: unknown): lat is number => typeof lat === "number" && typeof lon === "number"
  && Number.isFinite(lat) && Number.isFinite(lon) && lat >= 45.7 && lat <= 47.95 && lon >= 5.9 && lon <= 10.6;
const short = (v: unknown, max = 2000): v is string => typeof v === "string" && v.length <= max;
const object = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);

export function validFacilityData(value: unknown, job: Pick<FacilityJob, "provider" | "key">): value is FacilityData {
  const d = value as FacilityData;
  return object(d) && d.schema === 1 && d.provider === job.provider && d.key === job.key && short(d.fetchedAt, 40) && Number.isFinite(Date.parse(d.fetchedAt))
    && (d.stale === undefined || typeof d.stale === "boolean")
    && Array.isArray(d.facilities) && d.facilities.length <= 30000 && d.facilities.every(f => f && validSwissPoint(f.lat, f.lon)
      && short(f.id, 250) && f.id.startsWith(`${job.provider}:`) && short(f.name, 300) && !!safePublicLink(f.url)
      && (job.provider !== "graubuenden" || f.id === `graubuenden:${job.key.split("/")[1]}`)
      && (job.provider !== "sbb" || f.id.startsWith(`sbb:${job.key.split("/")[1]}:`))
      && typeof f.area === "boolean" && ["yes", "no", "unknown"].includes(f.potable)
      && Array.isArray(f.categories) && f.categories.length > 0 && f.categories.every(c => ["water", "toilets", "food", "repairs"].includes(c))
      && (job.provider === "sbb" || f.categories.length === 1 && f.categories[0] === "water")
      && (job.provider !== "swisstlm3d" || f.potable === "unknown")
      && object(f.tags) && Object.keys(f.tags).length < 60 && Object.values(f.tags).every(v => short(v))
      && object(f.provenance) && f.provenance?.provider === job.provider && short(f.provenance.retrievedAt, 40) && Number.isFinite(Date.parse(f.provenance.retrievedAt)) && short(f.provenance.note)
      && (f.provenance.updatedAt === undefined || short(f.provenance.updatedAt, 40)) && (f.provenance.datasetDate === undefined || short(f.provenance.datasetDate, 40))
      && (f.provenance.referenceOsmIds === undefined || Array.isArray(f.provenance.referenceOsmIds) && f.provenance.referenceOsmIds.length <= 10 && f.provenance.referenceOsmIds.every(id => short(id, 80) && /^osm:(node|way|relation)\/[1-9]\d*$/.test(id)))
      && (f.location === undefined || object(f.location) && Object.entries(f.location).every(([k, v]) => short(v) && (k !== "planUrl" || !!safePublicLink(v))))
      && (f.additionalSources === undefined || Array.isArray(f.additionalSources) && f.additionalSources.length <= 10 && f.additionalSources.every(s => object(s) && short(s.label) && !!safePublicLink(s.url) && short(s.date) && ["feed", "document", "user-report"].includes(s.kind)))
      && !f.reportedKinds);
}

export function mergeFacilitySources(base: readonly Amenity[], extras: readonly Amenity[], categories: readonly AmenityCategory[]) {
  const byId = new Map(base.map(f => [f.id, f]));
  for (const f of extras) {
    if (!f.categories.some(c => categories.includes(c))) continue;
    // Only explicit reviewed identities can enrich existing OSM records. Never merge by distance/floor alone.
    const ids = (f.provenance?.referenceOsmIds ?? []).filter(id => byId.has(id));
    if (!ids.length) { byId.set(f.id, f); continue; }
    for (const id of ids) {
      const old = byId.get(id)!;
      const negative = old.potable === "no" || f.potable === "no";
      const extraLocation = [f.location?.floorLabel, f.location?.directions].filter(Boolean).join(" · ");
      byId.set(id, { ...old, name: old.name === "Water point" ? f.name : old.name,
        potable: negative ? "no" : old.tags["drinking_water:legal"] === "no" ? "unknown" : old.potable === "yes" || f.potable === "yes" ? "yes" : "unknown",
        // Restrictions and mapped coordinates are preserved; conflicting location descriptions remain visible.
        location: old.location ?? f.location,
        tags: { ...f.tags, ...old.tags, ...([old.tags.operational_status, f.tags.operational_status].includes("closed") ? { operational_status: "closed" } : {}) },
        additionalSources: [...old.additionalSources ?? [], ...f.additionalSources ?? []],
        provenance: f.provenance && { ...f.provenance, note: f.provenance.note + (old.location && extraLocation ? ` Additional provider location: ${extraLocation}.` : "") } });
    }
  }
  return [...byId.values()].filter(f => f.categories.some(c => categories.includes(c)));
}
