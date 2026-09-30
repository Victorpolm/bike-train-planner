import assert from "node:assert/strict";
import { it } from "node:test";
import { normalizeCode, normalizeName, operatorCode } from "./normalization.ts";
import { bicyclePermission } from "./bicyclePermission.ts";
import { nationalBikeTariff } from "./fares.ts";
import type { TransitLeg } from "./routing.ts";

const leg = (operator: string): TransitLeg => ({ mode: "transit", category: "IR", operator,
  from: "A", to: "B", fromId: "8500001", toId: "8500002", service: "IR 13", serviceName: null,
  departure: new Date("2026-10-01T10:00:00+02:00"), arrival: new Date("2026-10-01T10:30:00+02:00"),
  departurePlatform: null, arrivalPlatform: null, direction: null });

it("normalises labels and reviewed codes consistently, including Unicode spaces and forms", () => {
  assert.equal(normalizeCode(" \tｉｒ\u00a0"), "IR");
  assert.equal(normalizeName("  Zürich\u00a0\u00a0HB \n"), "zürich hb");
  assert.equal(normalizeName(undefined), "");
  assert.notEqual(normalizeName("Genève"), normalizeName("Geneve"), "Do not add fuzzy accent matching to exact fare/station identity");
});
it("keeps permission and fare coverage consistent for explicit SOB name variants", () => {
  for (const name of ["SOB", " Schweizerische   Südostbahn ", "Schweizerische Südostbahn (sob)", "Schweizerische Südostbahn AG (SOB)"]) {
    const service = leg(name); service.category = " ir ";
    assert.equal(operatorCode(name), "SOB");
    assert.equal(bicyclePermission(service), "confirmed");
    assert.equal(nationalBikeTariff(service), true);
  }
});
it("does not confer a reviewed rule on a similar name or replacement service", () => {
  for (const name of ["Not SOB", "SOB partner", "Schweizerische Südostbahn (other)"]) assert.equal(bicyclePermission(leg(name)), "uncertain");
  const replacement = { ...leg("SOB"), category: " SEV ", serviceName: "Replacement bus" };
  assert.equal(bicyclePermission(replacement), "uncertain");
  assert.equal(nationalBikeTariff(replacement), false);
});
