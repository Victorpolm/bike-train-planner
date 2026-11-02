import { interpretBicycleHandling, mergeBicycleHandling, type BicycleHandling } from "./bicycleHandling.ts";
import { childBikeFree, validPassOn } from "./travelProfile.ts";
import { tariffSource } from "./tariffSources.ts";
import { swissDateTimeInput } from "./departure.ts";
import { operatorCode, normalizeCode } from "./normalization.ts";
import { domesticSwissLeg } from "./operatorBicycleRules.ts";
import { profileBikeRule } from "./bikeEligibility.ts";
import { travelProfileKey, type TravelProfile } from "./travelProfile.ts";
import { normalizeName as normalized } from "./normalization.ts";
import { applicableBicycleEvidence, bicyclePermission, permissionInputs, type BicycleEvidence } from "./bicyclePermission.ts";
import { busCarriage } from "./busCarriage.ts";
import { localChildBikeConcession } from "./localTransport.ts";
import { nationalBicycleReservation } from "./nationalBicycleRules.ts";
import type { TransitLeg } from "./routing.ts";
import { sobMainlineRule, sbbInterRegioRule, SOB_BICYCLES, SOB_RESERVATIONS, SBB_IR_BICYCLES, operatorBicycleRule, isSbb } from "./operatorBicycleRules.ts";

export type BicycleAttribute = { code: string; text: string; scope: "service" | "segment" | "stop" };
export type CarriageRule = {
  permission: "allowed" | "unknown" | "prohibited";
  handling?: BicycleHandling;
  basis: "ojp-filter" | "service-rule" | "unassessed";
  bikeReservation: "required" | "not-required" | "unknown";
  reservationUnspecified?: boolean;
  notes: string[];
  attributes: BicycleAttribute[];
};
const SBB_BICYCLES = {
  title: "SBB bicycle tickets and reservations",
  url: "https://www.sbb.ch/en/travel-information/individual-needs/travelling-with-bikes/carriage-bikes-train.html",
  checked: "2026-09-24",
};

// Exact service codes and complete explicit sentences only. A generic R is a
// passenger reservation; missing symbols and conditional prose are not exemptions.
export const isBicycleAttribute = (a: BicycleAttribute) => /^A__V[A-Z]$/.test(a.code) || /velo|bicycl|bike|fahrr|faltr|falträ|faltvel|klappvel|klappr|vélo|biciclett/i.test(a.text);
const wording = (s: string) => normalized(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.!]$/, "");
const noReservationText = /^(?:bicycles?: (?:no reservation required|carriage (?:possible |permitted )?without reservation)|velos?: (?:reservation non obligatoire|sans reservation)|velos?: (?:keine reservation erforderlich|mitnahme ohne reservation moglich)|biciclette: (?:prenotazione non obbligatoria|trasporto senza prenotazione))$/;
const requiredText = /^(?:bicycles?: reservation (?:required|compulsory|mandatory)|velos?: reservation obligatoire|velos?: reservierung obligatorisch|biciclette: prenotazione obbligatoria)$/;
const allowedText = /^(?:bicycles?: carriage (?:permitted|possible)|bicycles? (?:allowed|permitted)|velos?: transport (?:autorise|possible)|velos?: mitnahme moglich|biciclette: trasporto (?:consentito|possibile))$/;
const observedNoReservation = new Set([
  "die mitnahme von velos ist ohne reservation moglich, sofern genugend mitnahmeplatze vorhanden sind",
  "die mitnahme von velos ist ohne reservation moglich, sofern genugend mitnahmeplatze in den eingesetzten fahrzeugen zur verfugung stehen. eine mitnahmegarantie besteht nicht",
]);
export function interpretBicycleAttributes(attributes: BicycleAttribute[], filtered = false): CarriageRule {
  const relevant = attributes.filter(isBicycleAttribute);
  const handling = interpretBicycleHandling(relevant);
  const prohibited = relevant.some(a => a.code === "A__VN" || /^(velos?: keine beförderung möglich|bicycles?: carriage (?:prohibited|not possible)|v[ée]los?: transport (?:impossible|interdit)|biciclette: trasporto (?:non possibile|vietato))\.?$/i.test(a.text.trim()));
  const reservation = relevant.some(a => a.code === "A__VR" || requiredText.test(wording(a.text)));
  const noReservation = relevant.some(a => noReservationText.test(wording(a.text)) || observedNoReservation.has(wording(a.text)));
  const bicycleSpace = relevant.some(a => a.code === "A__VH" || allowedText.test(wording(a.text)));
  const limited = relevant.some(a => a.code === "A__VB");
  const staffLoading = relevant.some(a => a.code === "A__VC");
  const internationalOnly = relevant.some(a => a.code === "A__VI");
  const explicit = prohibited || reservation || noReservation || limited || staffLoading || bicycleSpace || !!handling?.foldingOnly || !!handling?.bagRequired;
  const notes: string[] = [];
  if (handling?.foldingOnly) notes.push("Only folding bicycles are accepted. Re.route currently plans for ordinary bicycles, so this service is not allowed.", ...handling.instructions);
  if (handling?.bagRequired && !handling.foldingOnly) notes.push("Bag required before boarding. Follow the provider’s packing, dismantling and size restrictions.", ...handling.instructions);
  if (handling?.unresolved) notes.push("The provider’s packing or folding conditions are unresolved or conflicting; ordinary-bicycle acceptance needs checking.");
  if (prohibited) notes.push("Bicycles cannot be carried on this service.");
  if (reservation) notes.push("Reserve a bicycle space before boarding. The reservation is separate from the bike ticket.");
  if (noReservation) notes.push("No bicycle reservation is required. Carriage is conditional on sufficient space.");
  if (staffLoading) notes.push("Bicycle loading is handled by staff. Be at the loading area before departure.");
  if (internationalOnly) notes.push("Bicycle carriage is restricted to international travel; eligibility must be checked for your boarded segment.");
  if (relevant.some(a => a.code === "A__VK")) notes.push("Buy the bicycle ticket from the local transport operator.");
  if (relevant.some(a => a.code === "A__VT")) notes.push("Packaged bicycles are not accepted on this service.");
  if (limited) notes.push("Bicycle carriage is subject to limited space.");
  if (bicycleSpace) notes.push("The service indicates bicycle carriage. Bicycle-type restrictions and available space still apply.");
  if (reservation && noReservation) notes.push("The provider gives conflicting reservation conditions. Confirm with the operator before boarding.");
  return {
    permission: prohibited || handling?.foldingOnly ? "prohibited" : !internationalOnly && !handling?.unresolved && (explicit || filtered) ? "allowed" : "unknown",
    handling,
    basis: explicit ? "service-rule" : filtered ? "ojp-filter" : "unassessed",
    // Contradictory reservation notes require confirmation; do not silently
    // select the less restrictive reading.
    bikeReservation: reservation && noReservation ? "unknown" : reservation ? "required" : noReservation ? "not-required" : "unknown",
    reservationUnspecified: !relevant.some(a => /reserv|prenotaz|book|anmeld/i.test(wording(a.text)) || a.code === "A__VR"
      || !/^A__V[HNRBICKT]$/.test(a.code) && !allowedText.test(wording(a.text))),
    notes: [...new Set(notes)], attributes: relevant,
  };
}

export function evaluateCarriageForLeg(leg: TransitLeg, profile?: TravelProfile) {
  const specific = profileBikeRule(leg, profile, applicableBicycleEvidence(leg));
  const evidence = applicableBicycleEvidence(leg), policy = busCarriage(leg);
  const requirements = evidence?.prerequisites, operatorRule = operatorBicycleRule(leg);
  const permission = bicyclePermission(leg, profile);
  // A more specific operator rule (including unresolved rail/calendar scope)
  // remains authoritative. The shared fallback cannot erase it.
  const national = !operatorRule && !specific.handLuggage ? nationalBicycleReservation(leg, evidence, permission) : null;
  const sob = sobMainlineRule(leg);
  const sbbIR = sbbInterRegioRule(leg);
  const operatorPermissionSource = operatorRule && operatorRule.permission !== "unknown" ? operatorRule.source : sob ? SOB_BICYCLES : sbbIR ? SBB_IR_BICYCLES : policy?.verifiesPermission ? policy.source : undefined;
  // An explicitly unresolved dated requirement cannot become a generic "not required".
  const reservationFallback = (requirements?.bikeReservation === undefined || requirements.reservationUnspecified === true)
    && !evidence?.conditions.some(note => /conflicting reservation/i.test(note)) && !!operatorRule;
  const sbb = isSbb(leg);
  const bikeTicket = requirements?.bikeTicket !== undefined && requirements.bikeTicket !== "unknown"
    ? requirements.bikeTicket : sbb || sob || operatorRule?.ticket === "required" || policy?.ticket === "required" || national ? "required" : "unknown";
  const date=leg.departure?swissDateTimeInput(leg.departure).slice(0,10):"";
  const childFree=!!profile && childBikeFree(profile) && validPassOn(profile,date) && domesticSwissLeg(leg) && date>=tariffSource("t600").validFrom && date<=tariffSource("t600").validThrough &&
    (["SBB","BLS","RHB","SOB"].includes(operatorCode(leg.operator))&&["IC","IR","RE","S","R","EC","ICE","RJX","PE"].includes(normalizeCode(leg.category)) || ["VBZ","VBG","VZO","STBW","PAG"].includes(operatorCode(leg.operator)) || localChildBikeConcession(leg));
  const childGuidance=childFree?["An eligible child bicycle travels free under the saved accompaniment/travelcard conditions. Children aged 6–15 still need a bicycle reservation where compulsory."]:[];
  const ticketSource = requirements?.ticketSource ?? (operatorRule?.source ?? (sbb ? SBB_BICYCLES : policy?.source ?? national?.membershipSource));
  return {
    permission, evidence, nationalRule: national,
    profileRule: specific,
    bikeTicket: specific.reservationExempt || childFree ? "not-required" : bikeTicket,
    bikeReservation: specific.reservationExempt || childFree && profile!.age! < 6 ? "not-required" : requirements?.bikeReservation && requirements.bikeReservation !== "unknown" ? requirements.bikeReservation : reservationFallback ? operatorRule!.reservation : national?.reservation ?? "unknown",
    reservationSource: reservationFallback && (!requirements || requirements.bikeReservation === "unknown") ? sob ? SOB_RESERVATIONS : operatorRule?.source : national?.source,
    permissionSource: operatorRule?.permission === "prohibited" || !evidence || evidence.permission === "unknown" ? operatorPermissionSource : undefined,
    ticketSource,
    bookingUrl: requirements?.bookingUrl ?? ticketSource?.url,
    guidance: national ? [...specific.guidance, ...childGuidance, national.explanation, ...(policy?.permission !== "unknown" ? policy?.instructions ?? [] : [])] : specific.guidance.length || childGuidance.length ? [...new Set([...specific.guidance,...childGuidance,...(operatorRule?.instructions??policy?.instructions??[])])] : operatorRule ? operatorRule.instructions : sob ? ["Take a bicycle ticket or pass. Load and unload the bicycle yourself and use the designated bicycle area.",
      "Bicycle spaces on these SOB trains cannot be reserved. Carriage depends on space; follow the crew’s instructions."] : sbbIR ? [
      "For a standard bicycle up to two metres long: load and unload it yourself and use the designated bicycle area.",
      "Take a bicycle ticket or pass. Carriage depends on space; keep doors and aisles clear and follow staff instructions.",
      "The normal domestic InterRegio rule does not require a bicycle reservation. Any dated service restriction shown above takes precedence.",
    ] : policy?.instructions ?? [],
    policySource: operatorPermissionSource ?? policy?.source ?? national?.membershipSource,
  };
}

const carriageCache = new WeakMap<TransitLeg, { inputs: unknown[]; value: ReturnType<typeof evaluateCarriageForLeg> }>();
export function carriageForLeg(leg: TransitLeg, profile?: TravelProfile) {
  const evidence = leg.bicycleEvidence, requirements = evidence?.prerequisites;
  const source = requirements?.ticketSource;
  // Permission inputs cover operator/date/segment/condition mutations. Retain
  // source values too: bookingUrl may have been derived from a mutable URL.
  const inputs = [travelProfileKey(profile), ...permissionInputs(leg), evidence, requirements?.bikeTicket, requirements?.bikeReservation, requirements?.reservationUnspecified, requirements?.conditionsChecked,
    source, source?.title, source?.url, source?.checked, requirements?.bookingUrl];
  const cached = carriageCache.get(leg);
  if (cached && cached.inputs.length === inputs.length && inputs.every((value, i) => Object.is(value, cached.inputs[i]))) return cached.value;
  const value = evaluateCarriageForLeg(leg, profile);
  carriageCache.set(leg, { inputs, value });
  return value;
}

export function bicycleJourneySummary(legs: TransitLeg[], profile?: TravelProfile) {
  const services = legs.filter(l => l.mode === "transit");
  const rules = services.map(leg => carriageForLeg(leg, profile));
  if (!rules.length) return null;
  if (rules.some(r => r.permission === "prohibited")) return "Includes a service that prohibits bicycles · comparison only";
  const unknown = services.filter((_, i) => rules[i].permission === "uncertain");
  const names = [...new Set(unknown.map(leg => leg.service))].join(", ");
  const packing = services.filter((_, i) => rules[i].evidence?.handling?.bagRequired && !rules[i].evidence?.handling?.foldingOnly).map(l => l.service);
  const status = unknown.length === 0 ? "Bikes allowed on every transit leg"
    : `${rules.length - unknown.length} of ${rules.length} services verified · bicycle information incomplete on ${names}`;
  const required = services.filter((_, i) => rules[i].bikeReservation === "required").map(l => l.service);
  const unresolved = services.filter((_, i) => rules[i].bikeReservation === "unknown").map(l => l.service);
  return status + (packing.length ? ` · Bag required: ${[...new Set(packing)].join(", ")}` : "") + (required.length ? ` · Reservation required: ${[...new Set(required)].join(", ")}` : "")
    + (unresolved.length ? ` · Reservation requirement not verified: ${[...new Set(unresolved)].join(", ")}`
      : !required.length ? " · No reservation required" : "")
    + (rules.some(r => r.bikeTicket === "unknown") ? " · Bicycle ticket requirement not verified" : "");
}

export function withTripInfoRule(evidence: BicycleEvidence, rule: CarriageRule, checked: string): BicycleEvidence {
  // Unrelated notes cannot erase a known reservation requirement. Conflicting
  // dated requirements remain unresolved, including across detail responses.
  const previousReservation = evidence.prerequisites?.bikeReservation ?? "unknown";
  const conflict = [...evidence.conditions, ...rule.notes].some(note => /conflicting reservation/i.test(note))
    || previousReservation !== "unknown" && rule.bikeReservation !== "unknown" && previousReservation !== rule.bikeReservation;
  const conditions = [...new Set([...evidence.conditions, ...rule.notes])];
  if (conflict && !conditions.some(note => /conflicting reservation/i.test(note)))
    conditions.push("The provider gives conflicting reservation conditions. Confirm with the operator before boarding.");
  const permission = evidence.permission === "prohibited" || rule.permission === "prohibited" ? "prohibited"
    : rule.permission === "allowed" ? "allowed" : evidence.permission;
  return { ...evidence, permission, handling: mergeBicycleHandling(evidence.handling, rule.handling),
    basis: rule.basis === "unassessed" ? evidence.basis : rule.basis,
    conditions,
    source: { title: "OJP service and stop conditions", url: "https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptripinforequest-2-0/", checked },
    prerequisites: { bikeTicket: evidence.prerequisites?.bikeTicket ?? "unknown", ...evidence.prerequisites, conditionsChecked: true,
      reservationUnspecified: !conflict && rule.reservationUnspecified === true && (evidence.prerequisites === undefined || evidence.prerequisites.reservationUnspecified === true),
      bikeReservation: conflict ? "unknown" : rule.bikeReservation === "unknown" ? previousReservation : rule.bikeReservation },
  };
}
