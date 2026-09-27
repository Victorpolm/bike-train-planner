import assert from "node:assert/strict";
import { it } from "node:test";
import { chooseBikeTicket, DEFAULT_FARE_PROFILE, fareSummary } from "./fares.ts";
import { publishedRouteFare } from "./fareCatalog.ts";
import { bicyclePermission, bicycleLegAllowed } from "./bicyclePermission.ts";
import { carriageForLeg } from "./bicycleCarriage.ts";
import type { TransitLeg } from "./routing.ts";
const leg = (changes: Partial<TransitLeg> = {}): TransitLeg => ({ mode: "transit", from: "Zürich HB", to: "Baden",
  fromId: "8503000", toId: "8503504", departure: new Date("2026-09-28T10:00:00+02:00"), arrival: new Date("2026-09-28T10:30:00+02:00"),
  service: "IR 35", category: "IR", operator: "SBB", serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null, ...changes });

it("selects the reduced bicycle fare, or the day pass on equal/higher fares, without hiding missing quotes", () => {
  for (const [reduced, day, amount, product] of [[7.1, 15, 7.1, "Reduced bicycle ticket"], [15, 15, 15, "Bike Day Pass"], [19, 15, 15, "Bike Day Pass"], [19, 16, 16, "Bike Day Pass"]] as const)
    assert.deepEqual(chooseBikeTicket(reduced, day), { chf: amount, product, minimumVerified: true });
  assert.equal(chooseBikeTicket(null, 15).minimumVerified, false);
  assert.equal(chooseBikeTicket(7.1, 15, true).chf, 0);
});
it("counts traversed zones, city zones twice and Dietikon's boundary correctly", () => {
  const baden = publishedRouteFare([leg()])!;
  assert.deepEqual(baden.zones, ["110", "154", "184", "570"]); assert.equal(baden.paidZones, 5);
  assert.equal(baden.passengerFull, 14.2); assert.equal(baden.bicycle, 7.1);
  const dietikon = publishedRouteFare([leg({ service: "S12", category: "S", toId: "8503508" })])!;
  assert.deepEqual(dietikon.zones, ["110", "154"]); assert.equal(dietikon.bicycle, 3.6);
  const city = publishedRouteFare([leg({ service: "S12", category: "S", toId: "8503001" })])!;
  assert.equal(city.passengerFull, 4.7); assert.equal(city.bicycle, 3.3); // Not full / 2.
  assert.equal(publishedRouteFare([leg({ service: "S5", category: "S", toId: "8502221" })])!.bicycle, 3.6);
});
it("uses one valid through-zone fare, preserves direction and separates seasonal reservations", () => {
  const first = leg({ service: "S12", category: "S", toId: "8503001", arrival: new Date("2026-09-28T10:10:00+02:00") });
  const second = leg({ fromId: "8503001", departure: new Date("2026-09-28T10:15:00+02:00") });
  assert.equal(fareSummary([first, second], DEFAULT_FARE_PROFILE).bikeChf, 7.1);
  assert.equal(publishedRouteFare([leg({ fromId: "8503504", toId: "8503000" })])!.bicycle, 7.1);
  const ic = fareSummary([leg({ service: "IC5", category: "IC" })], DEFAULT_FARE_PROFILE);
  assert.equal(ic.bikeChf, 7.1); assert.equal(ic.reservationChf, 2); assert.equal(ic.totalChf, 23.3);
});
it("does not invent corridor fares for other services, branches, operators, expired tariffs or overlong travel", () => {
  for (const changes of [{ service: "S6" }, { toId: "8507000" }, { operator: "Unknown" },
    { service: "S5", toId: "8503504" }, { arrival: new Date("2026-09-28T12:01:00+02:00") },
    { departure: new Date("2026-12-13T10:00:00+01:00"), arrival: new Date("2026-12-13T10:30:00+01:00") }])
    assert.equal(publishedRouteFare([leg(changes)]), null);
  assert.equal(publishedRouteFare([leg(), leg()]), null); // Disconnected tickets cannot be merged.
});
it("distinguishes Zürich and Ticino regional restrictions without making missing permission a ban", () => {
  const at = (hour: string, changes: Partial<TransitLeg> = {}) => leg({ service: "S12", category: "S", departure: new Date("2026-09-28T" + hour + ":00+02:00"), arrival: null, ...changes });
  assert.equal(bicyclePermission(at("07:30")), "uncertain");
  assert.equal(bicyclePermission(at("08:30")), "confirmed");
  assert.equal(bicyclePermission(at("08:30", { from: "Lugano", to: "Bellinzona" })), "uncertain");
  assert.equal(bicyclePermission(at("06:30", { from: "Lugano", to: "Bellinzona" })), "confirmed");
  const peak = at("07:39", { from: "Zürich Stadelhofen", fromId: "8503003", to: "Zürich Altstetten", toId: "8503001" });
  peak.bicycleEvidence = { permission: "prohibited", fromId: peak.fromId!, toId: peak.toId!, departure: peak.departure!.toISOString(),
    service: peak.service, operator: peak.operator!, source: { title: "Dated timetable", url: "https://search.ch/timetable", checked: "2026-09-27" }, conditions: ["VELOS: Keine Beförderung möglich"] };
  assert.equal(carriageForLeg(peak).permission, "prohibited");
  assert.equal(bicycleLegAllowed(peak, "include-unknown", "allow-uncertain"), false);
  assert.equal(bicycleLegAllowed(peak, "include-unknown", "all-transit"), true);
  peak.bicycleEvidence.toId = "8503504";
  assert.equal(bicyclePermission(peak), "uncertain"); // Evidence for another segment is not applicable.
});
it("limits the SZU bicycle prohibition to the upper Uetliberg branch", () => {
  const upper = leg({ service: "S10", category: "S", operator: "SZU", to: "Uetliberg" });
  assert.equal(bicyclePermission(upper), "prohibited");
  assert.notEqual(bicyclePermission({ ...upper, to: "Uitikon Waldegg" }), "prohibited");
  assert.notEqual(bicyclePermission({ ...upper, service: "S12", operator: "SBB", to: "Uitikon" }), "prohibited");
});
