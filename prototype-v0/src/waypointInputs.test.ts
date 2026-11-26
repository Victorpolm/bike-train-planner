import assert from "node:assert/strict";
import { it } from "node:test";
import { bicyclePossessionAtStages } from "./bicycleAvailability.ts";
import { DEFAULT_OPTIONS } from "./model.ts";
import { preferenceOptions } from "./preferences.ts";
import type { Place } from "./routing.ts";
import {
  bicycleAtDestination,
  resolveWaypointInputs,
  restoreWaypointInputs,
  reverseWaypointInputs,
  waypointPlace,
  type WaypointInput,
} from "./waypointInputs.ts";

const origin: Place = { label: "Home", lat: 47, lon: 8 };
const stop: Place = { label: "Bike parking", lat: 47.1, lon: 8.1 };
const destination: Place = { label: "Work", lat: 47.2, lon: 8.2 };
const input = (id: string, bicycleAction?: "park" | "collect", place = stop): WaypointInput =>
  ({ id, bicycleAction, value: { text: place.label, place } });

it("keeps bicycle status unchanged when intermediate stops have no action", async () => {
  const inputs: WaypointInput[] = [{ id: "typed", value: { text: "  Station  " } }, input("chosen")];
  for (const atOrigin of [false, true]) assert.equal(bicycleAtDestination(inputs, atOrigin), atOrigin);
  const requested = await resolveWaypointInputs(inputs, async () => { throw new Error("Ordinary text is resolved by the planner"); });
  assert.deepEqual(requested, ["Station", stop]);
});

it("preserves a stop action through text edits, selected places and map moves", async () => {
  const existing = input("bike", "collect");
  const edited: WaypointInput = { ...existing, value: { text: "New parking" } };
  const moved: Place = { label: "Dragged point", lat: 47.3, lon: 8.3 };
  const calls: string[] = [];
  const [resolved] = await resolveWaypointInputs([edited], async text => { calls.push(text); return moved; });
  assert.deepEqual(calls, ["New parking"]);
  assert.deepEqual(resolved, { ...moved, bicycleAction: "collect" });
  assert.equal(waypointPlace({ ...existing, value: { text: moved.label, place: moved } }, moved).bicycleAction, "collect");
  assert.deepEqual(existing, input("bike", "collect"), "Editing does not modify the saved location");
});

it("clearing an action removes stale fields from a restored or map-backed place", async () => {
  const place: Place = { ...stop, bicycleAction: "collect" };
  const cleared = { id: "bike", value: { text: place.label, place } };
  assert.deepEqual(await resolveWaypointInputs([cleared], async () => stop), [stop]);
  await assert.rejects(resolveWaypointInputs([{ id: "empty", value: { text: " " }, bicycleAction: "park" }], async () => stop), /Choose a location/);
});

it("restores explicit actions separately from location values without changing saved snapshots", () => {
  const points: Place[] = [{ ...stop, bicycleAction: "park" }, destination];
  const before = structuredClone(points);
  let serial = 0;
  const restored = restoreWaypointInputs(points, DEFAULT_OPTIONS, () => `via-${++serial}`);
  assert.deepEqual(restored.map(p => p.bicycleAction), ["park", undefined]);
  assert.equal(restored[0].value.place!.bicycleAction, undefined);
  assert.deepEqual(restored.map(p => waypointPlace(p, p.value.place!)), points);
  assert.deepEqual(points, before);
});

it("does not invent pickup stops from starting status, riding placement or carriage preferences", () => {
  for (const bicycleAtOrigin of [false, true]) for (const takeBikeOnTransit of [false, true]) {
    const options = { ...DEFAULT_OPTIONS, bicycleAtOrigin, takeBikeOnTransit, cyclingPosition: "end-only" as const };
    assert.deepEqual(restoreWaypointInputs([], options, () => "unused"), []);
    assert.equal(restoreWaypointInputs([stop], options, () => "ordinary")[0].bicycleAction, undefined);
  }
});

it("preserves every requested stop and action during restoration", () => {
  const points: Place[] = [origin, { ...stop, bicycleAction: "park" }, destination, { ...stop, bicycleAction: "collect" }];
  const restored = restoreWaypointInputs(points, DEFAULT_OPTIONS, () => "restored");
  assert.equal(restored.length, 4);
  assert.deepEqual(restored.map(p => p.bicycleAction), [undefined, "park", undefined, "collect"]);
  assert.deepEqual(restored.map(p => waypointPlace(p, p.value.place!)), points);
});

it("reverses pickup and leave actions at their original locations and starts with final possession", () => {
  for (const [atOrigin, action] of [[true, "park"], [false, "collect"]] as const) {
    const outward = [input("first"), input("bike", action), input("last", undefined, destination)];
    const reverse = reverseWaypointInputs(outward, atOrigin);
    assert.equal(reverse.bicycleAtOrigin, !atOrigin);
    assert.deepEqual(reverse.vias.map(p => p.id), ["last", "bike", "first"]);
    assert.equal(reverse.vias[1].bicycleAction, action === "park" ? "collect" : "park");
    assert.deepEqual(reverse.vias[1].value, outward[1].value);
    const back = reverseWaypointInputs(reverse.vias, reverse.bicycleAtOrigin);
    assert.deepEqual(back, { bicycleAtOrigin: atOrigin, vias: outward });
    const full = [destination, ...reverse.vias.map(p => waypointPlace(p, p.value.place!)), origin];
    assert.equal(bicyclePossessionAtStages(full, { ...DEFAULT_OPTIONS, bicycleAtOrigin: reverse.bicycleAtOrigin }).at(-1), atOrigin);
  }
});

it("rejects contradictory action sequences before a search or reversal", () => {
  const scenarios = [
    { atOrigin: true, stops: [input("pickup", "collect")], message: /already have a bike.*stop 1/ },
    { atOrigin: false, stops: [input("leave", "park")], message: /no bike to leave.*stop 1/ },
    { atOrigin: true, stops: [input("leave", "park"), input("leave-again", "park")], message: /no bike to leave.*stop 2/ },
  ];
  for (const scenario of scenarios) {
    const before = structuredClone(scenario.stops);
    assert.throws(() => bicycleAtDestination(scenario.stops, scenario.atOrigin), scenario.message);
    assert.throws(() => reverseWaypointInputs(scenario.stops, scenario.atOrigin), scenario.message);
    assert.deepEqual(scenario.stops, before);
  }
  assert.equal(bicycleAtDestination([input("leave", "park"), input("pickup", "collect"), input("leave-again", "park")], true), false);
});

it("turning carriage off preserves the user's bicycle acceptance scope for later use", () => {
  const options = preferenceOptions("commuter", "none", "include-unknown", "confirmed", undefined, undefined,
    "end-only", undefined, undefined, false);
  assert.equal(options.takeBikeOnTransit, false);
  assert.equal(options.bicycleScope, "confirmed");
  assert.equal(options.bicycleAtOrigin, true, "The default starting bicycle remains with the traveller independently of carriage and placement");
  assert.equal(options.maxBikeMinutes, 30);
});
