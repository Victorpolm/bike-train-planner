import type { TransitLeg } from "./routing.ts";

export type BusPreference = "known-rules" | "include-unknown" | "no-buses";
export type BusCarriage = {
  permission: "conditional" | "not-allowed" | "unknown";
  operator: string;
  reservation: "check-service" | "unknown" | "not-applicable";
  reservationAvailability: "unknown";
  capacity: "unknown";
  ticket: "required" | "check-fare" | "unknown" | "not-applicable";
  instructions: readonly string[];
  source?: { title: string; url: string; checked: string };
};

const POSTBUS = { title: "PostBus bicycle rules", url: "https://www3.postauto.ch/en/travel-and-services/travel-advice-and-reservations/travelling-with-a-bike", checked: "2026-09-20" };
const ZVV = { title: "ZVV bicycle rules", url: "https://www.zvv.ch/en/travelcards-and-tickets/tickets/self-service-bicycle-transport.html", checked: "2026-09-20" };
const TPG = { title: "tpg bicycle rules", url: "https://www.tpg.ch/en/travel/helpful-tips/cyclists", checked: "2026-09-20" };
const normalize = (value?: string | null) => value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
const postbus = new Set(["PAG", "POSTAUTO", "POSTAUTO AG", "POSTBUS"]);
const zvvOperators: Record<string, string> = {
  VBZ: "VBZ", "VERKEHRSBETRIEBE ZÜRICH": "VBZ", VBG: "VBG", "VERKEHRSBETRIEBE GLATTAL": "VBG",
  VZO: "VZO", "VERKEHRSBETRIEBE ZÜRICHSEE UND OBERLAND": "VZO", "STADTBUS WINTERTHUR": "Stadtbus Winterthur",
};
const prohibited: Record<string, string> = {
  ABF: "Autobus Freienbach", "AUTOBUS FREIENBACH": "Autobus Freienbach",
  BRER: "Bus Rapperswil/Jona", "BUS RAPPERSWIL/JONA": "Bus Rapperswil/Jona",
};

export function isBus(leg: TransitLeg): boolean {
  // Use the provider's vehicle category, never a stop name or line number.
  return leg.mode === "transit" && ["B", "BUS", "NFB", "TROLLEYBUS", "COACH", "EV", "SEV"].includes(normalize(leg.category));
}

// Operator policies are conditional guidance, not confirmation for a departure.
// The timetable feed has no bicycle-space, reservation or trip-permission field.
export function busCarriage(leg: TransitLeg): BusCarriage | null {
  if (!isBus(leg)) return null;
  const operator = normalize(leg.operator);
  const unknown: BusCarriage = {
    permission: "unknown", operator: leg.operator || "Operator not supplied",
    reservation: "unknown", reservationAvailability: "unknown", capacity: "unknown", ticket: "unknown",
    instructions: ["Ask the operator whether this departure accepts a standard, unfolded bicycle, and check tickets and reservations before travelling."],
  };
  if (prohibited[operator]) return { ...unknown, operator: prohibited[operator], permission: "not-allowed",
    reservation: "not-applicable", ticket: "not-applicable", source: ZVV,
    instructions: ["The published operator rules exclude bicycle transport. This bus is excluded from journeys with your unfolded bicycle."] };
  // Replacement vehicles must not inherit an operator's ordinary bus policy.
  if (["EV", "SEV"].includes(normalize(leg.category))) return { ...unknown,
    instructions: ["This is a replacement service. Confirm bicycle carriage directly for this departure; ordinary operator rules may not apply."] };
  if (postbus.has(operator)) return { ...unknown, operator: "PostBus", permission: "conditional", ticket: "required",
    reservation: "check-service", source: POSTBUS, instructions: [
      "Check this departure in the official timetable: some routes prohibit bicycles. Selected tourist routes require a bike reservation from May to October.",
      "Have a bicycle ticket or pass and make any required reservation before departure. Load and unload the bike yourself, using the rack or trailer when provided.",
      "Space is limited; the driver decides if necessary. Wheelchairs and pushchairs have priority. Keep doors and aisles clear.",
    ] };
  if (zvvOperators[operator]) return { ...unknown, operator: zvvOperators[operator], permission: "conditional",
    ticket: "required", source: ZVV, instructions: [
      "A clean bicycle can travel if there is enough space and you have a valid bicycle ticket. Carriage is not guaranteed.",
      "Load and unload it yourself. Use the second door from the front on buses; check the official timetable for restrictions on this departure.",
    ] };
  if (["TPG", "TRANSPORTS PUBLICS GENEVOIS"].includes(operator)) return { ...unknown, operator: "tpg", permission: "conditional",
    ticket: "check-fare", source: TPG, instructions: [
      "Bicycles can travel if space allows and other passengers are not obstructed. Remain beside your bike and keep it stable.",
      "Check the bicycle fare for your route; Zone 10 normally requires a reduced-fare ticket. Tandems, recumbents, trailers and other bulky bikes are excluded.",
    ] };
  return unknown;
}

export function busCarriageLabel(rule: BusCarriage): string {
  return rule.permission === "conditional" ? "Bikes conditional · check this departure"
    : rule.permission === "not-allowed" ? "Bicycles not permitted" : "Bicycle rules unverified";
}

export function transitAllowed(leg: TransitLeg, preference: BusPreference): boolean {
  const rule = busCarriage(leg);
  if (!rule) return true; // Train/tram/other carriage remains explicitly unverified.
  return preference !== "no-buses" && rule.permission !== "not-allowed"
    && (rule.permission === "conditional" || preference === "include-unknown");
}

export function busJourneySummary(legs: TransitLeg[]): string | null {
  const rules = legs.map(busCarriage).filter((rule): rule is BusCarriage => !!rule);
  if (!rules.length) return null;
  return rules.some(rule => rule.permission === "unknown") ? "Includes a bus with unverified bicycle rules"
    : "Bus bicycle rules found · check departure, reservation and space";
}

export function busExclusions(legs: Iterable<TransitLeg>, preference: BusPreference) {
  const result = { prohibited: 0, unknown: 0, preference: 0 }, seen = new Set<string>();
  for (const leg of legs) {
    const rule = busCarriage(leg);
    if (!rule || transitAllowed(leg, preference)) continue;
    // Pass-stop exit prefixes are one departure, not several rejected buses.
    const key = JSON.stringify([leg.fromId, leg.departure, leg.operator, leg.service, leg.serviceName]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (rule.permission === "not-allowed") result.prohibited++;
    else if (preference === "no-buses") result.preference++;
    else result.unknown++;
  }
  return result;
}
