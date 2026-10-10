import type { Point } from "./routing.ts";

export type LocationFix = Point & { accuracy: number; timestamp: number };
export type LocationState = {
  status: "idle" | "locating" | "tracking" | "paused" | "error";
  fix: LocationFix | null;
  message: string;
};
export const idleLocation = (): LocationState => ({ status: "idle", fix: null, message: "" });
export function usableFix(fix: LocationFix | null, now: number): fix is LocationFix {
  return !!fix && Number.isFinite(fix.lat) && Math.abs(fix.lat) <= 90
    && Number.isFinite(fix.lon) && Math.abs(fix.lon) <= 180
    && Number.isFinite(fix.accuracy) && fix.accuracy > 0 && fix.accuracy <= 60
    && Number.isFinite(fix.timestamp) && now - fix.timestamp >= -1000 && now - fix.timestamp <= 20_000;
}

/** The controller owns one watch. Generation checks reject queued callbacks after
 * Stop, a hidden page, a denied permission or a subsequent navigation session. */
export class LocationWatch {
  private id: number | null = null;
  private generation = 0;
  private active = false;
  private geo: Pick<Geolocation, "watchPosition" | "clearWatch"> | undefined;
  private publish: (state: LocationState) => void;
  private now: () => number;
  constructor(geo: Pick<Geolocation, "watchPosition" | "clearWatch"> | undefined,
    publish: (state: LocationState) => void, now = Date.now) { this.geo = geo; this.publish = publish; this.now = now; }
  start() {
    this.stop(false);
    this.active = true;
    this.resume();
  }
  resume() {
    if (!this.active || this.id !== null) return;
    if (!this.geo) {
      this.active = false;
      this.publish({ status: "error", fix: null, message: "Location is unavailable here. Open the planner in your phone’s browser over HTTPS." });
      return;
    }
    const generation = ++this.generation;
    let lastTimestamp = -Infinity;
    this.publish({ status: "locating", fix: null, message: "Waiting for your phone’s location…" });
    try {
      this.id = this.geo.watchPosition(position => {
        if (!this.active || generation !== this.generation) return;
        const { latitude: lat, longitude: lon, accuracy } = position.coords;
        const fix = { lat, lon, accuracy, timestamp: position.timestamp };
        if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180
          || !Number.isFinite(accuracy) || accuracy <= 0 || !Number.isFinite(fix.timestamp)
          || fix.timestamp <= lastTimestamp || fix.timestamp > this.now() + 1000 || this.now() - fix.timestamp > 20_000) return;
        lastTimestamp = fix.timestamp;
        this.publish({ status: "tracking", fix, message: accuracy > 60 ? "Location is imprecise. Progress and connection estimates are paused." : "" });
      }, error => {
        if (!this.active || generation !== this.generation) return;
        const denied = error.code === 1;
        if (denied) this.stop(false);
        this.publish({ status: "error", fix: null, message: denied
          ? "Location permission was denied or blocked. Allow location in your browser’s site settings, then retry. If embedded, open the full planner."
          : error.code === 3 ? "Location timed out. Waiting for a fresh signal; you can retry."
            : "Your phone’s location is unavailable. Move to an open area or retry." });
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
      // Also handles an immediate permission error from an injected/browser API.
      if (generation !== this.generation && this.id !== null) { this.geo.clearWatch(this.id); this.id = null; }
    } catch {
      this.stop(false);
      this.publish({ status: "error", fix: null, message: "The browser blocked location. Open the full planner over HTTPS and check its location permission." });
    }
  }
  pause() {
    if (!this.active) return;
    this.clear();
    this.publish({ status: "paused", fix: null, message: "Following is paused while the app is hidden. Return to acquire a fresh location." });
  }
  stop(publish = true) {
    this.active = false;
    this.clear();
    if (publish) this.publish(idleLocation());
  }
  private clear() {
    ++this.generation;
    if (this.id !== null) this.geo?.clearWatch(this.id);
    this.id = null;
  }
}

export type AwakeState = "off" | "requesting" | "on" | "unavailable";
type ScreenLock = Pick<WakeLockSentinel, "release" | "addEventListener">;
/** In-flight requests must release their result if Stop/hide happened meanwhile. */
export class ScreenAwake {
  private generation = 0;
  private lock: ScreenLock | null = null;
  private request: (() => Promise<ScreenLock>) | undefined;
  private publish: (state: AwakeState) => void;
  constructor(request: (() => Promise<ScreenLock>) | undefined,
    publish: (state: AwakeState) => void) { this.request = request; this.publish = publish; }
  async enable() {
    this.disable();
    const generation = this.generation;
    if (!this.request) { this.publish("unavailable"); return; }
    this.publish("requesting");
    try {
      const lock = await this.request();
      if (generation !== this.generation) { await lock.release(); return; }
      this.lock = lock;
      lock.addEventListener("release", () => {
        if (generation === this.generation) { this.lock = null; this.publish("unavailable"); }
      });
      this.publish("on");
    } catch { if (generation === this.generation) this.publish("unavailable"); }
  }
  disable() {
    ++this.generation;
    const lock = this.lock; this.lock = null;
    if (lock) void lock.release().catch(() => {});
    this.publish("off");
  }
}
