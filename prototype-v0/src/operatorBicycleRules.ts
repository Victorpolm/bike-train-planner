import type { TransitLeg } from "./routing.ts";

export const SOB_BICYCLES = { title: "SOB bicycle carriage", url: "https://unterwegs.sob.ch/de/stories/velotransport", checked: "2026-09-24" };
export const SOB_RESERVATIONS = { title: "SOB: bicycle reservations are not available",
  url: "https://kundendienst.sob.ch/de/support/solutions/articles/205000044871-ist-eine-veloreservation-im-voralpen-express-treno-gottardo-aare-linth-alpenrhein-express-m%C3%B6glich-", checked: "2026-09-24" };

// Narrow applicability: these are SOB's named mainline services. Do not apply
// their rule to replacement buses, another operator, or an unclassified service.
// A dated prohibition always takes precedence over this published operator rule.
export function sobMainlineRule(leg: TransitLeg) {
  return leg.mode === "transit" && Number.isFinite(leg.departure?.getTime())
    && ["SOB", "SOB-SOB", "SCHWEIZERISCHE SÜDOSTBAHN", "SCHWEIZERISCHE SÜDOSTBAHN AG", "OJP:82"].includes(leg.operator?.trim().toUpperCase() ?? "")
    && ["IR", "PE"].includes(leg.category?.toUpperCase() ?? "");
}

export const SBB_IR_BICYCLES = { title: "SBB: bicycles on InterRegio services",
  url: "https://www.sbb.ch/en/travel-information/individual-needs/travelling-with-bikes/carriage-bikes-train.html", checked: "2026-09-24" };
export function sbbInterRegioRule(leg: TransitLeg) {
  // Limit this reviewed default to domestic SBB IR legs. Do not extrapolate it
  // to international trains, peak-hour S-Bahn/RE restrictions or replacements.
  return leg.mode === "transit" && Number.isFinite(leg.departure?.getTime()) && leg.category?.toUpperCase() === "IR"
    && ["SBB", "SBB CFF FFS", "CFF", "FFS", "OJP:11"].includes(leg.operator?.trim().toUpperCase() ?? "")
    && /^85\d{5}$/.test(leg.fromId ?? "") && /^85\d{5}$/.test(leg.toId ?? "");
}

export type RuleSource = { title: string; url: string; checked: string };
export type OperatorBicycleRule = {
  permission: "allowed" | "unknown";
  reservation: "required" | "not-required" | "unknown";
  ticket: "required";
  source: RuleSource;
  instructions: string[];
};
export const BLS_BICYCLES: RuleSource = { title: "BLS bicycle tickets and carriage conditions",
  url: "https://www.bls.ch/en/fahren/fahrgastinformation/velofahrende/velomitnahme", checked: "2026-09-25" };
export const RHB_BICYCLES: RuleSource = { title: "RhB Rail & Bike",
  url: "https://www.rhb.ch/en/transport/rail-bike/", checked: "2026-09-25" };
const norm = (s?: string | null) => s?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
export function isSbb(leg: TransitLeg) {
  return ["SBB", "SBB CFF FFS", "CFF", "FFS", "OJP:11"].includes(norm(leg.operator));
}
export function domesticSwissLeg(leg: TransitLeg) {
  return /^85\d{5}$/.test(leg.fromId ?? "") && /^85\d{5}$/.test(leg.toId ?? "");
}
const ruleDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function localDate(date: Date) {
  const parts = ruleDateFormat.formatToParts(date);
  const get = (name: string) => Number(parts.find(p => p.type === name)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"),
    weekday: new Date(Date.UTC(get("year"), get("month") - 1, get("day"))).getUTCDay() };
}
function overlapsRegionalPeak(leg: TransitLeg) {
  const start = leg.departure!.getTime(), end = leg.arrival?.getTime() ?? start;
  // Check every local hour touched, including a restriction entirely between
  // departure and arrival. Use real instants so midnight and DST remain sound.
  for (let time = start; time <= Math.max(start, end); time = Math.min(time + 60 * 60_000, end)) {
    const d = localDate(new Date(time));
    if (d.weekday >= 1 && d.weekday <= 5 && (d.hour >= 6 && d.hour < 9 || d.hour >= 16 && d.hour < 19)) return true;
    if (time >= end) break;
  }
  return false;
}
// Gregorian Easter, used solely for the published IC reservation calendar.
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31);
  return Date.UTC(year, month - 1, (h + l - 7 * m + 114) % 31 + 1);
}
export function sbbIcReservation(leg: TransitLeg): "required" | "not-required" | "unknown" {
  if (!leg.departure) return "unknown";
  const category = norm(leg.category), line = norm(leg.service).replace(/\s/g, "");
  if (["EC", "ICE", "RJX"].includes(category)) return "required";
  if (category !== "IC") return "not-required";
  // IC without a Swiss line identifier could be the year-round international IC.
  // Never infer an exemption merely because both boarded stops are in Switzerland.
  if (!/^IC(?:1|2|3|5|6|8|21|51|61|81)$/.test(line)) return "unknown";
  const date = localDate(leg.departure), md = date.month * 100 + date.day;
  if (md < 321 || md > 1031) return "not-required";
  if (["IC2", "IC21", "IC5", "IC51"].includes(line)) return "required";
  const day = Date.UTC(date.year, date.month - 1, date.day);
  const holiday = [-3, 1, 38, 39, 50].some(offset => day === easter(date.year) + offset * 86400000) || md === 801;
  return date.weekday === 0 || date.weekday >= 5 || holiday ? "required" : "not-required";
}

// Published rules apply to one adult travelling with a standard unfolded bike.
// Exact dated restrictions are resolved separately and always take precedence.
export function operatorBicycleRule(leg: TransitLeg): OperatorBicycleRule | null {
  if (leg.mode !== "transit" || !leg.departure || !Number.isFinite(leg.departure.getTime())) return null;
  const category = norm(leg.category), operator = norm(leg.operator);
  if (["EV", "SEV"].includes(category) || /replacement|ersatz|remplacement/i.test(`${leg.service} ${leg.serviceName ?? ""}`)) return null;
  if (sobMainlineRule(leg)) return { permission: "allowed", reservation: "not-required", ticket: "required", source: SOB_BICYCLES,
    instructions: ["Use a bicycle ticket or pass and the designated bicycle compartment. Load and unload the bicycle yourself.",
      "Bicycle spaces on these SOB services cannot be reserved. Carriage depends on space."] };
  if (["BLS", "BLS-BLS", "BLS AG", "OJP:33"].includes(operator) && ["S", "R", "RE", "IR", "B", "BUS", "BAT", "SHIP", "BOAT"].includes(category)) {
    return { permission: "allowed", reservation: "not-required", ticket: "required", source: BLS_BICYCLES,
      instructions: ["A bicycle ticket or pass is required. BLS carries bicycles without reservation, when space permits.",
        "Load your bicycle yourself; use its designated area and give priority to wheelchairs and pushchairs."] };
  }
  if (["RHB", "RHB-RHB", "RHÄTISCHE BAHN", "RHÄTISCHE BAHN AG", "OJP:72"].includes(operator)
    && ["S", "R", "RE", "IR"].includes(category) && domesticSwissLeg(leg)) {
    return { permission: "allowed", reservation: "unknown", ticket: "required", source: RHB_BICYCLES,
      instructions: ["Carry your passenger ticket and a bicycle ticket or pass. Load and unload the bicycle yourself in the marked compartment or luggage car.",
        "Be at the loading area in good time. Dated exclusions override this ordinary-service rule; space is limited.",
        "The general RhB page does not establish the reservation condition for every departure. Check this train's timetable notes."] };
  }
  if (!isSbb(leg) || !domesticSwissLeg(leg) || !["IC", "IR", "RE", "S", "R", "EC", "ICE", "RJX"].includes(category)) return null;
  // During regional rush-hour windows the timetable must establish carriage.
  // Missing regional geography must not create an overbroad permission default.
  const possiblePeakRestriction = ["S", "RE"].includes(category) && overlapsRegionalPeak(leg);
  return { permission: possiblePeakRestriction ? "unknown" : "allowed", ticket: "required",
    reservation: sbbIcReservation(leg), source: { ...SBB_IR_BICYCLES, title: "SBB bicycle carriage and reservation calendar", checked: "2026-09-25" },
    instructions: ["Carry a bicycle ticket or pass as well as your passenger ticket or travelcard. Your adult GA does not include bicycle carriage.",
      "Load and unload the bicycle yourself. Use the marked bicycle area, remove bulky luggage and keep doors clear.",
      ...(possiblePeakRestriction ? ["Regional peak-hour restrictions may apply. Check the bicycle symbol for this dated departure."] : []),
      ...(sbbIcReservation(leg) === "required" ? ["Reserve the bicycle place before departure in SBB Mobile or on SBB.ch. Follow the coach number on the reservation."] : [])] };
}
