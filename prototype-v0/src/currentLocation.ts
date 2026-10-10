import { usableFix, type LocationFix } from "./locationTracking.ts";
import type { Place } from "./routing.ts";

/** One user-requested reading. No watch, reverse geocoding or stored GPS history. */
export function currentLocation(geo: Pick<Geolocation, "getCurrentPosition"> | undefined,
  signal: AbortSignal, now = Date.now): Promise<{ place: Place; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    if (!geo) { reject(new Error("Location is unavailable here. Open the full planner over HTTPS, or choose your start on the map.")); return; }
    let finished = false;
    const finish = (error?: unknown, fix?: LocationFix) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal.removeEventListener("abort", cancelled);
      if (fix) resolve({ place: { lat: fix.lat, lon: fix.lon, label: "Your location",
        detail: `Location accuracy ±${Math.ceil(fix.accuracy)} m` }, accuracy: fix.accuracy });
      else reject(error);
    };
    const cancelled = () => finish(signal.reason ?? new DOMException("Location cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error("Location timed out. Try again or choose your start on the map.")), 16000);
    signal.addEventListener("abort", cancelled, { once: true });
    try {
      geo.getCurrentPosition(position => {
        const fix = { lat: position.coords.latitude, lon: position.coords.longitude,
          accuracy: position.coords.accuracy, timestamp: position.timestamp };
        if (!usableFix(fix, now())) {
          finish(new Error("The location reading is old or too imprecise. Try again outside or choose your start on the map.")); return;
        }
        finish(undefined, fix);
      }, error => finish(new Error(error.code === 1
        ? "Location permission was denied or blocked. Allow location in your browser’s site settings, then retry, or choose your start on the map."
        : error.code === 3 ? "Location timed out. Try again or choose your start on the map."
          : "Your location is unavailable. Try again or choose your start on the map.")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    } catch { finish(new Error("The browser blocked location. Open the full planner over HTTPS and check its location permission.")); }
  });
}
