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
