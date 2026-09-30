import assert from "node:assert/strict";
import { it } from "node:test";
import { bicyclePermission, evaluateBicyclePermission, bicycleLegAllowed, type BicycleEvidence } from "./bicyclePermission.ts";
import type { TransitLeg } from "./routing.ts";

const leg = (): TransitLeg => ({ mode: "transit", category: "IR", operator: "Unreviewed operator", from: "A", to: "B",
  fromId: "8500001", toId: "8500002", service: "IR 1", serviceName: null, direction: null,
  departure: new Date("2026-10-01T08:30:00+02:00"), arrival: new Date("2026-10-01T08:50:00+02:00"), departurePlatform: null, arrivalPlatform: null });
const proof = (l: TransitLeg): BicycleEvidence => ({ permission: "allowed", fromId: l.fromId!, toId: l.toId!,
  departure: l.departure!.toISOString(), service: l.service, operator: l.operator!, conditions: [],
  source: { title: "Synthetic evidence", url: "https://example.org/rule", checked: "2026-09-30" } });

it("keeps cached and uncached verdicts equal across mixed operators, modes and evidence", () => {
  for (const operator of ["SBB", "SOB", "BLS", "RHB", "VBZ", "TPG", "ABF", "Unknown"]) {
    for (const category of ["IR", "IC", "S", "RE", "B", "TRAM", "SEV", "BOAT"]) {
      for (const permission of [undefined, "allowed", "unknown", "prohibited"] as const) {
        const l = { ...leg(), operator, category };
        if (permission) l.bicycleEvidence = { ...proof(l), permission };
        for (let i = 0; i < 3; i++) assert.equal(bicyclePermission(l), evaluateBicyclePermission(l));
      }
    }
  }
});
it("invalidates when evidence is added, changed in place, or removed", () => {
  const l = leg(); assert.equal(bicyclePermission(l), "uncertain");
  l.bicycleEvidence = proof(l); assert.equal(bicyclePermission(l), "confirmed");
  l.bicycleEvidence.permission = "prohibited";
  assert.equal(bicyclePermission(l), "prohibited");
  assert.equal(bicycleLegAllowed(l, "include-unknown", "allow-uncertain"), false);
  assert.equal(bicycleLegAllowed(l, "include-unknown", "all-transit"), true);
  delete l.bicycleEvidence; assert.equal(bicyclePermission(l), "uncertain");
});
it("invalidates nested evidence/source edits and mutable departure dates", () => {
  const l = leg(); l.bicycleEvidence = proof(l);
  assert.equal(bicyclePermission(l), "confirmed");
  l.bicycleEvidence.conditions.push("Bicycle carriage restricted to international travel");
  assert.equal(bicyclePermission(l), "uncertain");
  l.bicycleEvidence.conditions.pop(); assert.equal(bicyclePermission(l), "confirmed");
  l.bicycleEvidence.source.url = "http://example.org/rule"; assert.equal(bicyclePermission(l), "uncertain");
  l.bicycleEvidence.source.url = "https://example.org/rule"; assert.equal(bicyclePermission(l), "confirmed");
  l.bicycleEvidence.source.checked = "invalid"; assert.equal(bicyclePermission(l), "uncertain");
  l.bicycleEvidence.source.checked = "2026-09-30"; assert.equal(bicyclePermission(l), "confirmed");
  l.departure!.setTime(l.departure!.getTime() + 60_000); assert.equal(bicyclePermission(l), "uncertain");
  l.bicycleEvidence.departure = l.departure!.toISOString(); assert.equal(bicyclePermission(l), "confirmed");
  l.toId = "8500003"; assert.equal(bicyclePermission(l), "uncertain");
});
it("invalidates operator/category, service-name and geographical rule inputs", () => {
  const l = { ...leg(), operator: "SBB", category: "S", fromPoint: { lat: 47.3, lon: 8.5 }, toPoint: { lat: 47.4, lon: 8.6 } };
  assert.equal(bicyclePermission(l), "confirmed", "Zürich morning window ends at 08:00");
  l.fromPoint.lat = 46; l.toPoint.lat = 46.1; l.fromPoint.lon = 8.9; l.toPoint.lon = 8.9;
  assert.equal(bicyclePermission(l), "uncertain", "Ticino morning window ends at 09:00");
  l.category = "IR"; assert.equal(bicyclePermission(l), "confirmed");
  l.serviceName = "Replacement bus"; assert.equal(bicyclePermission(l), "uncertain");
  l.serviceName = null; assert.equal(bicyclePermission(l), "confirmed");
  l.category = "B"; l.operator = "ABF"; assert.equal(bicyclePermission(l), "prohibited");
});
