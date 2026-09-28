import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { XMLParser } from "fast-xml-parser";
import { fareTrips, fareRequest, retainedFareTrip, type FareTrip } from "../server/fareProtocol.ts";
import { MAX_FARE_SOURCE_BYTES, retainedConnections, signFareTrip, verifyFareSources } from "../server/retainedFare.ts";
import { createFareHandler } from "../server/fareHandler.ts";
import { createOjpHandler } from "../server/ojpHandler.ts";
import { addOjpConnections } from "./ojpClient.ts";
import { mergeOjpConnections } from "./ojp.ts";
import { emptyNetwork } from "./model.ts";
import { fareQuery, type FareQuery } from "./onlineFare.ts";
import { DEFAULT_FARE_PROFILE } from "./fares.ts";

const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const fixture = (n: string, type = "trip") => readFileSync(new URL(`./fixtures/fares-2026-09-27/${n}-${type}.xml`, import.meta.url), "utf8")
  .replaceAll("2026-09-29", day).replaceAll("fareprobe", "farequote");
const secret = "server-only-test-ojp-key", fareSecret = "server-only-test-fare-key";
const request = (query: FareQuery) => new Request("https://app.example/api/fares/quote", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) });
const env = { OJP_API_KEY: secret, OJP_FARE_API_KEY: fareSecret };
const parsedTrip = (trip: FareTrip) => new XMLParser({ removeNSPrefix: true, parseTagValue: false }).parse(fareRequest(trip, "full"))
  .OJP.OJPRequest.ServiceRequest.OJPFareRequest.TripFareRequest.Trip;
function split(trip: FareTrip) {
  return trip.segments.map((segment, i) => {
    const raw = structuredClone(trip.raw);
    const timed = raw["ojp:Leg"].filter((l: any) => l["ojp:TimedLeg"])[i];
    raw["ojp:Leg"] = [timed];
    return { ...trip, raw, firstLeg: timed["ojp:Id"], lastLeg: timed["ojp:Id"], segments: [segment] };
  });
}

it("retains the complete trip through OJP, network merges and fare selection without exposing keys", async () => {
  const xml = fixture("01"), data = await retainedConnections(xml, false, secret);
  const filtered = await retainedConnections(xml, true, secret);
  const sources = [...new Map([...data.sources, ...filtered.sources].map(s => [s.id, s])).values()];
  const network = emptyNetwork();
  addOjpConnections(network, { legs: mergeOjpConnections(data.legs, filtered.legs), checked: new Date().toISOString(), warnings: [], fareSources: sources });
  // An older/fallback result cannot erase the retained source of an existing edge.
  addOjpConnections(network, { legs: data.legs, checked: new Date().toISOString(), warnings: [] });
  const legs = [...network.edges.values()].map(e => e.leg).filter(l => l.mode === "transit");
  const query = fareQuery(legs, DEFAULT_FARE_PROFILE)!;
  assert.equal(query.sources?.length, 1);
  assert.ok(JSON.stringify(query).length > 8192, "real provider data exceeds the old request cap");
  assert.ok(!JSON.stringify(query).includes(secret));
  const originals = await verifyFareSources(query.sources, secret);
  assert.deepEqual(originals[0], fareTrips(xml)[0]);
  const selected = retainedFareTrip(originals, query.segments)!;
  assert.equal(selected.source, "retained"); assert.deepEqual(selected.trip.raw, originals[0].raw);
});

it("returns signed sources from the actual OJP handler and accepts them in a new fare-handler instance", async () => {
  const trip = fareTrips(fixture("01"))[0];
  const handler = createOjpHandler(async () => new Response(fixture("01")), 0);
  const body = { from: { id: trip.segments[0].from, name: "Chur", ...trip.segments[0].fromPoint },
    to: { id: trip.segments.at(-1)!.to, name: "Luzern", ...trip.segments.at(-1)!.toPoint }, departure: trip.segments[0].departure };
  const response = await handler(new Request("https://app.example/api/ojp/connections", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), env);
  assert.equal(response.status, 200);
  const data = await response.json(), network = emptyNetwork(); addOjpConnections(network, data);
  const query = fareQuery([...network.edges.values()].map(e => e.leg), DEFAULT_FARE_PROFILE)!;
  for (let restart = 0; restart < 2; restart++) {
    let calls = 0;
    const quoteHandler = createFareHandler(async (url, options) => {
      calls++; assert.equal(url, "https://api.opentransportdata.swiss/ojpfare");
      assert.equal(new Headers(options?.headers).get("authorization"), "Bearer " + fareSecret);
      assert.ok(!String(options?.body).includes("<OJPTripRequest>"));
      return new Response(fixture("01", String(options?.body).includes("<PassengerCategory>Bicycle") ? "bicycle" : "full"));
    }, 0);
    const replies = await Promise.all([quoteHandler(request(query), env), quoteHandler(request(query), env)]);
    const result = await replies[0].json();
    assert.equal(result.status, "quoted"); assert.equal(result.itinerarySource, "retained");
    assert.equal(result.passenger.chf, 32.6); assert.equal(result.bicycle.chf, 25.5); assert.equal(calls, 2);
  }
});

it("builds a selected subtrip from its exact leg and recalculates coverage and times", () => {
  const original = fareTrips(fixture("01"))[0], before = structuredClone(original);
  const selected = retainedFareTrip([original], [original.segments[1]])!;
  assert.equal(selected.source, "assembled");
  const raw = parsedTrip(selected.trip), source = parsedTrip(original);
  assert.equal(raw.StartTime, original.segments[1].departure);
  assert.equal(raw.EndTime, original.segments[1].arrival); assert.equal(raw.Duration, "PT2400S");
  assert.equal(raw.Transfers, "0"); assert.equal(raw.Leg.Id, "1");
  assert.deepEqual(raw.Leg.TimedLeg, source.Leg[2].TimedLeg);
  assert.equal(selected.trip.firstLeg, "1"); assert.equal(selected.trip.lastLeg, "1");
  assert.deepEqual(original, before);
});

it("assembles services from distinct sources with unique IDs and preserved intermediate stops/namespaces", async () => {
  const original = fareTrips(fixture("01"))[0], sources = split(original);
  // A different provider response may use another namespace prefix.
  const other = fareTrips(fixture("01").replace(/(<\/?)ojp:/g, "$1other:").replaceAll("xmlns:ojp", "xmlns:other"))[0];
  sources[1] = { ...other, raw: { ...other.raw, "other:Leg": [other.raw["other:Leg"][2]] },
    segments: [other.segments[1]], firstLeg: "3", lastLeg: "3" };
  const selected = retainedFareTrip(sources, original.segments)!;
  assert.equal(selected.source, "assembled");
  const raw = parsedTrip(selected.trip), source = parsedTrip(original);
  assert.deepEqual(raw.Leg.map((l: any) => l.Id), ["1", "2"]);
  assert.deepEqual(raw.Leg.map((l: any) => l.TimedLeg), [source.Leg[0].TimedLeg, source.Leg[2].TimedLeg]);
  assert.equal(raw.Transfers, "1"); assert.equal(raw.Duration, "PT8040S");
  const signed = await Promise.all(sources.map(s => signFareTrip(s, secret)));
  const query: FareQuery = { segments: original.segments, sources: signed, passenger: "full", bicycle: false };
  let calls = 0;
  const handler = createFareHandler(async (_url, options) => {
    calls++; assert.ok(!String(options?.body).includes("<OJPTripRequest>"));
    return new Response(fixture("01", "full").replace(/(<(?:\w+:)?ToLegIdRef>)3(<\/)/g, "$12$2"));
  }, 0);
  const result = await (await handler(request(query), env)).json();
  assert.equal(result.itinerarySource, "assembled"); assert.equal(calls, 1);
  // The provider response still has to cover the assembled leg IDs exactly.
  assert.equal(result.status, "quoted"); assert.equal(result.passenger.chf, 32.6);
});

it("requires a real provider transfer between different stations and enough connection time", () => {
  const original = fareTrips(fixture("03"))[0], parts = split(original);
  assert.equal(retainedFareTrip(parts, original.segments), undefined);
  parts[0].raw["ojp:Leg"].push(structuredClone(original.raw["ojp:Leg"][1]));
  const selected = retainedFareTrip(parts, original.segments)!;
  assert.equal(selected.source, "assembled");
  assert.deepEqual(parsedTrip(selected.trip).Leg[1].TransferLeg, parsedTrip(original).Leg[1].TransferLeg);
  const tooShort = structuredClone(parts);
  tooShort[0].raw["ojp:Leg"][1]["ojp:TransferLeg"]["ojp:Duration"] = "PT1H";
  assert.equal(retainedFareTrip(tooShort, original.segments), undefined);
  const sameStation = fareTrips(fixture("01"))[0], sameParts = split(sameStation);
  const platformWalk = structuredClone(sameStation.raw["ojp:Leg"][1]);
  platformWalk["ojp:TransferLeg"]["ojp:Duration"] = "PT1H";
  sameParts[0].raw["ojp:Leg"].push(platformWalk);
  assert.equal(retainedFareTrip(sameParts, sameStation.segments), undefined);
});

it("rejects tampered, duplicated, oversized and differently signed trip payloads", async () => {
  const source = await signFareTrip(fareTrips(fixture("01"))[0], secret);
  await assert.rejects(verifyFareSources([{ ...source, payload: source.payload.replace("Chur", "Bern") }], secret));
  await assert.rejects(verifyFareSources([source], "rotated-key"));
  await assert.rejects(verifyFareSources([source, source], secret));
  await assert.rejects(verifyFareSources([{ ...source, payload: "x".repeat(MAX_FARE_SOURCE_BYTES + 1) }], secret));
  await assert.rejects(verifyFareSources([], secret));
  let calls = 0;
  const handler = createFareHandler(async () => { calls++; throw new Error("Must not call upstream"); }, 0);
  const query: FareQuery = { segments: fareTrips(fixture("01"))[0].segments, sources: [{ ...source, id: "0".repeat(64) }], passenger: "full", bicycle: true };
  assert.equal((await handler(request(query), env)).status, 400); assert.equal(calls, 0);
});

it("retains a walking connection from a third source when neither selected service contains it", async () => {
  const xml = fixture("03"), original = fareTrips(xml)[0], parts = split(original);
  const connectorSource = structuredClone(original);
  connectorSource.segments.forEach(s => { s.journeyRef += "-other-service"; });
  for (const leg of connectorSource.raw["ojp:Leg"]) {
    if (leg["ojp:TimedLeg"]) leg["ojp:TimedLeg"]["ojp:Service"]["ojp:JourneyRef"] += "-other-service";
  }
  const data = await retainedConnections(xml, false, secret);
  assert.ok(data.legs.filter(l => l.mode === "walk").every(l => l.fareSourceIds?.length));
  const sources = await Promise.all([...parts, connectorSource].map(t => signFareTrip(t, secret)));
  let index = 0;
  for (const leg of data.legs) leg.fareSourceIds = [sources[leg.mode === "walk" ? 2 : index++].id];
  const network = emptyNetwork();
  addOjpConnections(network, { legs: data.legs, fareSources: sources, checked: new Date().toISOString(), warnings: [] });
  const query = fareQuery([...network.edges.values()].map(e => e.leg), DEFAULT_FARE_PROFILE)!;
  assert.equal(query.sources?.length, 3);
  assert.equal(retainedFareTrip(parts, query.segments), undefined);
  const selected = retainedFareTrip(await verifyFareSources(query.sources, secret), query.segments)!;
  assert.equal(selected.source, "assembled");
  assert.deepEqual(parsedTrip(selected.trip).Leg[1].TransferLeg, parsedTrip(original).Leg[1].TransferLeg);
});

it("never reroutes or uses a retained quote for changed service times or service identities", async () => {
  const trip = fareTrips(fixture("01"))[0], source = await signFareTrip(trip, secret);
  let calls = 0;
  const handler = createFareHandler(async () => { calls++; throw new Error("Must not call upstream"); }, 0);
  for (const changed of ["departure", "journeyRef"] as const) {
    const query: FareQuery = { segments: structuredClone(trip.segments), sources: [source], passenger: "full", bicycle: true };
    query.segments[0][changed] = changed === "departure" ? new Date(Date.parse(query.segments[0].departure) + 60000).toISOString() : "different-service";
    const result = await (await handler(request(query), env)).json();
    assert.equal(result.status, "unavailable"); assert.match(result.reason, /retained service legs/);
  }
  assert.equal(calls, 0);
});
