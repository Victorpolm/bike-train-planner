import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { XMLParser } from "fast-xml-parser";
import { fareRequest, fareTripRequest, fareTrips, matchingFareTrip, parseFare } from "../server/fareProtocol.ts";
import { createFareHandler } from "../server/fareHandler.ts";
import { fareQuery, type FareQuery } from "./onlineFare.ts";
import { DEFAULT_FARE_PROFILE, fareSummary, fareCardSummary } from "./fares.ts";
import type { TransitLeg } from "./routing.ts";

const fixture = (n: string, kind: string) => readFileSync(new URL(`./fixtures/fares-2026-09-27/${n}-${kind}.xml`, import.meta.url), "utf8");
const quoteXml = (n: string, kind: string) => fixture(n, kind).replaceAll("fareprobe", "farequote");
const trip = fareTrips(fixture("01", "trip"))[0];
it("reads live full, HTA and class-independent bicycle prices without taking first-class or net prices", () => {
  assert.equal(parseFare(quoteXml("01", "full"), trip, "full")?.chf, 32.6);
  assert.equal(parseFare(quoteXml("01", "half-fare"), trip, "half-fare")?.chf, 18.6);
  assert.equal(parseFare(quoteXml("01", "bicycle"), trip, "bicycle")?.chf, 25.5);
  assert.equal(parseFare(quoteXml("01", "half-fare"), trip, "full"), null);
  assert.equal(parseFare(quoteXml("01", "bicycle"), trip, "full"), null);
  assert.equal(parseFare(fixture("01", "full"), trip, "full"), null);
});
it("keeps the real NOVA bicycle failure separate from valid passenger prices", () => {
  const t = fareTrips(fixture("09", "trip"))[0];
  assert.equal(parseFare(quoteXml("09", "full"), t, "full")?.chf, 73.6);
  assert.throws(() => parseFare(quoteXml("09", "bicycle"), t, "bicycle"));
});
it("preserves namespace scopes, tariff data and explicit empty/full versus HTA entitlements", () => {
  const p = new XMLParser({ removeNSPrefix: true, parseTagValue: false });
  for (const profile of ["full", "half-fare", "bicycle"] as const) {
    const raw = fareRequest(trip, profile), request = p.parse(raw).OJP.OJPRequest.ServiceRequest.OJPFareRequest;
    assert.equal(request.TripFareRequest.Trip.Id, "farequote");
    assert.equal(request.TripFareRequest.Trip.Leg[0].TimedLeg.Service.JourneyRef, trip.segments[0].journeyRef);
    assert.match(raw, /xmlns:siri="http:\/\/www.siri.org.uk\/siri"/);
    assert.equal(request.Params.Traveller.PassengerCategory, profile === "bicycle" ? "Bicycle" : "Adult");
    assert.equal(raw.includes("<EntitlementProductRef>HTA"), profile === "half-fare");
  }
  assert.match(fareTripRequest(trip.segments), /<UseRealtimeData>none/);
});
it("matches all service times and stops, including legacy-ID cross-provider evidence", () => {
  assert.ok(matchingFareTrip([trip], trip.segments));
  const e = structuredClone(trip.segments); e[0].from = "8509000";
  assert.ok(matchingFareTrip([trip], e));
  e[0].fromName = "A different station"; assert.equal(matchingFareTrip([trip], e), undefined);
  const shifted = structuredClone(trip.segments); shifted[0].departure = "2026-09-29T10:12:00Z";
  assert.equal(matchingFareTrip([trip], shifted), undefined);
  assert.equal(matchingFareTrip([trip], trip.segments.slice(1)), undefined);
});
it("rejects partial products, wrong currency, proto-products, XML entities and missing prices", () => {
  const raw = quoteXml("01", "full");
  for (const altered of [raw.replaceAll("<ns2:ToLegIdRef>3", "<ns2:ToLegIdRef>1"), raw.replaceAll("CHF", "EUR"),
    raw.replaceAll("<ns2:Price>32.60</ns2:Price>", ""),
    raw.replaceAll("<ns2:FareProduct>", "<ns2:FareProduct><ns2:ProtoProduct>true</ns2:ProtoProduct>")]) {
    assert.equal(parseFare(altered, trip, "full"), null);
  }
  assert.throws(() => fareTrips('<!DOCTYPE OJP [<!ENTITY x "bad">]><OJP/>'));
});
it("supports recorded bus + rail trips while preserving their full fare coverage", () => {
  for (const n of ["03", "08"]) {
    const t = fareTrips(fixture(n, "trip"))[0];
    assert.ok(parseFare(quoteXml(n, "full"), t, "full"));
    assert.ok(parseFare(quoteXml(n, "bicycle"), t, "bicycle"));
  }
});
it("uses only the server secret and deduplicates simultaneous quote requests", async () => {
  // Shift the fixture date to keep validation meaningful after September 2026.
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const xml = fixture("01", "trip").replaceAll("2026-09-29", day);
  const t = fareTrips(xml)[0], query: FareQuery = { segments: t.segments, passenger: "half-fare", bicycle: true };
  const request = () => new Request("https://app.example/api/fares/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) });
  let calls = 0; const secret = "test-key-not-for-the-client";
  const handler = createFareHandler(async (url, options) => {
    calls++; assert.equal(url, "https://api.opentransportdata.swiss/ojpfare");
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer " + secret);
    const body = String(options?.body);
    return new Response(body.includes("<OJPTripRequest>") ? xml : quoteXml("01", body.includes("<PassengerCategory>Bicycle") ? "bicycle" : "half-fare"));
  }, 0);
  const replies = await Promise.all([handler(request(), { OJP_FARE_API_KEY: secret }), handler(request(), { OJP_FARE_API_KEY: secret })]);
  const result = await replies[0].json();
  assert.equal(result.status, "quoted"); assert.equal(result.environment, "test");
  assert.equal(result.passenger.chf, 18.6); assert.equal(result.bicycle.chf, 25.5); assert.equal(calls, 3);
  assert.ok(!JSON.stringify(result).includes(secret));
  await handler(request(), { OJP_FARE_API_KEY: secret }); assert.equal(calls, 3);
  assert.equal((await handler(request(), {})).status, 503);
  assert.deepEqual(await (await handler(new Request("https://app.example/api/fares/status"), {})).json(), { available: false, environment: "test" });
});
it("never uses a quote for a route with an intermediate cycling break or grants carriage permission", () => {
  const leg: TransitLeg = { mode: "transit", from: "Chur", to: "Luzern", fromId: "8509000", toId: "8505000",
    fromPoint: { lat: 46.85, lon: 9.53 }, toPoint: { lat: 47.05, lon: 8.31 }, departure: new Date("2026-09-29T10:11:00Z"), arrival: new Date("2026-09-29T12:21:00Z"),
    departurePlatform: null, arrivalPlatform: null, service: "IR 35", category: "IR", operator: "SBB", serviceName: null, direction: null };
  assert.equal(fareQuery([leg, { ...leg, mode: "bike" }, leg], DEFAULT_FARE_PROFILE), null);
  const online = { status: "quoted" as const, checked: "2026-09-27T15:55:00Z", passenger: { chf: 32.6, productId: "84004", product: "Sparbillett" },
    bicycle: { chf: 25.5, productId: "40245", product: "Velobillett" }, environment: "test" as const };
  const result = fareSummary([leg], DEFAULT_FARE_PROFILE, online);
  assert.equal(result.passengerChf, 32.6); assert.equal(result.bikeChf, 15);
  assert.equal(result.minimumVerified, false); assert.equal(leg.bicycleEvidence, undefined);
  assert.match(fareCardSummary([leg], DEFAULT_FARE_PROFILE, online).detail, /test fare estimate/);
});
