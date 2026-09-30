import type { Amenity, AmenityCategory } from "./osmAmenities.ts";
import type { AmenityEvidence, AmenityLocation } from "./amenityLocation.ts";

export type ReviewedAmenityEntry = {
  id: string; location: AmenityLocation; evidence: AmenityEvidence[];
} & ({ kind: "addition"; facility: Amenity; replacesOsmIds?: string[] }
  | { kind: "location-details"; osmIds: string[] });

const stationPlan = "https://company.sbb.ch/content/dam/infrastruktur/trafimage/bahnhofplaene/plan-zuerich-hb-a4.pdf";
const report = "https://github.com/Victorpolm/bike-train-planner/blob/main/docs/APP_ROADMAP.md#30-september-proposal-keep-facility-coverage-manageable";

// Small reviewed inventory. Source review is distinct from an on-site visit.
// New OSM links must be established by review; never match by proximity alone.
export const REVIEWED_AMENITIES: readonly ReviewedAmenityEntry[] = [
  {
    id: "eth-hg-selecta-f", kind: "addition",
    facility: {
      id: "local:eth-hg-selecta-f", name: "Selecta machines · ETH HG", url: report,
      lat: 47.3764269, lon: 8.5478101, area: true, categories: ["food"], potable: "unknown",
      tags: { amenity: "vending_machine", brand: "Selecta", indoor: "yes", "addr:street": "Rämistrasse", "addr:housenumber": "101" },
      reportedKinds: ["vending"],
    },
    location: { building: "ETH Hauptgebäude (HG)", floorLabel: "F", directions: "Next to the Starbucks coffee machines.", precision: "building" },
    evidence: [
      { kind: "user-report", label: "Source: project owner report", url: report, date: "2026-09-30",
        note: "At least two machines reported together. Exact positions, products, access hours and stock have not been independently checked." },
      { kind: "document", label: "Building reference: © OpenStreetMap contributors", url: "https://www.openstreetmap.org/way/192151232", date: "2026-09-30",
        note: "Building centre used only as an approximate map reference." },
    ],
  },
  {
    id: "zurich-hb-hygienecenter", kind: "location-details", osmIds: ["osm:node/4424615154", "osm:node/4833061590"],
    location: { building: "Zürich HB", floorLabel: "Zwischengeschoss (intermediate floor)", zone: "Official station plan: grid L7",
      directions: "Follow signs for Hygienecenter / WC. Use the station plan to find grid L7; follow current signs during building works.",
      planUrl: stationPlan, planLabel: "Open Zürich HB station plan (PDF)" },
    evidence: [{ kind: "document", label: "Location source: SBB station plan", url: stationPlan, date: "2026-09-30",
      note: "Plan dated December 2025; floor and grid reviewed, no on-site entrance or accessibility check." }],
  },
];

export function withReviewedAmenities(facilities: readonly Amenity[], categories: readonly AmenityCategory[],
  entries: readonly ReviewedAmenityEntry[] = REVIEWED_AMENITIES): Amenity[] {
  const records = new Map(facilities.map(f => [f.id, f]));
  for (const entry of entries) {
    if (entry.kind === "addition") {
      if (!entry.facility.categories.some(c => categories.includes(c))) continue;
      // A reviewed migration to OSM suppresses the local duplicate only when that record is loaded.
      const matches = (entry.replacesOsmIds ?? []).filter(id => records.has(id));
      if (matches.length) {
        records.delete(entry.facility.id);
        for (const id of matches) {
          const f = records.get(id)!;
          records.set(id, { ...f, location: entry.location, additionalSources: entry.evidence });
        }
      } else records.set(entry.facility.id, { ...entry.facility, location: entry.location, additionalSources: entry.evidence });
    } else for (const id of entry.osmIds) {
      const f = records.get(id);
      if (f && f.categories.some(c => categories.includes(c))) records.set(id, { ...f, location: entry.location, additionalSources: entry.evidence });
    }
  }
  return [...records.values()].filter(f => f.categories.some(c => categories.includes(c)));
}
