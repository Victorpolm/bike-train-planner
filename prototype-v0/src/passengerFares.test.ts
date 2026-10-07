import assert from "node:assert/strict";
import { it } from "node:test";
import { DEFAULT_FARE_PROFILE, fareSummary, fareCardSummary, fareRows } from "./fares.ts";
import { fareQuery, type OnlineFare } from "./onlineFare.ts";
import type { TransitLeg } from "./routing.ts";

const leg: TransitLeg = { mode: "transit", from: "City A", to: "City B", fromId: "8587346", toId: "8591388",
  departure: new Date("2026-10-08T08:00:00Z"), arrival: new Date("2026-10-08T08:10:00Z"), service: "T4", category: "T", operator: "Test city",
  departurePlatform: null, arrivalPlatform: null, serviceName: null, direction: null };
const quote: OnlineFare = { status: "partial", passenger: { chf: 4.7, product: "City single ticket", productId: "city-ticket" },
  bicycle: null, checked: "2026-10-07T12:00:00Z", environment: "test" };
const prohibited = (): TransitLeg => ({ ...leg, bicycleEvidence: { permission: "prohibited", fromId: leg.fromId!, toId: leg.toId!,
  departure: leg.departure!.toISOString(), service: leg.service, operator: leg.operator!, conditions: [],
  source: { title: "Dated city rule", url: "https://example.test/city", checked: quote.checked } } });

it("shows a returned city passenger price even when the bicycle ticket or reservation is unknown", () => {
  const fare = fareSummary([leg], DEFAULT_FARE_PROFILE, quote);
  assert.equal(fare.passengerChf, 4.7); assert.equal(fare.totalChf, null);
  assert.match(fareCardSummary([leg], DEFAULT_FARE_PROFILE, quote).price, /^Passenger · CHF 4.70 estimated$/);
  const withBike = { ...quote, status: "quoted" as const, bicycle: { chf: 3.3, product: "City bicycle", productId: "city-bike" } };
  assert.equal(fareSummary([leg], DEFAULT_FARE_PROFILE, withBike).reservationChf, null);
  assert.match(fareCardSummary([leg], DEFAULT_FARE_PROFILE, withBike).price, /^Passenger · CHF 4.70/);
});
it("quotes and displays passenger travel separately when the selected service prohibits bicycles", () => {
  const denied = prohibited(), query = fareQuery([denied], DEFAULT_FARE_PROFILE)!;
  assert.equal(query.bicycle, false); assert.equal(query.passenger, "full");
  const fare = fareSummary([denied], DEFAULT_FARE_PROFILE, quote);
  assert.equal(fare.prohibited, true); assert.equal(fare.passengerChf, 4.7); assert.equal(fare.totalChf, null);
  const card = fareCardSummary([denied], DEFAULT_FARE_PROFILE, quote);
  assert.match(card.price, /^Passenger · CHF 4.70/); assert.match(card.detail, /not permitted/);
  assert.equal(fareRows([denied], DEFAULT_FARE_PROFILE, quote).rows[1].value, "Not permitted");
});
it("removes bicycle tickets, reservations and prohibition warnings when the bike stays off transit", () => {
  for (const service of [leg, prohibited()]) {
    const query = fareQuery([service], DEFAULT_FARE_PROFILE, false)!;
    assert.equal(query.bicycle, false);
    const fare = fareSummary([service], DEFAULT_FARE_PROFILE, quote, false);
    assert.equal(fare.prohibited, false); assert.equal(fare.bikeChf, 0); assert.equal(fare.reservationChf, 0);
    assert.equal(fare.totalChf, 4.7);
    assert.deepEqual(fareRows([service], DEFAULT_FARE_PROFILE, quote, false).rows.map(r => r.label), ["Passenger"]);
    assert.match(fareCardSummary([service], DEFAULT_FARE_PROFILE, quote, false).price, /^CHF 4.70/);
  }
});
it("keeps missing passenger prices unknown and retains the requested Half Fare entitlement", () => {
  const profile = { ...DEFAULT_FARE_PROFILE, passenger: "half-fare" as const };
  assert.equal(fareQuery([leg], profile, false)!.passenger, "half-fare");
  assert.equal(fareSummary([leg], profile, undefined, false).totalChf, null);
  assert.equal(fareSummary([leg], profile, { ...quote, passenger: { ...quote.passenger!, chf: 3.3 } }, false).totalChf, 3.3);
});
