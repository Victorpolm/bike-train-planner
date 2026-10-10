import assert from "node:assert/strict";
import { it } from "node:test";
import { currentLocation } from "./currentLocation.ts";

const now = Date.parse("2026-10-10T16:00:00Z");
const position = (changes: Partial<GeolocationCoordinates> = {}, timestamp = now) => ({
  coords: { latitude: 47.3769, longitude: 8.5417, accuracy: 12, ...changes }, timestamp,
}) as GeolocationPosition;
function device() {
  let success: PositionCallback = () => {}, error: PositionErrorCallback = () => {};
  const calls: PositionOptions[] = [];
  const geo = { getCurrentPosition: (s: PositionCallback, e?: PositionErrorCallback | null, o?: PositionOptions) => {
    success = s; error = e!; calls.push(o!);
  } };
  return { geo, calls, succeed: (p = position()) => success(p), fail: (code: number) => error({ code } as GeolocationPositionError) };
}
it("requests one position only when called, preserving exact coordinates without geocoding", async () => {
  const d = device(); assert.equal(d.calls.length, 0);
  const pending = currentLocation(d.geo, new AbortController().signal, () => now);
  assert.deepEqual(d.calls, [{ enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }]);
  d.succeed(); const result = await pending;
  assert.deepEqual(result.place, { lat: 47.3769, lon: 8.5417, label: "Your location", detail: "Location accuracy ±12 m" });
  assert.equal(result.accuracy, 12); assert.equal(d.calls.length, 1);
});
it("does not request permission after cancellation and ignores callbacks from a cancelled request", async () => {
  const d = device(), abort = new AbortController(); abort.abort();
  await assert.rejects(currentLocation(d.geo, abort.signal, () => now), { name: "AbortError" });
  assert.equal(d.calls.length, 0);
  const live = new AbortController(), pending = currentLocation(d.geo, live.signal, () => now);
  const rejected = assert.rejects(pending, { name: "AbortError" }); live.abort(); d.succeed(); await rejected;
});
it("allows a fresh request after an old one was cancelled without using its stale callback", async () => {
  const first = device(), next = device(), abort = new AbortController();
  const cancelled = currentLocation(first.geo, abort.signal, () => now), rejection = assert.rejects(cancelled);
  abort.abort(); await rejection;
  const accepted = currentLocation(next.geo, new AbortController().signal, () => now);
  first.succeed(position({ latitude: 46 })); next.succeed(position({ latitude: 47.5 }));
  assert.equal((await accepted).place.lat, 47.5);
});
for (const [code, message] of [[1, /permission was denied/], [2, /location is unavailable/], [3, /timed out/]] as const) {
  it(`reports location error ${code} with an actionable fallback`, async () => {
    const d = device(), pending = currentLocation(d.geo, new AbortController().signal, () => now);
    d.fail(code); await assert.rejects(pending, message);
  });
}
it("rejects absent or browser-blocked geolocation without changing an origin", async () => {
  await assert.rejects(currentLocation(undefined, new AbortController().signal), /Location is unavailable/);
  await assert.rejects(currentLocation({ getCurrentPosition() { throw new Error("blocked"); } }, new AbortController().signal), /browser blocked/);
});
it("rejects inaccurate, stale, future and invalid coordinate fixes", async () => {
  for (const p of [position({ accuracy: 61 }), position({ accuracy: NaN }), position({ latitude: 91 }),
    position({ longitude: -181 }), position({ latitude: NaN }), position({}, now - 20001), position({}, now + 1001)]) {
    const d = device(), pending = currentLocation(d.geo, new AbortController().signal, () => now);
    d.succeed(p); await assert.rejects(pending, /old or too imprecise/);
  }
});
it("bounds a silent browser request and ignores a late success", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const d = device(), pending = currentLocation(d.geo, new AbortController().signal, () => now);
  const rejected = assert.rejects(pending, /timed out/);
  t.mock.timers.tick(16000); await rejected; d.succeed();
});
it("clears its timeout on success and accepts only the first callback", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const d = device(), pending = currentLocation(d.geo, new AbortController().signal, () => now);
  d.succeed(); d.succeed(position({ latitude: 46 })); d.fail(1);
  assert.equal((await pending).place.lat, 47.3769); t.mock.timers.tick(20000);
});
