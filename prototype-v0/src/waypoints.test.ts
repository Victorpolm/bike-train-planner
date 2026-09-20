import assert from "node:assert/strict";
import { it } from "node:test";
import { plan } from "./api.ts";
import { journeySteps } from "./itinerary.ts";
import { DEFAULT_OPTIONS, emptyNetwork, metrics, type Network, type Options, type Stop } from "./model.ts";
import { cyclingMinutes, cyclingOnly, haversineKm, type Place } from "./routing.ts";
import { solveWaypoints } from "./waypoints.ts";

const start = new Date("2026-09-20T08:00:00+02:00");
const time = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const stops: Stop[] = [
  { id: "A", name: "Start station", lat: 45, lon: 6 },
  { id: "B", name: "Intermediate station", lat: 46, lon: 7 },
  { id: "C", name: "Finish station", lat: 47, lon: 8 },
];
const places: Place[] = stops.map(s => ({ label: s.name, lat: s.lat, lon: s.lon, stopId: s.id, kind: "train" }));
const limits: Options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 0, maxBikeMinutes: 0, horizonMinutes: 120 };
function ride(n: Network, from: string, to: string, departure: number, arrival: number) {
  const a = n.stops.get(from)!, b = n.stops.get(to)!, id = `${from}-${to}-${departure}`;
  n.edges.set(id, { id, from, to, leg: { mode: "transit", from: a.name, to: b.name, fromId: from, toId: to,
    fromPoint: a, toPoint: b, departure: time(departure), arrival: time(arrival), service: id,
    serviceName: null, direction: b.name, departurePlatform: null, arrivalPlatform: null } });
}
function network() {
  const n = emptyNetwork(); stops.forEach(s => n.stops.set(s.id, s));
  ride(n, "A", "B", 5, 20); ride(n, "B", "C", 23, 40);
  ride(n, "A", "C", 4, 10); // Faster, but skips the requested stop.
  return n;
}

it("visits requested stops in order and includes their arrival in a continuous itinerary", () => {
  const result = solveWaypoints(network(), places, start, limits, "baseline");
  assert.equal(result.journeys.length, 1);
  const journey = result.journeys[0];
  assert.equal(journey.totalMinutes, 40);
  assert.deepEqual(journey.waypoints?.map(w => [w.place.stopId, w.arrival.getTime()]), [["B", time(20).getTime()]]);
  assert.equal(metrics(journey).boardings, 2);
  const steps = journeySteps(journey, places[0], places[2]);
  assert.equal(steps.filter(s => s.title === "Cycle to intermediate stop 1").length, 1);
  for (let i = 1; i < steps.length; i++) assert.equal(steps[i].departure!.getTime(), steps[i - 1].arrival!.getTime());
  assert.equal(solveWaypoints(network(), [places[0], places[2], places[1]], start, limits, "baseline").journeys.length, 0);
});

it("uses one boarding and time budget across all requested stops", () => {
  assert.equal(solveWaypoints(network(), places, start, { ...limits, maxBoardings: 1 }, "baseline").journeys.length, 0);
  assert.equal(solveWaypoints(network(), places, start, { ...limits, horizonMinutes: 39 }, "baseline").journeys.length, 0);
  assert.equal(solveWaypoints(network(), places, start, { ...limits, maxBoardings: 2, horizonMinutes: 40 }, "baseline").journeys.length, 1);
});

it("keeps a slower first stage when its lower boarding count makes the onward stage feasible", () => {
  const n = network(); n.edges.clear();
  n.stops.set("X", { id: "X", name: "Extra interchange", lat: 45.5, lon: 6.5 });
  ride(n, "A", "X", 3, 8); ride(n, "X", "B", 11, 15);
  ride(n, "A", "B", 5, 20); ride(n, "B", "C", 23, 40);
  const result = solveWaypoints(n, places, start, { ...limits, maxBoardings: 2 }, "baseline");
  assert.equal(result.journeys.length, 1);
  assert.equal(result.journeys[0].waypoints![0].arrival.getTime(), time(20).getTime());
});

it("counts cycling out to a waypoint and back within the same total budget", () => {
  const n = network(); n.edges.delete("B-C-23"); ride(n, "B", "C", 40, 60);
  const via = { label: "Lakeside stop", lat: stops[1].lat, lon: stops[1].lon + .02 };
  const minutes = cyclingMinutes(haversineKm(stops[1], via));
  const options = { ...limits, maxAccessMinutes: minutes, maxEgressMinutes: minutes, maxBikeMinutes: minutes * 2 };
  const journey = solveWaypoints(n, [places[0], via, places[2]], start, options, "baseline").journeys[0];
  assert.ok(journey);
  assert.equal(journey.waypoints![0].arrival.getTime(), time(20 + minutes).getTime());
  assert.equal(metrics(journey).bike, minutes * 2);
  assert.equal(metrics(journey).middle, minutes * 2);
  assert.equal(solveWaypoints(n, [places[0], via, places[2]], start, { ...options, maxBikeMinutes: minutes * 2 - 1 }, "baseline").journeys.length, 0);
});

it("does not catch an onward train before reaching the waypoint and boarding again", () => {
  const n = network(); n.edges.delete("B-C-23"); ride(n, "B", "C", 23 - 1 / 60, 40);
  assert.equal(solveWaypoints(n, places, start, limits, "baseline").journeys.length, 0);
  ride(n, "B", "C", 23, 45);
  assert.equal(solveWaypoints(n, places, start, limits, "baseline").journeys[0].totalMinutes, 45);
});

it("allows a cycling-only final stage without discarding the mixed journey", () => {
  const finish = { label: "Near intermediate stop", lat: stops[1].lat, lon: stops[1].lon + .01 };
  const minutes = cyclingMinutes(haversineKm(places[1], finish));
  const options = { ...limits, maxAccessMinutes: minutes, maxEgressMinutes: minutes, maxBikeMinutes: minutes };
  const result = solveWaypoints(network(), [places[0], places[1], finish], start, options, "baseline");
  assert.equal(result.journeys[0].totalMinutes, 20 + minutes);
  assert.equal(metrics(result.journeys[0]).activeEnd, minutes);
  const reference = cyclingOnly(places[0], finish, start, [places[1]]);
  assert.equal(reference.minutes, cyclingMinutes(haversineKm(places[0], places[1])) + minutes);
  assert.equal(reference.arrival.getTime(), time(reference.minutes).getTime());
});

it("visits multiple stops in order even when the same place is requested again", () => {
  const n = network(); ride(n, "B", "A", 23, 35); ride(n, "A", "C", 38, 50);
  const result = solveWaypoints(n, [places[0], places[1], places[0], places[2]], start, limits, "baseline");
  assert.ok(result.journeys.length);
  assert.deepEqual(result.journeys[0].waypoints?.map(w => w.place.stopId), ["B", "A"]);
  assert.equal(result.journeys[0].totalMinutes, 50);
});

it("allows one automatic cycling transfer across the whole ordered journey, not one per stage", () => {
  const n = network(); n.edges.clear();
  const extra = [
    { id: "X", name: "First exit", lat: 45.5, lon: 6.5 },
    { id: "XN", name: "First nearby boarding", lat: 45.5, lon: 6.51 },
    { id: "Y", name: "Second exit", lat: 46.5, lon: 7.5 },
    { id: "YN", name: "Second nearby boarding", lat: 46.5, lon: 7.51 },
  ];
  extra.forEach(s => n.stops.set(s.id, s));
  ride(n, "A", "X", 3, 10); ride(n, "XN", "B", 20, 30);
  ride(n, "B", "Y", 35, 45); ride(n, "YN", "C", 55, 65); ride(n, "B", "C", 35, 90);
  const options = { ...limits, maxBikeMinutes: 20, maxIntermediateMinutes: 10 };
  assert.equal(solveWaypoints(n, places, start, options, "baseline").journeys.length, 0);
  const result = solveWaypoints(n, places, start, options, "extended");
  assert.equal(Math.min(...result.journeys.map(j => j.totalMinutes)), 90);
  assert.ok(result.journeys.every(j => j.transitLegs.filter(l => l.service === "Cycle between stops").length === 1));
});

it("samples the onward timetable from the reached waypoint time using one request budget", async () => {
  const urls: URL[] = [];
  const station = (i: number) => ({ id: stops[i].id, name: stops[i].name, coordinate: { x: stops[i].lat, y: stops[i].lon } });
  const result = await plan(places[0], places[2], "baseline", limits, new AbortController().signal, () => {}, () => {}, { cyclingClient: null,
    waypoints: [places[1]], start, gapMs: 0, fetcher: async input => {
      const url = new URL(String(input)); urls.push(url);
      const first = url.searchParams.get("from") === "A", i = first ? 0 : 1;
      return new Response(JSON.stringify({ connections: [{ sections: [{ journey: { name: `Stage ${i + 1}`, category: "IC", number: String(i + 1) },
        departure: { station: station(i), departure: time(first ? 5 : 23).toISOString() },
        arrival: { station: station(i + 1), arrival: time(first ? 20 : 40).toISOString() } }] }] }));
    },
  });
  assert.deepEqual(urls.map(u => [u.searchParams.get("from"), u.searchParams.get("to"), u.searchParams.get("time")]),
    [["A", "B", "08:03"], ["B", "C", "08:23"]]);
  assert.equal(result.client.requests, 2);
  assert.equal(result.baseline.journeys[0].totalMinutes, 40);
  await assert.rejects(plan(places[0], places[2], "baseline", limits, new AbortController().signal, () => {}, () => {}, { cyclingClient: null,
    waypoints: Array(5).fill(places[1]),
  }), /four|4/i);
});
