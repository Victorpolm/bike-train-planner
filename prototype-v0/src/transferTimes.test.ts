import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { boardingCheck, mergeTransferRules, type StationTransferRule } from "./transferTimes.ts";
import { parseOjpConnections, mergeOjpConnections } from "./ojp.ts";
import { addOjpConnections } from "./ojpClient.ts";
import { DEFAULT_OPTIONS, emptyNetwork, metrics, solve, type Options } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { detourStages } from "./cyclingDetour.ts";
import { applyCyclingEdit } from "./cyclingEditor.ts";
import { zeroCycling } from "./cycling.ts";
import { fareQuery } from "./onlineFare.ts";
import { DEFAULT_FARE_PROFILE } from "./fares.ts";
import type { Place, TransitLeg } from "./routing.ts";

const start = new Date("2026-10-05T06:00:00Z"), day = "2026-10-05";
const at = (m: number) => new Date(+start + m * 60_000);
const a: Place = { label: "A", lat: 47, lon: 8, stopId: "8501000" };
const x: Place = { label: "X", lat: 47.1, lon: 8, stopId: "8502000" };
const d: Place = { label: "D", lat: 47.2, lon: 8, stopId: "8503000" };
const leg = (name: string, from: Place, to: Place, departure: number, arrival: number): TransitLeg => ({
  mode: "transit", from: from.label, to: to.label, fromId: from.stopId, toId: to.stopId, fromPoint: from, toPoint: to,
  departure: at(departure), arrival: at(arrival), departurePlatform: "1", arrivalPlatform: "2", service: name, serviceName: null, direction: null,
  ojp: { journeyRef: name, operatingDay: day, fromRef: from.stopId + ":1", toRef: to.stopId + ":2", fromOrder: 1, toOrder: 2,
    departure: at(departure).toISOString(), arrival: at(arrival).toISOString(), attributes: [], bikeFiltered: false },
});
const first = leg("First", a, x, 5, 10);
const rule = (incoming: TransitLeg, next: TransitLeg, seconds: number | null): StationTransferRule => ({ incomingJourneyRef: incoming.ojp!.journeyRef,
  incomingOperatingDay: incoming.ojp!.operatingDay, operatingDay: day, fromRef: incoming.ojp!.toRef, toRef: next.ojp!.fromRef, arrival: incoming.arrival!.toISOString(), departure: next.departure!.toISOString(),
  seconds, kind: "walk", checked: "2026-10-03T16:00:00Z" });
const options: Options = { ...DEFAULT_OPTIONS, maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0, maxIntermediateMinutes: 0, bicycleScope: "allow-uncertain" };
function graph(...legs: TransitLeg[]) {
  const n = emptyNetwork(); [a, x, d].forEach(p => n.stops.set(p.stopId!, { ...p, id: p.stopId!, name: p.label }));
  legs.forEach((l, i) => n.edges.set(String(i), { id: String(i), from: l.fromId!, to: l.toId!, leg: l })); return n;
}
const both = (legs: TransitLeg[], o = options) => [solve(graph(...legs), a, d, start, o, "baseline"), solveWaypoints(graph(...legs), [a, d], start, o, "baseline")];

it("retains recorded seven-minute Zürich HB and five-minute Biel/Bienne OJP transfers", () => {
  const xml = readFileSync(new URL("./fixtures/ojp-2026-09-24/rail-off.xml", import.meta.url), "utf8");
  const parsed = parseOjpConnections(xml, false), rules = parsed.flatMap(l => l.transferRules ?? []);
  assert.ok(rules.some(r => r.fromRef.startsWith("ch:1:sloid:3000:") && r.seconds === 420));
  assert.ok(rules.some(r => r.fromRef.startsWith("ch:1:sloid:4300:") && r.kind === "guaranteedConnection" && r.seconds === 300));
  const n = emptyNetwork(); addOjpConnections(n, { legs: parsed, checked: "2026-10-03T16:00:00Z", warnings: [] });
  assert.ok([...n.edges.values()].some(e => e.leg.transferRules?.some(r => r.seconds === 420)));
});
it("enforces a station's transfer time, displays it as a step and does not add the generic buffer twice", () => {
  const next = leg("Next", x, d, 17, 30); next.transferRules = [rule(first, next, 420)];
  for (const found of both([first, next])) {
    assert.equal(found.journeys.length, 1);
    const j = found.journeys[0], walk = j.transitLegs.find(l => l.stationTransfer)!;
    assert.equal(+walk.arrival! - +walk.departure!, 420_000); assert.equal(metrics(j).walk, 7);
    assert.equal(j.transitLegs.find(l => l.service === "Next"), next);
    assert.deepEqual(fareQuery(j.transitLegs, DEFAULT_FARE_PROFILE), fareQuery([first, next], DEFAULT_FARE_PROFILE));
  }
  const early = leg("Too early", x, d, 16, 30); early.transferRules = [rule(first, early, 420)];
  both([first, early]).forEach(s => assert.equal(s.journeys.length, 0));
});
it("keeps a later arriving service whose platform-specific transfer can catch the onward train", () => {
  const later = leg("Later", a, x, 6, 11), next = leg("Next", x, d, 16, 30);
  next.transferRules = [rule(first, next, 600), rule(later, next, 300)];
  for (const found of both([first, later, next])) {
    assert.equal(found.journeys.length, 1); assert.ok(found.journeys[0].transitLegs.includes(later));
  }
});
it("counts an explicit walking transfer once, including its time in connection validation", () => {
  const next = leg("Next", x, d, 17, 30); next.transferRules = [rule(first, next, 420)];
  const walk: TransitLeg = { ...first, mode: "walk", from: "X", to: "X", fromId: x.stopId, toId: x.stopId,
    departure: at(10), arrival: at(17), ojp: undefined, service: "Transfer on foot" };
  const check = boardingCheck([first, walk], next, +at(17), 3);
  assert.equal(check.readyAt, +at(17)); assert.equal(check.transferLeg, undefined);
});
it("uses the Swiss stop default only for same-stop transit changes and keeps access estimates separate", () => {
  const next = leg("Next", x, d, 12, 30);
  assert.equal(boardingCheck([first], next, +at(10), 3).readyAt, +at(12));
  assert.equal(boardingCheck([], next, +at(10), 3).source, "estimate");
  const bike: TransitLeg = { ...first, mode: "bike", departure: at(10), arrival: at(11), ojp: undefined };
  assert.equal(boardingCheck([first, bike], next, +at(11), 3).readyAt, +at(14));
  assert.equal(boardingCheck([{ ...first, toId: "foreign" }], next, +at(10), 3).source, "estimate");
});
it("never borrows a transfer rule from a different service, date, platform or departure", () => {
  const next = leg("Next", x, d, 20, 30); next.transferRules = [rule(first, next, 420)];
  for (const changed of [ { ...first, arrival: at(9) }, { ...first, ojp: { ...first.ojp!, journeyRef: "Other" } },
    { ...first, ojp: { ...first.ojp!, toRef: "other-platform" } }, { ...first, ojp: { ...first.ojp!, operatingDay: "2026-10-04" } }])
    assert.notEqual(boardingCheck([changed], next, +at(10), 3).source, "ojp");
  assert.notEqual(boardingCheck([first], { ...next, departure: at(21) }, +at(10), 3).source, "ojp");
});
it("keeps unknown transfer duration unusable and merges provider evidence conservatively", () => {
  const next = leg("Next", x, d, 20, 30), known = rule(first, next, 420), unknown = rule(first, next, null);
  next.transferRules = mergeTransferRules([known], [unknown, known]);
  assert.equal(next.transferRules.length, 2); assert.equal(boardingCheck([first], next, +at(10), 3).readyAt, Infinity);
});
it("preserves scoped transfer evidence when the same OJP service appears in another query", () => {
  const xml = readFileSync(new URL("./fixtures/ojp-2026-09-24/rail-off.xml", import.meta.url), "utf8");
  const parsed = parseOjpConnections(xml, false), target = parsed.find(l => l.transferRules?.length)!;
  const clean = { ...target, transferRules: undefined };
  assert.ok(mergeOjpConnections([target], [clean]).find(l => l.reference?.journeyRef === target.reference?.journeyRef)?.transferRules?.length);
  const n = emptyNetwork(); addOjpConnections(n, { legs: [target], checked: "2026-10-03", warnings: [] });
  addOjpConnections(n, { legs: [clean], checked: "2026-10-03", warnings: [] });
  assert.ok([...n.edges.values()][0].leg.transferRules?.length);
});
it("keeps a valid seven-minute transfer when applying an access-path edit", () => {
  const next = leg("Next", x, d, 17, 30); next.transferRules = [rule(first, next, 420)];
  const j = both([first, next])[0].journeys[0];
  j.originStation.cyclingRoute = zeroCycling(a, a);
  const o = { ...options, maxBikeMinutes: 5, maxAccessMinutes: 5 }, context = { journey: j, cycling: null, origin: a, destination: d, start, options: o };
  const stage = detourStages(j, null, a, d, start)[0];
  const applied = applyCyclingEdit(context, stage, [{ ...zeroCycling(a, a), minutes: 1 }]).journey!;
  assert.equal(applied.transitLegs.filter(l => l.stationTransfer).length, 1);
  assert.ok(applied.transitLegs.includes(first)); assert.ok(applied.transitLegs.includes(next));
  assert.deepEqual(fareQuery(applied.transitLegs, DEFAULT_FARE_PROFILE), fareQuery(j.transitLegs, DEFAULT_FARE_PROFILE));
});

it("supports combined walk/protected transfer types and retains missing durations as unknown", () => {
  const xml = readFileSync(new URL("./fixtures/ojp-2026-09-24/rail-off.xml", import.meta.url), "utf8");
  const combined = xml.replace("<TransferType>walk</TransferType>", "<TransferType>walk</TransferType><TransferType>protectedConnection</TransferType>");
  assert.ok(parseOjpConnections(combined, false).some(l => l.transferRules?.some(r => r.seconds === 420 && r.kind === "guaranteedConnection")));
  const missing = xml.replace(/(<TransferLeg>.*?<Duration>)PT7M(<\/Duration>)/, "$1invalid$2");
  assert.ok(parseOjpConnections(missing, false).some(l => l.transferRules?.some(r => r.seconds === null)));
});

it("applies an overnight interchange across distinct service operating days", () => {
  const arriving = { ...first, ojp: { ...first.ojp!, operatingDay: "2026-10-04" } };
  const next = leg("Next day", x, d, 17, 30); next.transferRules = [rule(arriving, next, 420)];
  assert.equal(boardingCheck([arriving], next, +at(10), 3).source, "ojp");
});
it("rejects unknown boarding times instead of treating NaN as feasible", () => {
  const next = leg("Next", x, d, 17, 30);
  assert.equal(boardingCheck([first], next, NaN, 3).readyAt, Infinity);
  assert.equal(boardingCheck([first], { ...next, departure: null }, +at(10), 3).source, "unknown");
});

it("retains recorded Rapperswil platform access and applies it only at its actual starting point", () => {
  const xml = readFileSync(new URL("./fixtures/ojp-2026-09-24/rail-off.xml", import.meta.url), "utf8");
  const found = parseOjpConnections(xml, false).find(l => l.accessRules?.some(r => r.seconds === 240))!;
  assert.ok(found);
  const n = emptyNetwork(); addOjpConnections(n, { legs: [found], checked: "2026-10-03", warnings: [] });
  const next = [...n.edges.values()][0].leg, point = next.accessRules![0].point;
  assert.equal(boardingCheck([], next, +at(10), 3, point).source, "ojp-access");
  assert.equal(boardingCheck([], next, +at(10), 3, { lat: 46, lon: 8 }).source, "estimate");
});
it("uses platform access before the first service and never adds the generic buffer twice", () => {
  const next = leg("Direct", a, d, 4, 30);
  next.accessRules = [{ point: a, toRef: next.ojp!.fromRef, departure: next.departure!.toISOString(), operatingDay: day, seconds: 240 }];
  for (const found of both([next])) {
    assert.equal(found.journeys.length, 1); assert.equal(metrics(found.journeys[0]).walk, 4);
    const access = found.journeys[0].transitLegs.find(l => l.stationAccess)!;
    assert.equal(boardingCheck([access], next, +at(4), 3).readyAt, +at(4));
  }
  next.accessRules[0].seconds = 300;
  both([next]).forEach(s => assert.equal(s.journeys.length, 0));
});
it("keeps platform-access evidence when merging repeated OJP results", () => {
  const xml = readFileSync(new URL("./fixtures/ojp-2026-09-24/rail-off.xml", import.meta.url), "utf8");
  const found = parseOjpConnections(xml, false).find(l => l.accessRules?.length)!;
  assert.ok(mergeOjpConnections([found], [{ ...found, accessRules: undefined }])[0].accessRules?.length);
  const n = emptyNetwork(); addOjpConnections(n, { legs: [found], checked: "2026-10-03", warnings: [] });
  addOjpConnections(n, { legs: [{ ...found, accessRules: undefined }], checked: "2026-10-03", warnings: [] });
  assert.ok([...n.edges.values()][0].leg.accessRules?.length);
});
