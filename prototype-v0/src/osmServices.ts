import type { Amenity, AmenityData } from "./osmAmenities.ts";

export type ServiceCategory = "repairs" | "food";
export type ServiceDataset = ServiceCategory | "food-dining";
export type ServiceKind = "pump" | "station" | "diy" | "mechanic" | "shop" | "parts" | "bakery" | "groceries" | "vending" | "cafe" | "restaurant";
export const SERVICE_FILTERS: Record<ServiceCategory, { kind: ServiceKind; label: string; default: boolean }[]> = {
  repairs: [
    { kind: "pump", label: "Pumps", default: true }, { kind: "station", label: "Self-service stations", default: true },
    { kind: "diy", label: "DIY workshops", default: true }, { kind: "mechanic", label: "Repair workshops", default: true },
    { kind: "shop", label: "Bike shops", default: true }, { kind: "parts", label: "Parts / tube machines", default: true },
  ],
  food: [
    { kind: "bakery", label: "Bakeries", default: true }, { kind: "groceries", label: "Groceries / farm shops", default: true },
    { kind: "vending", label: "Food / drink machines", default: true }, { kind: "cafe", label: "Cafés", default: false },
    { kind: "restaurant", label: "Restaurants / takeaway", default: false },
  ],
};
export const FOOD_VENDING = ["food", "drinks", "snacks", "sweets", "water", "bread", "sandwiches", "milk", "cheese", "eggs", "fruit", "ice_cream", "coffee", "tea", "pizza"];
const tokens = (value?: string) => (value ?? "").toLowerCase().split(";").map(v => v.trim()).filter(Boolean);
const groceries = ["supermarket", "convenience", "grocery", "greengrocer", "farm", "food"];
// Fixed Swiss regional queries: user coordinates, routes and arbitrary queries are never sent upstream.
export const OSM_SERVICE_QUERIES: Record<ServiceDataset, string> = {
  repairs: '[out:json][timeout:30];(nwr["shop"="bicycle"];nwr["amenity"~"^(bicycle_repair_station|compressed_air)$"];nwr["service:bicycle:pump"="yes"];nwr["service:bicycle:repair"="yes"];nwr["service:bicycle:diy"="yes"];nwr["service:bicycle:parts"="yes"];nwr["amenity"="vending_machine"]["vending"~"(^|;)[ ]*bicycle_(tube|parts)[ ]*(;|$)"];);out center tags;',
  food: `[out:json][timeout:30];(nwr["shop"~"^(bakery|pastry|supermarket|convenience|grocery|greengrocer|farm|food)$"];nwr["amenity"="vending_machine"]["vending"~"(^|;)[ ]*(${FOOD_VENDING.join("|")})[ ]*(;|$)"];);out center tags;`,
  "food-dining": '[out:json][timeout:30];nwr["amenity"~"^(cafe|restaurant|fast_food)$"];out center tags;',
};
export const SERVICE_TAGS = ["shop", "brand", "vending", "valves", "bicycle", "repair", "opening_hours:workshop", "lastcheck:status", "check_date",
  "service:bicycle:pump", "service:bicycle:tools", "service:bicycle:stand", "service:bicycle:repair", "service:bicycle:diy", "service:bicycle:parts",
  "service:bicycle:retail", "service:bicycle:ebike_maintenance", "service:bicycle:pump:operational_status", "service:bicycle:tools:operational_status",
  "service:bicycle:repair:operational_status", "website", "contact:website", "phone", "contact:phone", "cuisine", "takeaway",
  "payment:cash", "payment:coins", "payment:credit_cards", "payment:debit_cards", "payment:contactless", "payment:twint",
  "addr:street", "addr:housenumber", "addr:postcode", "addr:city"];

export function serviceKinds(tags: Record<string, string>, category: ServiceCategory): ServiceKind[] {
  const kinds: ServiceKind[] = [], vending = tokens(tags.vending);
  if (category === "food") {
    if (["bakery", "pastry"].includes(tags.shop)) kinds.push("bakery");
    if (groceries.includes(tags.shop)) kinds.push("groceries");
    if (tags.amenity === "vending_machine" && vending.some(v => FOOD_VENDING.includes(v))) kinds.push("vending");
    if (tags.amenity === "cafe") kinds.push("cafe");
    if (["restaurant", "fast_food"].includes(tags.amenity)) kinds.push("restaurant");
    return kinds;
  }
  const air = tags.amenity === "compressed_air" && tags.bicycle !== "no"
    && (tags.bicycle === "yes" || tokens(tags.valves).some(v => ["presta", "sclaverand", "dunlop"].includes(v)));
  if (tags.bicycle !== "no" && (tags["service:bicycle:pump"] === "yes" || air && tags["service:bicycle:pump"] !== "no")) kinds.push("pump");
  if (tags.amenity === "bicycle_repair_station" && tags["service:bicycle:tools"] !== "no") kinds.push("station");
  if (tags["service:bicycle:diy"] === "yes") kinds.push("diy");
  if (tags["service:bicycle:repair"] === "yes" || tags.shop === "bicycle" && tags.repair === "yes" && !tags["service:bicycle:repair"]) kinds.push("mechanic");
  if (tags.shop === "bicycle") kinds.push("shop");
  if (tags["service:bicycle:parts"] === "yes" || tags.amenity === "vending_machine" && vending.some(v => ["bicycle_tube", "bicycle_parts"].includes(v))) kinds.push("parts");
  return kinds;
}
export function serviceMatches(f: Amenity, category: ServiceCategory, selected: readonly ServiceKind[]) {
  return facilityServiceKinds(f, category).some(kind => selected.includes(kind));
}
export function facilityServiceKinds(f: Amenity, category: ServiceCategory): ServiceKind[] {
  return [...new Set([...serviceKinds(f.tags, category), ...(f.id.startsWith("local:") ? f.reportedKinds ?? [] : [])])]
    .filter(kind => SERVICE_FILTERS[category].some(item => item.kind === kind));
}
export function serviceDatasetMatches(tags: Record<string, string>, dataset: ServiceDataset) {
  const kinds = serviceKinds(tags, dataset === "repairs" ? "repairs" : "food");
  return dataset === "repairs" ? kinds.length > 0 : dataset === "food-dining" ? kinds.some(kind => kind === "cafe" || kind === "restaurant")
    : kinds.some(kind => kind === "bakery" || kind === "groceries" || kind === "vending");
}
export function serviceSummary(f: Amenity, category: ServiceCategory) {
  const kinds = facilityServiceKinds(f, category);
  return SERVICE_FILTERS[category].filter(item => kinds.includes(item.kind)).map(item => item.label).join(" · ");
}
export function serviceUnavailable(tags: Record<string, string>) {
  return ["needs_repair", "broken", "non_operational", "not_working"].includes(tags["lastcheck:status"] ?? "");
}
export function serviceKindAvailable(f: Amenity, kind: ServiceKind) {
  const key = kind === "pump" ? "pump" : kind === "station" ? "tools" : kind === "mechanic" ? "repair" : undefined;
  if (key && ["broken", "no", "off", "closed", "out_of_service", "non_operational", "non-operational"].includes(f.tags[`service:bicycle:${key}:operational_status`] ?? "")) return false;
  return kind !== "mechanic" || !["off", "closed"].includes(f.tags["opening_hours:workshop"]?.trim().toLowerCase() ?? "");
}
export function serviceDetails(f: Amenity, category: ServiceCategory): string[] {
  const t = f.tags, details = [serviceSummary(f, category)];
  if (category === "repairs") {
    const evidence = (key: string) => t[key] === "yes" ? "mapped" : t[key] === "no" ? "not available according to the map" : t[key] ? `mapped value: ${t[key]}` : "unknown";
    details.push(`Repair service: ${serviceKinds(t, category).includes("mechanic") ? "mapped; contact the workshop about the work and availability" : evidence("service:bicycle:repair")}`);
    details.push(`Bicycle pump: ${serviceKinds(t, category).includes("pump") ? "mapped" : evidence("service:bicycle:pump")}`);
    details.push(`Valve compatibility: ${t.valves ?? "unknown"}`, `Tools: ${evidence("service:bicycle:tools")}`);
    if (t["service:bicycle:diy"] === "yes") details.push("DIY tools/workspace mapped; staff assistance, membership and session times need checking.");
    if (t["service:bicycle:diy"] === "yes" && t["service:bicycle:repair"] === "yes") details.push("DIY and repair services are both mapped. Check whether staff do the repair or guide you through it.");
    for (const [key, label] of [["pump", "Pump"], ["tools", "Tools"], ["repair", "Repair service"]]) if (t[`service:bicycle:${key}:operational_status`]) details.push(`${label} condition: ${t[`service:bicycle:${key}:operational_status`]}`);
    if (t["opening_hours:workshop"]) details.push(`Workshop hours: ${t["opening_hours:workshop"]} (not checked for arrival)`);
    if (t["service:bicycle:ebike_maintenance"]) details.push(`E-bike maintenance: ${t["service:bicycle:ebike_maintenance"]}`);
    if (t["lastcheck:status"]) details.push(`Reported equipment condition: ${t["lastcheck:status"]}`);
    details.push("No live equipment or mechanic-availability check. Access on foot or pushing a bicycle has not been routed.");
  } else {
    if (t.shop) details.push(`Shop type: ${t.shop}`);
    if (t.cuisine) details.push(`Cuisine: ${t.cuisine}`);
    if (t.takeaway) details.push(`Takeaway: ${t.takeaway}`);
    details.push(t.shop === "farm" ? "Farm products mapped; ready-to-eat snacks and stock are unknown." : "Products and stock have not been checked live.");
  }
  if (t.vending) details.push(`Mapped machine contents: ${t.vending}`);
  const address = [t["addr:street"], t["addr:housenumber"], t["addr:postcode"], t["addr:city"]].filter(Boolean).join(" ");
  if (address) details.push(`Address: ${address}`);
  if (t.phone || t["contact:phone"]) details.push(`Phone: ${t.phone ?? t["contact:phone"]}`);
  for (const key of SERVICE_TAGS.filter(k => k.startsWith("payment:"))) if (t[key]) details.push(`${key.replace("payment:", "Payment · ").replaceAll("_", " ")}: ${t[key]}`);
  if (t.check_date) details.push(`Mapped check date: ${t.check_date}`);
  return details;
}
export function serviceLinks(tags: Record<string, string>): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  const website = tags.website ?? tags["contact:website"];
  if (website) try {
    const url = new URL(website.startsWith("www.") ? `https://${website}` : website);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) links.push({ label: "Website", href: url.href });
  } catch { /* Keep unsafe or malformed source values out of clickable links. */ }
  const phone = (tags.phone ?? tags["contact:phone"] ?? "").split(";")[0].trim();
  if (/^\+?[\d ()/.-]{6,30}$/.test(phone) && phone.replace(/\D/g, "").length >= 6) links.push({ label: "Call", href: `tel:${phone.replace(/[^\d+]/g, "")}` });
  return links;
}

export function mergeFoodData(quick?: AmenityData, dining?: AmenityData): AmenityData | undefined {
  const sources = [quick, dining].filter((data): data is AmenityData => !!data).sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));
  if (!sources.length) return undefined;
  const records = new Map<string, Amenity>();
  for (const source of sources) for (const facility of source.facilities) records.set(facility.id, facility);
  return { ...sources[0], dataset: "food", facilities: [...records.values()], stale: sources.some(source => source.stale) };
}
