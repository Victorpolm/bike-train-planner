import { applicableBicycleEvidence, bicyclePermission, type BicycleEvidence } from "./bicyclePermission.ts";
import { busCarriage } from "./busCarriage.ts";
import type { TransitLeg } from "./routing.ts";

export type BicycleAttribute = { code: string; text: string; scope: "service" | "segment" | "stop" };
export type CarriageRule = {
  permission: "allowed" | "unknown" | "prohibited";
  basis: "ojp-filter" | "service-rule" | "unassessed";
  bikeReservation: "required" | "not-required" | "unknown";
  notes: string[];
  attributes: BicycleAttribute[];
};
export const SBB_BICYCLES = {
  title: "SBB bicycle tickets and reservations",
  url: "https://www.sbb.ch/en/travel-information/individual-needs/travelling-with-bikes/carriage-bikes-train.html",
  checked: "2026-09-24",
};
const normalized = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

// Only these reviewed service codes and the observed, explicit no-reservation
// sentence establish a rule. Dynamic I_* codes alone never establish permission.
export function interpretBicycleAttributes(attributes: BicycleAttribute[], filtered = false): CarriageRule {
  const relevant = attributes.filter(a => /^A__V[NRB]$/.test(a.code) || /velo|bicycl|fahrr|vélo|biciclett/i.test(a.text));
  const prohibited = relevant.some(a => a.code === "A__VN" || /^(velos?: keine beförderung möglich|bicycles?: carriage prohibited)\.?$/i.test(a.text.trim()));
  const reservation = relevant.some(a => a.code === "A__VR");
  const noReservation = relevant.some(a => normalized(a.text).startsWith("die mitnahme von velos ist ohne reservation möglich, sofern genügend mitnahmeplätze"));
  const limited = relevant.some(a => a.code === "A__VB");
  const explicit = prohibited || reservation || noReservation || limited;
  const notes: string[] = [];
  if (prohibited) notes.push("Bicycles cannot be carried on this service.");
  if (reservation) notes.push("Reserve a bicycle space before boarding. The reservation is separate from the bike ticket.");
  if (noReservation) notes.push("No bicycle reservation is required. Carriage is conditional on sufficient space.");
  if (limited) notes.push("Bicycle carriage is subject to limited space.");
  if (reservation && noReservation) notes.push("The provider gives conflicting reservation conditions. Confirm with the operator before boarding.");
  return {
    permission: prohibited ? "prohibited" : explicit || filtered ? "allowed" : "unknown",
    basis: explicit ? "service-rule" : filtered ? "ojp-filter" : "unassessed",
    // Contradictory reservation notes require confirmation; do not silently
    // select the less restrictive reading.
    bikeReservation: reservation && noReservation ? "unknown" : reservation ? "required" : noReservation ? "not-required" : "unknown",
    notes: [...new Set(notes)], attributes: relevant,
  };
}

export function carriageForLeg(leg: TransitLeg) {
  const evidence = applicableBicycleEvidence(leg), policy = busCarriage(leg);
  const requirements = evidence?.prerequisites;
  const sbb = ["SBB", "SBB CFF FFS", "CFF", "FFS", "ojp:11"].includes(leg.operator ?? "");
  const bikeTicket = requirements?.bikeTicket !== undefined && requirements.bikeTicket !== "unknown"
    ? requirements.bikeTicket : sbb || policy?.ticket === "required" ? "required" : "unknown";
  const ticketSource = requirements?.ticketSource ?? (sbb ? SBB_BICYCLES : policy?.source);
  return {
    permission: bicyclePermission(leg), evidence,
    bikeTicket,
    bikeReservation: requirements?.bikeReservation ?? "unknown",
    ticketSource,
    bookingUrl: requirements?.bookingUrl ?? (sbb || ["PAG", "POSTAUTO", "PostBus", "ojp:801"].includes(leg.operator ?? "") ? "https://www.sbb.ch/en" : undefined),
    guidance: policy?.instructions ?? [],
    policySource: policy?.source,
  };
}

export function bicycleJourneySummary(legs: TransitLeg[]) {
  const rules = legs.filter(l => l.mode === "transit").map(carriageForLeg);
  if (!rules.length) return null;
  if (rules.some(r => r.permission === "prohibited")) return "Includes a service that prohibits bicycles · comparison only";
  const status = rules.every(r => r.permission === "confirmed") ? "Bikes allowed on every transit leg" : "Bicycle permission partly or fully unknown";
  return status + (rules.some(r => r.bikeReservation === "required") ? " · bike reservation required" : "");
}

export function withTripInfoRule(evidence: BicycleEvidence, rule: CarriageRule, checked: string): BicycleEvidence {
  // A detail response without a bike note does not erase existing dated evidence.
  const permission = evidence.permission === "prohibited" || rule.permission === "prohibited" ? "prohibited"
    : rule.permission === "allowed" ? "allowed" : evidence.permission;
  return { ...evidence, permission,
    basis: rule.basis === "unassessed" ? evidence.basis : rule.basis,
    conditions: [...new Set([...evidence.conditions, ...rule.notes])],
    source: { title: "OJP service and stop conditions", url: "https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptripinforequest-2-0/", checked },
    prerequisites: { bikeTicket: evidence.prerequisites?.bikeTicket ?? "unknown", ...evidence.prerequisites,
      bikeReservation: rule.bikeReservation === "unknown" && !rule.notes.length ? evidence.prerequisites?.bikeReservation ?? "unknown" : rule.bikeReservation },
  };
}
