import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { interpretBicycleAttributes, carriageForLeg, withTripInfoRule } from "./bicycleCarriage.ts";
import { bicycleLegAllowed, bicyclePermission } from "./bicyclePermission.ts";
import { mergeOjpConnections, parseOjpConnections, parseOjpTripInfo, ojpTripRequest, ojpTripInfoRequest } from "./ojp.ts";
import { addOjpConnections, OjpClient } from "./ojpClient.ts";
import { DEFAULT_OPTIONS, emptyNetwork } from "./model.ts";
import { plan, updateBicycleEvidence } from "./api.ts";
import { createOjpHandler } from "../server/ojpHandler.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/ojp-2026-09-24/${name}.xml`, import.meta.url), "utf8");
const checked = "2026-09-24T17:32:00Z";
const attr = (code: string, text = "") => ({ code, text, scope: "service" as const });
const boatOff = parseOjpConnections(fixture("water-off"), false), boatOn = parseOjpConnections(fixture("water-on"), true);
const body = { from: boatOff[0].from, to: boatOff[0].to, departure: boatOff[0].departure };
const request = (path = "connections", data: unknown = body, origin?: string) => new Request(`https://app.example/api/ojp/${path}`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data),
});

describe("recorded Swiss OJP bicycle evidence", () => {
  it("keeps prohibited boat services only in the unrestricted graph", () => {
    assert.ok(boatOff.some(l => l.rule?.permission === "prohibited"));
    assert.ok(!boatOn.some(l => l.rule?.permission === "prohibited"));
    const network = emptyNetwork();
    addOjpConnections(network, { legs: mergeOjpConnections(boatOff, boatOn), checked, warnings: [] });
    const forbidden = [...network.edges.values()].find(e => bicyclePermission(e.leg) === "prohibited")!.leg;
    assert.equal(bicycleLegAllowed(forbidden, "include-unknown", "confirmed"), false);
    assert.equal(bicycleLegAllowed(forbidden, "include-unknown", "allow-uncertain"), false);
    assert.equal(bicycleLegAllowed(forbidden, "include-unknown", "all-transit"), true);
  });
  it("uses a dated bicycle-filter match and does not infer missing reservation requirements", () => {
    const raw = parseOjpConnections(fixture("rail-off"), false).find(l => l.rule?.permission === "unknown")!;
    const filtered = parseOjpConnections(fixture("rail-on"), true).find(l => l.reference?.journeyRef === raw.reference!.journeyRef)!;
    assert.equal(filtered.rule!.permission, "allowed"); assert.equal(filtered.rule!.basis, "ojp-filter");
    assert.equal(filtered.rule!.bikeReservation, "unknown");
    const network = emptyNetwork(); addOjpConnections(network, { legs: [filtered], checked, warnings: [] });
    const leg = [...network.edges.values()][0].leg;
    assert.equal(bicyclePermission(leg), "confirmed");
    assert.equal(carriageForLeg(leg).bikeTicket, "required");
    assert.equal(bicyclePermission({ ...leg, departure: new Date(leg.departure!.getTime() + 60_000) }), "uncertain");
  });
  it("distinguishes a bike reservation from passenger and group reservations", () => {
    const bus = parseOjpConnections(fixture("bus-off"), false);
    assert.ok(bus.some(l => l.rule?.bikeReservation === "required"));
    assert.ok(bus.some(l => l.rule?.bikeReservation === "not-required"));
    assert.equal(interpretBicycleAttributes([attr("A___R"), attr("A__GR")], true).bikeReservation, "unknown");
    assert.equal(interpretBicycleAttributes([attr("I_9w2")]).permission, "unknown");
    assert.equal(interpretBicycleAttributes([attr("A__VN"), attr("A__VR")], true).permission, "prohibited");
    const text = "Die Mitnahme von Velos ist ohne Reservation möglich, sofern genügend Mitnahmeplätze vorhanden sind.";
    const conflict = interpretBicycleAttributes([attr("A__VR"), attr("I_9w2", text)]);
    assert.equal(conflict.bikeReservation, "unknown");
    const network = emptyNetwork(); addOjpConnections(network, { legs: [bus.find(l => l.rule?.bikeReservation === "not-required")!], checked, warnings: [] });
    const evidence = [...network.edges.values()][0].leg.bicycleEvidence!;
    assert.equal(withTripInfoRule(evidence, conflict, checked).prerequisites!.bikeReservation, "unknown");
  });
  for (const mode of ["rail", "bus", "water"]) it(`matches ${mode} TripInfo to the exact dated segment`, () => {
    const legs = parseOjpConnections(fixture(`${mode}-off`), false).filter(l => l.reference);
    const matches = legs.flatMap(leg => { try { return [{ leg, rule: parseOjpTripInfo(fixture(`${mode}-tripinfo`), leg.reference!) }]; } catch { return []; } });
    assert.ok(matches.length > 0);
    const { leg, rule } = matches[0];
    assert.equal(rule.permission, leg.rule!.permission);
    assert.throws(() => parseOjpTripInfo(fixture(`${mode}-tripinfo`), { ...leg.reference!, operatingDay: "2026-09-26" }), /mismatch/);
    assert.throws(() => parseOjpTripInfo(fixture(`${mode}-tripinfo`), { ...leg.reference!, fromRef: "unrelated-stop" }), /segment/);
  });
  it("restricts stop notes to the boarded interval", () => {
    const call = (order: number, stop: string, time: string, forbidden = false) => `<OnwardCall><Order>${order}</Order><StopPointRef>${stop}</StopPointRef><ServiceDeparture><TimetabledTime>${time}</TimetabledTime></ServiceDeparture><ServiceArrival><TimetabledTime>${time}</TimetabledTime></ServiceArrival>${forbidden ? '<Attribute><Code>A__VN</Code></Attribute>' : ''}</OnwardCall>`;
    const xml = (outside: boolean) => `<OJP><OJPResponse><ServiceDelivery><OJPTripInfoDelivery><TripInfoResult><Service><JourneyRef>dated</JourneyRef><OperatingDayRef>2026-09-25</OperatingDayRef></Service>${call(1, "a", "2026-09-25T08:00:00Z")}${call(2, "b", "2026-09-25T09:00:00Z", !outside)}${call(3, "c", "2026-09-25T10:00:00Z", outside)}</TripInfoResult></OJPTripInfoDelivery></ServiceDelivery></OJPResponse></OJP>`;
    const ref = { journeyRef: "dated", operatingDay: "2026-09-25", fromRef: "a", toRef: "b", departure: "2026-09-25T08:00:00.000Z", arrival: "2026-09-25T09:00:00.000Z", fromOrder: 1, toOrder: 2, bikeFiltered: false, attributes: [] };
    assert.equal(parseOjpTripInfo(xml(true), ref).permission, "unknown");
    assert.equal(parseOjpTripInfo(xml(false), ref).permission, "prohibited");
  });
  it("preserves independent searches when TripInfo supplies a new prohibition", async () => {
    const input = boatOn.find(l => l.mode === "transit")!;
    const signal = new AbortController().signal;
    const fetcher: typeof fetch = async () => Response.json({ legs: [input], checked, warnings: [] });
    const session = await plan({ ...input.from, label: input.from.name, stopId: input.from.id }, { ...input.to, label: input.to.name, stopId: input.to.id }, "baseline",
      { ...DEFAULT_OPTIONS, maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0 }, signal, () => {}, () => {}, {
        start: new Date(Date.parse(input.departure) - 10 * 60_000), gapMs: 0, cyclingClient: null,
        fetcher: async () => { throw new Error("Unexpected fallback"); }, ojpClient: new OjpClient(signal, fetcher),
      });
    assert.ok(session.confirmed!.baseline.journeys.length); assert.equal(session.client.requests, 2);
    const target = [...session.network.edges.values()][0].leg;
    updateBicycleEvidence(session, target, withTripInfoRule(target.bicycleEvidence!, interpretBicycleAttributes([attr("A__VN")]), checked), () => {});
    assert.equal(session.confirmed!.baseline.journeys.length, 0); assert.equal(session.baseline.journeys.length, 0);
    assert.ok(session.allTransit!.baseline.journeys.length);
  });
  it("escapes requests and rejects XML entities", () => {
    assert.match(ojpTripRequest({ ...body, from: { ...body.from, name: "A < B & C" } }, true, checked), /A &lt; B &amp; C/);
    assert.match(ojpTripInfoRequest({ ...boatOn[0].reference!, journeyRef: "A<&" }, checked), /A&lt;&amp;/);
    assert.throws(() => parseOjpConnections('<!DOCTYPE OJP [<!ENTITY x "bad">]><OJP/>', false));
  });
});

describe("server-only OJP boundary", () => {
  it("does not send a request without a runtime secret", async () => {
    const handler = createOjpHandler(async () => { throw new Error("Must not fetch"); }, 0);
    assert.equal((await handler(request(), {})).status, 503);
    assert.deepEqual(await (await handler(new Request("https://app.example/api/ojp/status"), {})).json(), { available: false });
  });
  it("sends the key only upstream and caches successful paired searches", async () => {
    let calls = 0; const secret = "test-secret-never-client-visible";
    const handler = createOjpHandler(async (url, init) => {
      calls++; assert.equal(url, "https://api.opentransportdata.swiss/ojp20");
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${secret}`);
      return new Response(fixture(String(init?.body).includes("<BikeTransport>true") ? "water-on" : "water-off"));
    }, 0);
    const response = await handler(request(), { OJP_API_KEY: secret });
    assert.equal(response.status, 200); assert.ok(!(await response.text()).includes(secret));
    await handler(request(), { OJP_API_KEY: secret }); assert.equal(calls, 2);
    assert.equal((await handler(request("connections", body, "https://other.example"), { OJP_API_KEY: secret })).status, 403);
    assert.equal((await handler(request("connections", { ...body, from: { ...body.from, lat: 0 } }), { OJP_API_KEY: secret })).status, 400);
    assert.equal(calls, 2);
  });
  it("keeps unfiltered permission unknown after a filtered call fails", async () => {
    let calls = 0;
    const handler = createOjpHandler(async () => ++calls === 1 ? new Response(fixture("rail-off")) : new Response("Do not expose diagnostics", { status: 429 }), 0);
    const response = await handler(request(), { OJP_API_KEY: "test-key" });
    const data = await response.json();
    assert.equal(response.status, 200); assert.equal(data.warnings.length, 1);
    assert.ok(data.legs.some((l: any) => l.rule?.permission === "unknown"));
    assert.ok(data.legs.every((l: any) => l.rule?.basis !== "ojp-filter"));
    const retry = await handler(request(), { OJP_API_KEY: "test-key" });
    assert.equal(retry.status, 502); assert.equal(calls, 2);
  });
});
