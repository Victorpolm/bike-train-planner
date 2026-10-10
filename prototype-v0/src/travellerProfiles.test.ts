import assert from "node:assert/strict";
import { it } from "node:test";
import { changeTravellerLibrary, emptyLibrary, guestSettings, parseTravellerLibrary, personalSettings, persistTravellers, samePersonalSettings, validPersonalSettings } from "./travellerProfiles.ts";
import { TRIP_PRESETS } from "./tripPresets.ts";
import { preferenceOptions } from "./preferences.ts";
import { DEFAULT_OPTIONS, emptyNetwork, solve } from "./model.ts";
import { cyclingKey, parseCyclingRoute } from "./cycling.ts";

it("starts guests relaxed and preserves existing full/Half Fare/GA device preferences", () => {
  assert.deepEqual(guestSettings(), { fare: { passenger: "full", annualBikePass: false }, age: null, ridingPreset: "relaxed", pace: { flatSpeedKmh: 20, electricAssist: false } });
  for (const passenger of ["full", "half-fare", "ga"] as const)
    assert.deepEqual(guestSettings({ passenger, annualBikePass: true }).fare, { passenger, annualBikePass: true });
});
it("roundtrips several named profiles and the selected traveller without sharing mutable trip fields", () => {
  const profile = { ...guestSettings(), id: "one", name: "Touring" };
  const library = { ...emptyLibrary(), profiles: [profile, { ...profile, id: "two", name: "Commuting", age: 42 }], activeId: "two" };
  let stored = "";
  persistTravellers(library, { setItem(_key, value) { stored = value; } });
  assert.deepEqual(parseTravellerLibrary(stored), library);
  const trip = personalSettings(profile);
  trip.fare.passenger = "ga"; trip.pace.flatSpeedKmh = 30;
  assert.equal(profile.fare.passenger, "full"); assert.equal(profile.pace.flatSpeedKmh, 20);
  assert.equal(samePersonalSettings(profile, trip), false);
});
it("keeps age as metadata and never infers a fare product", () => {
  const child = { ...guestSettings(), id: "young", name: "Younger rider", age: 12 };
  const restored = parseTravellerLibrary(JSON.stringify({ ...emptyLibrary(), profiles: [child] })).profiles[0];
  assert.equal(restored.age, 12); assert.equal(restored.fare.passenger, "full");
});
it("returns Guest for an absent selection and normalizes an inconsistent riding preset", () => {
  const library = parseTravellerLibrary(JSON.stringify({ version: 1, activeId: "missing", profiles: [{ ...guestSettings(), id: "one", name: "Custom", pace: { flatSpeedKmh: 23, electricAssist: true } }] }));
  assert.equal(library.activeId, null); assert.equal(library.profiles[0].ridingPreset, "custom");
});
it("does not silently accept corrupt, duplicate, unsupported or out-of-range saved profiles", () => {
  const profile = { ...guestSettings(), id: "one", name: "Bike" };
  for (const p of [{ ...profile, age: -1 }, { ...profile, age: 12.5 }, { ...profile, pace: { flatSpeedKmh: 90, electricAssist: false } }, { ...profile, fare: { passenger: "youth", annualBikePass: false } }])
    assert.throws(() => parseTravellerLibrary(JSON.stringify({ version: 1, profiles: [p] })));
  assert.throws(() => parseTravellerLibrary("invalid"));
  assert.throws(() => parseTravellerLibrary(JSON.stringify({ version: 2, profiles: [] })));
  assert.throws(() => parseTravellerLibrary(JSON.stringify({ version: 1, profiles: [profile, profile] })));
  assert.deepEqual(parseTravellerLibrary(null), emptyLibrary());
});
it("reports storage failures instead of pretending a profile was saved", () => {
  assert.throws(() => persistTravellers(emptyLibrary(), { setItem() { throw new Error("Quota exceeded"); } }), /Quota/);
});
it("keeps the shared profile list and persisted selection together through create, rename and delete", () => {
  const profile = { ...guestSettings(), id: "one", name: "Weekend" };
  let stored = "";
  const storage = { setItem(_key: string, value: string) { stored = value; } };
  const created = changeTravellerLibrary(emptyLibrary(), { ...emptyLibrary(), profiles: [profile], activeId: profile.id }, "save", storage);
  assert.equal(created.accepted, true);
  assert.deepEqual(parseTravellerLibrary(stored), created.library);
  const renamed = changeTravellerLibrary(created.library, { ...created.library, profiles: [{ ...profile, name: "Touring" }] }, "save", storage);
  assert.equal(renamed.library.profiles[0].name, "Touring");
  assert.deepEqual(parseTravellerLibrary(stored), renamed.library);
  const deleted = changeTravellerLibrary(renamed.library, emptyLibrary(), "save", storage);
  assert.deepEqual(deleted.library, emptyLibrary());
  assert.deepEqual(parseTravellerLibrary(stored), deleted.library);
});
it("allows temporary selection from either control when storage is blocked without overwriting saved settings", () => {
  const profile = { ...guestSettings(), id: "one", name: "Weekend" };
  const before = { ...emptyLibrary(), profiles: [profile] };
  const selected = changeTravellerLibrary(before, { ...before, activeId: profile.id }, "select", { setItem() { throw new Error("Blocked"); } });
  assert.equal(selected.accepted, true);
  assert.equal(selected.library.activeId, profile.id);
  assert.match(selected.notice, /this visit/);
  assert.equal(before.activeId, null);
  assert.deepEqual(selected.library.profiles[0], profile);
});
it("keeps the displayed list and active profile intact when a save or deletion cannot persist", () => {
  const profile = { ...guestSettings(), id: "one", name: "Weekend" };
  const before = { ...emptyLibrary(), profiles: [profile], activeId: profile.id };
  for (const next of [emptyLibrary(), { ...before, profiles: [{ ...profile, name: "Renamed" }] }]) {
    const rejected = changeTravellerLibrary(before, next, "save", { setItem() { throw new Error("Quota exceeded"); } });
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.library, before);
    assert.match(rejected.notice, /could not save/);
  }
});
it("validates custom speed and optional age before saving", () => {
  const value = guestSettings();
  assert.equal(validPersonalSettings(value), true);
  assert.equal(validPersonalSettings({ ...value, age: NaN }), false);
  assert.equal(validPersonalSettings({ ...value, pace: { ...value.pace, flatSpeedKmh: NaN } }), false);
});
it("trip presets retain personal values and the original model options", () => {
  const person = { ...guestSettings(), fare: { passenger: "half-fare" as const, annualBikePass: true }, pace: { flatSpeedKmh: 28, electricAssist: true } };
  for (const preset of Object.values(TRIP_PRESETS)) {
    const options = preferenceOptions(preset.cycling, preset.endpoint, "include-unknown", preset.bicycleScope, person.pace, preset.routePreference);
    assert.deepEqual(options.cyclingPace, person.pace);
    assert.equal(options.horizonMinutes, DEFAULT_OPTIONS.horizonMinutes);
    assert.equal(options.maxBoardings, DEFAULT_OPTIONS.maxBoardings);
    assert.equal(options.endpointPreference, "none");
    assert.deepEqual(person.fare, { passenger: "half-fare", annualBikePass: true });
  }
  assert.equal(TRIP_PRESETS.bikepacking.bicycleScope, "confirmed");
  assert.equal(preferenceOptions("unrestricted", "none").maxBikeMinutes, DEFAULT_OPTIONS.horizonMinutes);
  assert.equal(preferenceOptions("less", "start").maxBikeMinutes, 40);
  assert.equal(preferenceOptions("less", "start").maxAccessMinutes, 40);
  assert.equal(preferenceOptions("balanced", "end").maxBikeMinutes, 90);
  assert.equal(preferenceOptions("more", "none").maxBikeMinutes, 150);
});
it("Commuter admits a routed 30-minute access ride and rejects 31 minutes in both models", () => {
  const start = new Date("2026-10-03T08:00:00+02:00"), at = (m: number) => new Date(+start + m * 60_000);
  const from = { label: "Start", lat: 46, lon: 8 }, station = { id: "A", name: "Boarding", lat: 46.13, lon: 8 };
  const to = { label: "Finish", lat: 47, lon: 9, stopId: "B" };
  const n = emptyNetwork(); n.stops.set("A", station); n.stops.set("B", { ...to, id: "B", name: "Arrival" });
  n.edges.set("train", { id: "train", from: "A", to: "B", leg: { mode: "transit", from: station.name, to: to.label, fromId: "A", toId: "B", fromPoint: station, toPoint: to, departure: at(50), arrival: at(75), service: "R", serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null } });
  const route = parseCyclingRoute({ features: [{ geometry: { type: "LineString", coordinates: [[8, 46, 400], [8, 46.13, 400]] }, properties: { "track-length": 15000, "total-time": 2700 } }] }, from, station, +start);
  const preset = TRIP_PRESETS.commuter;
  const options = preferenceOptions(preset.cycling, preset.endpoint, "include-unknown", preset.bicycleScope, guestSettings().pace, preset.routePreference);
  for (const minutes of [30, 31]) {
    n.cycling = new Map([[cyclingKey(from, station), { ...route, minutes }]]);
    for (const mode of ["baseline", "extended"] as const)
      assert.equal(solve(n, from, to, start, options, mode).journeys.length > 0, minutes === 30);
  }
});
