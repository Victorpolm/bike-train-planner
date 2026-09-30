import type { Amenity } from "./osmAmenities.ts";

export type AmenityLocation = {
  building?: string; floorLabel?: string; zone?: string; directions?: string;
  precision?: "building"; planUrl?: string; planLabel?: string;
};
export type AmenityEvidence = {
  label: string; url: string; date: string; kind: "user-report" | "document" | "feed"; note?: string;
};
export const LOCATION_TAGS = ["level", "level:ref", "addr:floor", "addr:housename", "addr:place", "addr:unit", "addr:door",
  "location", "entrance", "description", "description:en", "description:de", "description:fr", "description:it", "wheelchair:description"];

export function locationSummary(f: Amenity): string {
  const floor = f.location?.floorLabel ?? f.tags["level:ref"] ?? f.tags.level ?? f.tags["addr:floor"];
  return [floor ? `Floor ${floor}` : "", f.location?.precision === "building" ? "approximate building location" : ""].filter(Boolean).join(" · ");
}
export function amenityLocationDetails(f: Amenity): string[] {
  const t = f.tags, l = f.location, details: string[] = [];
  const building = l?.building ?? t["addr:housename"], floor = t["level:ref"] ?? t.level ?? t["addr:floor"];
  if (building) details.push(`Building: ${building}`);
  if (l?.floorLabel) details.push(`Floor: ${l.floorLabel}`);
  if (floor && floor !== l?.floorLabel) details.push(`Mapped floor: ${floor}`);
  if (!l?.floorLabel && !floor && (t.indoor === "yes" || t.location === "indoor" || building)) details.push("Floor unknown");
  if (l?.zone) details.push(`Zone: ${l.zone}`);
  if (t["addr:place"]) details.push(`Mapped place: ${t["addr:place"]}`);
  if (t["addr:unit"]) details.push(`Room / unit: ${t["addr:unit"]}`);
  if (t["addr:door"]) details.push(`Door: ${t["addr:door"]}`);
  if (l?.directions) details.push(`Finding it: ${l.directions}`);
  const description = t["description:en"] ?? t.description ?? t["description:de"] ?? t["description:fr"] ?? t["description:it"];
  if (description) details.push(`Mapped description: ${description}`);
  if (t["wheelchair:description"]) details.push(`Accessibility details: ${t["wheelchair:description"]}`);
  if (t.entrance) details.push(`Mapped entrance type: ${t.entrance}`);
  if (l?.precision === "building") details.push("Approximate building location; the pin is not the machine or an entrance. Distance is to the building reference point.");
  else if (f.area) details.push("Mapped area/line centre; entrance not verified.");
  if (t.indoor === "yes" || l?.floorLabel || floor) details.push("Indoor walking route and entrance have not been checked.");
  for (const source of f.additionalSources ?? []) {
    details.push(`${source.kind === "user-report" ? "User report" : source.kind === "feed" ? "Source retrieved" : "Document reviewed"}: ${source.date}. ${source.note ?? "Not checked on site."}`);
  }
  if (f.provenance?.updatedAt) details.push(`Provider record updated: ${f.provenance.updatedAt} (not an on-site observation date)`);
  if (f.provenance?.datasetDate) details.push(`Dataset edition: ${f.provenance.datasetDate}`);
  if (f.provenance?.note) details.push(f.provenance.note);
  return details;
}
export function safePublicLink(value?: string): string | undefined {
  if (!value) return;
  try { const u = new URL(value); if (["https:", "http:"].includes(u.protocol) && !u.username && !u.password) return u.href; } catch { /* Ignore invalid source links. */ }
}
export function amenityLocationLinks(f: Amenity): { label: string; href: string }[] {
  const href = safePublicLink(f.location?.planUrl);
  return href ? [{ label: f.location?.planLabel ?? "Open building / station plan", href }] : [];
}
export function amenitySourceLinks(f: Amenity): { label: string; href: string }[] {
  const sources = /^osm:(node|way|relation)\/[1-9]\d*$/.test(f.id)
    ? [{ label: "Source: © OpenStreetMap contributors", url: f.url }, ...(f.additionalSources ?? [])]
    : f.additionalSources ?? [];
  return sources.flatMap(source => { const href = safePublicLink(source.url); return href ? [{ label: source.label, href }] : []; });
}
