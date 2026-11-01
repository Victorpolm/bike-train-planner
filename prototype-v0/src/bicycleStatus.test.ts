import assert from "node:assert/strict";
import { it } from "node:test";
import { interpretBicycleAttributes, carriageForLeg, withTripInfoRule, bicycleJourneySummary } from "./bicycleCarriage.ts";
import { bicycleStatus } from "./bicycleStatus.ts";
import { searchBicycleAttributes } from "./searchTimetable.ts";
import { parseOjpConnections, parseOjpDetails } from "./ojp.ts";
import { addOjpConnections } from "./ojpClient.ts";
import { applyRealtimeService } from "./realtimeService.ts";
import { emptyNetwork } from "./model.ts";
import { DEFAULT_FARE_PROFILE } from "./fares.ts";
import { DEFAULT_BICYCLE } from "./travelProfile.ts";
import type { TransitLeg } from "./routing.ts";
import { readFileSync } from "node:fs";

const checked = "2026-11-01T10:00:00Z";
const attr = (code: string, text = "") => ({ code, text, scope: "service" as const });
const train = (changes: Partial<TransitLeg> = {}): TransitLeg => ({ mode: "transit", from: "Zürich HB", to: "Bern",
  fromId: "8503000", toId: "8507000", service: "IC 1", operator: "SBB", category: "IC", departure: new Date(checked),
  arrival: new Date("2026-11-01T11:00:00Z"), departurePlatform: null, arrivalPlatform: null, serviceName: null, direction: null, ...changes });
function evidenced(attributes: ReturnType<typeof attr>[], changes: Partial<TransitLeg> = {}) {
  const leg = train(changes);
  return { ...leg, bicycleEvidence: withTripInfoRule({ permission: "unknown", fromId: leg.fromId!, toId: leg.toId!,
    departure: leg.departure!.toISOString(), service: leg.service, operator: leg.operator,
    source: { title: "Dated service", url: "https://example.test", checked }, conditions: [] }, interpretBicycleAttributes(attributes), checked) };
}
it("recognises plain bicycle provision without inventing a reservation exemption or ignoring a ban", () => {
  const unknownOperator = { operator: "Unmapped" };
  const plain = evidenced([attr("A__VH")], unknownOperator);
  assert.equal(carriageForLeg(plain).permission, "confirmed");
  assert.equal(bicycleStatus(plain).title, "Bikes allowed · Reservation requirement not verified");
  assert.equal(bicycleStatus(evidenced([attr("A__VH"), attr("A__VN")])).icon, "prohibited");
  assert.equal(bicycleStatus(evidenced([attr("A__VH"), attr("A__VI")])).permission, "Bikes restricted to international travel");
  assert.equal(searchBicycleAttributes({ "1_4.3_VH": "" })[0].code, "A__VH");
});
it("uses SBB's dated calendar when the symbol is absent, and an exact bicycle R when supplied", () => {
  assert.equal(bicycleStatus(train()).title, "Bikes allowed · No reservation required");
  const friday = train({ departure: new Date("2026-10-30T10:00:00Z"), arrival: new Date("2026-10-30T11:00:00Z") });
  assert.equal(bicycleStatus(friday).icon, "reservation");
  assert.equal(bicycleStatus(evidenced([attr("A__VR")])).title, "Bikes allowed · Reservation required");
  assert.equal(bicycleStatus(evidenced([attr("A___R", "Seat reservation required")])).title, "Bikes allowed · No reservation required");
  for (const category of ["EC", "ICE", "RJX"]) assert.equal(bicycleStatus(train({ category, service: category + " 1" })).icon, "reservation");
});
it("recognises explicit complete bilingual/multilingual statements but not conditional or passenger wording", () => {
  for (const text of ["BICYCLES: No reservation required", "VÉLOS: réservation non obligatoire.", "VELOS: Keine Reservation erforderlich", "Biciclette: prenotazione non obbligatoria"])
    assert.equal(interpretBicycleAttributes([attr("I_text", text)]).bikeReservation, "not-required", text);
  for (const text of ["BICYCLES: Reservation required", "VÉLOS: réservation obligatoire.", "VELOS: Reservierung obligatorisch", "Biciclette: prenotazione obbligatoria"])
    assert.equal(interpretBicycleAttributes([attr("I_text", text)]).bikeReservation, "required", text);
  for (const text of ["Bicycles allowed", "Vélos: transport autorisé", "VELOS: Mitnahme möglich", "Biciclette: trasporto consentito"])
    assert.equal(interpretBicycleAttributes([attr("I_text", text)]).permission, "allowed", text);
  for (const text of ["Bicycles: No reservation required except on Fridays", "Vélos: réservation non obligatoire sauf le vendredi", "Seat reservation required; bicycles carried", "Biciclette: prenotazione da verificare"])
    assert.equal(interpretBicycleAttributes([attr("I_text", text)]).bikeReservation, "unknown", text);
  const conditional = evidenced([attr("I_text", "Biciclette: prenotazione da verificare")]);
  assert.equal(carriageForLeg(conditional).bikeReservation, "unknown");
});
it("distinguishes missing bike permission, profile compatibility and conflicting reservation data", () => {
  assert.equal(bicycleStatus(train({ operator: "Unmapped" })).title, "Bicycle information missing for this service");
  const profile = { ...DEFAULT_FARE_PROFILE, bicycle: { ...DEFAULT_BICYCLE, kind: "cargo" as const } };
  assert.equal(bicycleStatus(evidenced([attr("A__VH")]), profile).icon, "prohibited");
  const loading = { ...DEFAULT_FARE_PROFILE, bicycle: { ...DEFAULT_BICYCLE, selfLoading: false } };
  assert.equal(bicycleStatus(evidenced([attr("A__VH")]), loading).title, "Bicycle configuration needs checking");
  const conflict = evidenced([attr("A__VR"), attr("I_note", "Vélos: réservation non obligatoire")]);
  assert.equal(bicycleStatus(conflict).conflict, true);
  assert.match(bicycleStatus(conflict).title, /Reservation rules conflict/);
  assert.equal(carriageForLeg(conflict).bikeReservation, "unknown");
});
it("exposes the affected service for each unresolved requirement in a mixed journey", () => {
  const summary = bicycleJourneySummary([evidenced([attr("A__VR")]), train({ operator: "Unmapped", service: "Bus 99", category: "B" })])!;
  assert.match(summary, /Reservation required: IC 1/);
  assert.match(summary, /Reservation requirement not verified: Bus 99/);
  assert.doesNotMatch(summary, /No reservation required/);
});
it("preserves Text-form attributes from XML through graph conversion and exact-service refresh", () => {
  // Derived from the recorded OJP XML; the added attributes are synthetic.
  const raw = readFileSync(new URL("./fixtures/ojp-2026-09-24/rail-off.xml", import.meta.url), "utf8");
  const injected = raw.replace(/<Service>/g, '<Service><Attribute><Code>I_french</Code><Text><Text>Vélos: réservation obligatoire</Text></Text></Attribute>');
  const parsed = parseOjpConnections(injected, false);
  assert.ok(parsed.some(l => l.rule?.bikeReservation === "required"));
  const network = emptyNetwork(); addOjpConnections(network, { legs: parsed, checked, warnings: [] });
  const leg = [...network.edges.values()].find(e => e.leg.ojp)!.leg;
  assert.equal(bicycleStatus(leg).icon, "reservation");
  const xml = `<OJP><OJPResponse><ServiceDelivery><OJPTripInfoDelivery><ResponseTimestamp>${checked}</ResponseTimestamp><TripInfoResult><Service><JourneyRef>${leg.ojp!.journeyRef}</JourneyRef><OperatingDayRef>${leg.ojp!.operatingDay}</OperatingDayRef><Attribute><Code>A__VN</Code></Attribute></Service><OnwardCall><Order>1</Order><StopPointRef>${leg.ojp!.fromRef}</StopPointRef><ServiceDeparture><TimetabledTime>${leg.ojp!.departure}</TimetabledTime></ServiceDeparture></OnwardCall><OnwardCall><Order>2</Order><StopPointRef>${leg.ojp!.toRef}</StopPointRef><ServiceArrival><TimetabledTime>${leg.ojp!.arrival}</TimetabledTime></ServiceArrival></OnwardCall></TripInfoResult></OJPTripInfoDelivery></ServiceDelivery></OJPResponse></OJP>`;
  const updated = applyRealtimeService({ ...leg, bicycleEvidence: undefined }, parseOjpDetails(xml, leg.ojp!));
  assert.equal(bicycleStatus(updated).icon, "prohibited");
});
