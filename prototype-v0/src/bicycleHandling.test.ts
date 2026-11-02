import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { bicycleJourneySummary, carriageForLeg, interpretBicycleAttributes, withTripInfoRule } from "./bicycleCarriage.ts";
import { bicycleLegAllowed, bicyclePermission } from "./bicyclePermission.ts";
import { bicycleStatus } from "./bicycleStatus.ts";
import { DEFAULT_BICYCLE, readBicycle } from "./travelProfile.ts";
import { DEFAULT_FARE_PROFILE, fareSummary } from "./fares.ts";
import { transitLegsFromSections } from "./itinerary.ts";
import { addOjpConnections } from "./ojpClient.ts";
import { parseOjpConnections } from "./ojp.ts";
import { emptyNetwork } from "./model.ts";
import { StationTransferClient } from "./stationTransferClient.ts";
import { handleStationTransfers } from "../server/stationTransferHandler.ts";
import type { TransitLeg } from "./routing.ts";
const checked = "2026-11-02T10:00:00Z";
const attr = (text: string, code = "I_note") => ({ code, text, scope: "service" as const });
const profile = { ...DEFAULT_FARE_PROFILE, bicycle: { ...DEFAULT_BICYCLE, lengthCm: 180 } };
const packed = { ...profile, bicycle: { ...profile.bicycle, carriage: "bagged" as const } };
function train(attributes: ReturnType<typeof attr>[], patch: Partial<TransitLeg> = {}): TransitLeg {
  const leg: TransitLeg = { mode: "transit", from: "Zürich HB", to: "Baden", fromId: "8503000", toId: "8503504",
    departure: new Date("2026-11-03T10:00:00Z"), arrival: new Date("2026-11-03T10:30:00Z"), operator: "SBB", category: "IR", service: "IR35",
    serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null, ...patch };
  leg.bicycleEvidence = withTripInfoRule({ permission: "unknown", fromId: leg.fromId!, toId: leg.toId!, departure: leg.departure!.toISOString(),
    service: leg.service, operator: leg.operator!, source: { title: "Synthetic dated provider conditions", url: "https://example.test", checked }, conditions: [] }, interpretBicycleAttributes(attributes, true), checked);
  return leg;
}
const api: typeof fetch = (input, init) => handleStationTransfers(new Request(new URL(String(input), "https://app.test"), init));

it("excludes folding-only services for ordinary, packed and legacy folding profiles", () => {
  for (const text of ["Only folding bicycles are allowed.", "Bicycles: folding bikes only", "Only folded and bagged bikes are permitted.",
    "Seuls les vélos pliants sont autorisés.", "Nur Falträder sind erlaubt.", "Solo biciclette pieghevoli ammesse."]) {
    const leg = train([attr(text), attr("", "A__VH")]);
    for (const p of [profile, packed, { ...profile, bicycle: { ...profile.bicycle, kind: "folding" as const, carriage: "folded" as const } }]) {
      assert.equal(bicyclePermission(leg, p), "prohibited", text);
      assert.equal(bicycleLegAllowed(leg, "include-unknown", "confirmed", p), false);
      assert.equal(bicycleLegAllowed(leg, "include-unknown", "allow-uncertain", p), false);
      assert.equal(bicycleLegAllowed(leg, "include-unknown", "all-transit", p), true);
    }
    assert.match(bicycleStatus(leg).title, /Bikes not allowed.*Folding bikes only/);
    leg.bicycleEvidence = withTripInfoRule(leg.bicycleEvidence!, interpretBicycleAttributes([attr("", "A__VH")]), checked);
    leg.bicycleEvidence.formation = { status: "matched", message: "Bicycle coach", checked: new Date().toISOString(), source: "https://example.test", coaches: ["2"], rule: interpretBicycleAttributes([attr("", "A__VH")]) };
    assert.equal(bicyclePermission(leg, packed), "prohibited", "Refresh/formation cannot erase a folding-only condition");
  }
});
it("shows allowed with the exact bag condition without granting a fare or reservation exemption", () => {
  for (const text of ["Bicycles: bag required. Remove the front wheel; maximum packed size 120 × 90 cm.",
    "Bicycles can only be carried in a transport bag.", "Vélos: housse obligatoire.", "Fahrräder nur in einer Transporttasche erlaubt.", "Biciclette: sacca di trasporto obbligatoria."]) {
    const leg = train([attr(text)], { operator: "Unmapped" });
    const result = carriageForLeg(leg, profile);
    assert.equal(result.permission, "confirmed", text);
    assert.equal(result.bikeTicket, "unknown"); assert.equal(result.bikeReservation, "unknown");
    assert.match(bicycleStatus(leg, profile).title, /Bikes allowed · Bag required/);
    assert.ok(bicycleStatus(leg, profile).explanation.includes(text));
    assert.match(bicycleJourneySummary([leg], profile)!, /Bag required: IR35/);
    assert.equal(fareSummary([leg], profile).totalChf, null);
    leg.bicycleEvidence = withTripInfoRule(leg.bicycleEvidence!, interpretBicycleAttributes([attr("Bicycles: Reservation required")]), checked);
    assert.equal(carriageForLeg(leg, profile).bikeReservation, "required");
    assert.match(bicycleStatus(leg, profile).title, /Bag required.*Reservation required/);
  }
});
it("does not generalize optional luggage exceptions, unfamiliar restrictions or contradictory bans", () => {
  for (const text of ["Folding bicycles travel free in a bag", "Bicycles may be packed in a bag", "Bicycles: bag restrictions apply",
    "Bicycles are only allowed in a bag unless the operator refuses them"]) {
    const leg = train([attr(text)]);
    assert.equal(bicyclePermission(leg), "uncertain", text);
    assert.equal(bicycleStatus(leg).reason, "packing-unverified");
  }
  const contradiction = train([attr("Bicycles: bag required"), attr("", "A__VT")]);
  assert.equal(bicyclePermission(contradiction, profile), "uncertain");
  assert.equal(bicyclePermission(contradiction, packed), "prohibited");
  const banned = train([attr("Bicycles: bag required"), attr("", "A__VN")]);
  assert.equal(bicyclePermission(banned, profile), "prohibited");
  assert.notEqual(bicyclePermission(banned, packed), "confirmed");
  assert.equal(interpretBicycleAttributes([attr("", "A__VS")]).permission, "unknown");
});
it("retains handling through both timetable adapters, graph updates and cache invalidation", () => {
  const leg = transitLegsFromSections([{ journey: { category: "IR", number: "35", operator: "SBB",
    bicycleData: { attributes: [attr("Bicycles: bag required")], source: { title: "Fixture", url: "https://example.test", checked } } },
    departure: { station: { id: "8503000", name: "Zürich HB" }, departure: "2026-11-03T10:00:00Z" },
    arrival: { station: { id: "8503504", name: "Baden" }, arrival: "2026-11-03T10:30:00Z" } }])[0];
  assert.match(bicycleStatus(leg).title, /Bag required/);
  const raw = parseOjpConnections(readFileSync(new URL("./fixtures/ojp-live-2026-10-11/trip.xml", import.meta.url), "utf8"), false).find(l => l.reference)!;
  raw.rule = interpretBicycleAttributes([attr("Only folding bikes are allowed")]);
  const n = emptyNetwork(); addOjpConnections(n, { legs: [raw], checked, warnings: [] });
  const key = [...n.edges.keys()][0];
  assert.equal(bicyclePermission(n.edges.get(key)!.leg), "prohibited");
  raw.rule = interpretBicycleAttributes([attr("", "A__VH")]);
  addOjpConnections(n, { legs: [raw], checked, warnings: [] });
  assert.equal(bicyclePermission(n.edges.get(key)!.leg), "prohibited");
  const cached = train([attr("Bicycles: bag required")]);
  assert.equal(bicyclePermission(cached), "confirmed");
  cached.bicycleEvidence!.handling!.foldingOnly = true;
  assert.equal(bicyclePermission(cached), "prohibited");
  cached.bicycleEvidence!.departure = "2026-11-04T10:00:00Z";
  assert.equal(bicyclePermission(cached), "confirmed", "Mismatched dated conditions cannot apply to a different departure");
});
it("migrates legacy folding selections to ordinary rules and keeps correctly packed ordinary bikes supported", () => {
  for (const carriage of ["unfolded", "folded", "bagged"] as const) {
    const bicycle = { ...DEFAULT_BICYCLE, kind: "folding" as const, carriage };
    assert.equal(readBicycle(bicycle).kind, "ordinary");
    assert.equal(readBicycle(bicycle).carriage, carriage === "bagged" ? "bagged" : "unfolded");
    const leg = train([], { operator: "BLS" });
    assert.equal(bicyclePermission(leg, { ...profile, bicycle }), "confirmed");
    assert.equal(carriageForLeg(leg, { ...profile, bicycle }).profileRule.reservationExempt, carriage === "bagged");
  }
});
it("resolves all seven audit fixture rail legs through official identities despite changed stop labels", async () => {
  const legs = parseOjpConnections(readFileSync(new URL("./fixtures/ojp-live-2026-10-11/trip.xml", import.meta.url), "utf8"), false);
  for (const leg of legs) { leg.from.name = "Changed departure label"; leg.to.name = "Changed arrival label"; }
  const n = emptyNetwork(); addOjpConnections(n, { legs, checked, warnings: [] });
  await new StationTransferClient(api).hydrate(n, new AbortController().signal);
  const transit = [...n.edges.values()].filter(e => e.leg.mode === "transit");
  assert.equal(transit.length, 7);
  for (const { leg } of transit) {
    assert.equal(carriageForLeg(leg, profile).permission, "confirmed", leg.service);
    assert.equal(carriageForLeg(leg, profile).bikeReservation, "required", leg.service);
  }
});
it("uses official resolved SLOIDs for the year-round Zurich–Schaffhausen IC corridor", async () => {
  const leg = train([], { fromId: "ch:1:sloid:3000", toId: "ch:1:sloid:3400", to: "Schaffhausen", category: "IC", service: "IC4" });
  leg.bicycleEvidence = undefined;
  assert.equal(carriageForLeg(leg).bikeReservation, "unknown");
  const n = emptyNetwork(); n.edges.set("corridor", { id: "corridor", from: leg.fromId!, to: leg.toId!, departure: leg.departure!, arrival: leg.arrival!, leg });
  await new StationTransferClient(api).hydrate(n, new AbortController().signal);
  assert.equal(carriageForLeg(n.edges.get("corridor")!.leg).bikeReservation, "required");
});
it("explains stale ZVV rules instead of allowing its undated fallback to apply indefinitely", () => {
  for (const date of ["2026-09-23", "2026-12-13", "2030-01-01"]) {
    const leg = train([], { operator: "VBZ", category: "B", service: "31", departure: new Date(date + "T10:00:00Z"), arrival: new Date(date + "T10:10:00Z") });
    leg.bicycleEvidence = undefined;
    assert.equal(bicyclePermission(leg), "uncertain");
    assert.equal(bicycleStatus(leg).reason, "rule-expired");
    assert.match(bicycleStatus(leg).explanation, /2026-09-24.*2026-12-12/);
    assert.equal(carriageForLeg(leg).bikeReservation, "unknown");
  }
  const unknown = train([], { fromId: "ch:1:sloid:999999999", operator: "Unmapped" }); unknown.bicycleEvidence = undefined;
  assert.equal(bicycleStatus(unknown).reason, "identifier-unrecognised");
});
