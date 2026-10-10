import { navigationTrip, type NavigationInput } from "./navigation.ts";
import { validateOptions, type Options } from "./model.ts";
import { validateRequiredStops } from "./requiredVisits.ts";
import type { BikeParking } from "./bikeParking.ts";
import type { Place, Point, TransitLeg } from "./routing.ts";

export const JOURNEY_STORAGE_KEY = "reroute-journeys-v1";
export const MAX_SAVED_JOURNEYS = 12;
const MAX_CHARS = 2_000_000;
export type SavedJourney = { id: string; name: string; savedAt: Date; trip: NavigationInput; stage: number };
export type ParkedBicycle = { place: Place; parkedAt: Date; collectionAt?: Date; facility?: BikeParking; returnTo?: Place; cyclingOptions?: Options };
export type JourneyLibrary = { version: 1; journeys: SavedJourney[]; parked: ParkedBicycle | null };
export const emptyJourneyLibrary = (): JourneyLibrary => ({ version: 1, journeys: [], parked: null });
const date = (v: unknown): v is Date => v instanceof Date && Number.isFinite(+v);
const point = (p: unknown): p is Point => !!p && typeof p === "object" && Number.isFinite((p as Point).lat) && Math.abs((p as Point).lat) <= 90
  && Number.isFinite((p as Point).lon) && Math.abs((p as Point).lon) <= 180;
const place = (p: unknown): p is Place => point(p) && typeof (p as Place).label === "string" && !!(p as Place).label.trim();
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
function route(r: any) {
  if (!r || !point(r.from) || !point(r.to) || !number(r.minutes) || !number(r.distanceKm) || !Array.isArray(r.points) || !r.points.every(point))
    throw new Error("Invalid saved path");
}
export function validateSavedTrip(trip: NavigationInput) {
  if (!trip || !place(trip.origin) || !place(trip.destination) || !date(trip.start) || !["baseline", "extended"].includes(trip.mode)
    || !Array.isArray(trip.waypoints) || !trip.waypoints.every(place) || (!!trip.journey === !!trip.cycling)) throw new Error("Invalid saved journey");
  validateOptions(trip.options); validateRequiredStops(trip.waypoints);
  const checkLeg = (leg: TransitLeg) => {
    if (!leg || !["bike", "walk", "stop", "transit", "unknown"].includes(leg.mode) || typeof leg.service !== "string"
      || leg.departure !== null && !date(leg.departure) || leg.arrival !== null && !date(leg.arrival)
      || leg.departure && leg.arrival && +leg.arrival < +leg.departure) throw new Error("Invalid saved section");
    if (leg.cyclingRoute) route(leg.cyclingRoute); if (leg.walkingRoute) route(leg.walkingRoute);
    if (leg.geometry && (!Array.isArray(leg.geometry) || !leg.geometry.every(point))) throw new Error("Invalid saved geometry");
    if (leg.facilityVisit) validateRequiredStops([{ ...leg.facilityVisit, label: leg.facilityVisit.name, visit: leg.facilityVisit }]);
  };
  const j = trip.journey;
  if (j) {
    if (typeof j.id !== "string" || ![j.startTime, j.departure, j.arrival].every(date) || !Array.isArray(j.transitLegs)
      || ![j.totalMinutes, j.trainMinutes, j.waitMinutes, j.changes].every(number) || !Array.isArray(j.services) || !j.services.every(s => typeof s === "string")) throw new Error("Invalid saved timetable");
    for (const s of [j.originStation, j.destinationStation]) {
      if (!point(s) || typeof s.id !== "string" || typeof s.name !== "string" || !number(s.bikeMinutes) || !number(s.distanceKm)) throw new Error("Invalid saved station");
      if (s.cyclingRoute) route(s.cyclingRoute); if (s.walkingRoute) route(s.walkingRoute);
    }
    j.transitLegs.forEach(checkLeg);
    if (j.waypoints && (!Array.isArray(j.waypoints) || !j.waypoints.every(v => place(v.place) && date(v.arrival)))) throw new Error("Invalid saved stops");
  }
  if (trip.cycling) {
    const c = trip.cycling;
    if (!date(c.arrival) || c.departure !== undefined && !date(c.departure) || !number(c.minutes) || !number(c.distanceKm)
      || !Array.isArray(c.routes) || !c.routes.length) throw new Error("Invalid saved cycling journey");
    c.routes.forEach(route);
    for (const s of c.stops ?? []) {
      if (!Number.isInteger(s.afterRoute) || s.afterRoute < 0 || s.afterRoute >= c.routes.length) throw new Error("Invalid saved visit position");
      validateRequiredStops([{ ...s.visit, label: s.visit.name, visit: s.visit }]);
    }
  }
  if (!navigationTrip(trip).stages.length) throw new Error("This journey has no sections to save.");
}
export function encodeJourneyLibrary(library: JourneyLibrary) {
  const raw = JSON.stringify(library, function(key, value) {
    const original = key === "" ? library : this[key];
    if (original instanceof Date) {
      if (!date(original)) throw new Error("Invalid saved date");
      return { $date: original.toISOString() };
    }
    return value;
  });
  if (raw.length > MAX_CHARS) throw new Error("Saved journeys are full. Remove a journey or save a shorter route before trying again.");
  return raw;
}
export function parseJourneyLibrary(raw: string | null): JourneyLibrary {
  if (!raw) return emptyJourneyLibrary();
  if (raw.length > MAX_CHARS) throw new Error("Saved journeys exceed the supported size.");
  const value = JSON.parse(raw, (key, value) => {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Invalid saved property");
    if (value && typeof value === "object" && "$date" in value) {
      if (Object.keys(value).length !== 1 || typeof value.$date !== "string" || !date(new Date(value.$date))) throw new Error("Invalid saved date");
      return new Date(value.$date);
    }
    return value;
  }) as JourneyLibrary;
  if (value?.version !== 1 || !Array.isArray(value.journeys) || value.journeys.length > MAX_SAVED_JOURNEYS) throw new Error("Unsupported saved journeys");
  const ids = new Set<string>();
  for (const saved of value.journeys) {
    if (!saved || typeof saved.id !== "string" || !saved.id || ids.has(saved.id) || typeof saved.name !== "string" || !saved.name.trim() || saved.name.length > 100
      || !date(saved.savedAt) || !Number.isInteger(saved.stage) || saved.stage < 0) throw new Error("Invalid saved journey entry");
    validateSavedTrip(saved.trip); if (saved.stage >= navigationTrip(saved.trip).stages.length) throw new Error("Invalid saved stage");
    ids.add(saved.id);
  }
  if (value.parked !== null) {
    const p = value.parked;
    if (!p || !place(p.place) || !date(p.parkedAt) || p.collectionAt !== undefined && !date(p.collectionAt)
      || p.returnTo !== undefined && !place(p.returnTo)) throw new Error("Invalid parked bicycle");
    if (p.cyclingOptions) validateOptions(p.cyclingOptions);
    if (p.facility && (!point(p.facility) || typeof p.facility.id !== "string" || typeof p.facility.name !== "string"
      || !Array.isArray(p.facility.traits) || !p.facility.traits.every(t => typeof t === "string")
      || p.facility.tags && (typeof p.facility.tags !== "object" || !Object.values(p.facility.tags).every(v => typeof v === "string"))
      || p.facility.openingHours !== undefined && typeof p.facility.openingHours !== "string")) throw new Error("Invalid parking record");
  }
  return value;
}
export function loadJourneyLibrary(storage?: Pick<Storage, "getItem">) {
  try { return { library: parseJourneyLibrary((storage ?? localStorage).getItem(JOURNEY_STORAGE_KEY)), notice: "" }; }
  catch { return { library: emptyJourneyLibrary(), notice: "Saved journeys could not be read. Existing stored data has not been removed." }; }
}
export function writeJourneyLibrary(current: JourneyLibrary, next: JourneyLibrary, storage?: Pick<Storage, "setItem">) {
  try {
    const raw = encodeJourneyLibrary(next); parseJourneyLibrary(raw); (storage ?? localStorage).setItem(JOURNEY_STORAGE_KEY, raw);
    return { library: next, saved: true, notice: "Saved on this device." };
  } catch (error) {
    return { library: current, saved: false, notice: error instanceof Error && error.message.startsWith("Saved journeys are full") ? error.message
      : "Your browser could not save this change. Allow device storage or remove a saved journey and try again." };
  }
}
export function saveJourney(library: JourneyLibrary, trip: NavigationInput, stage: number, name: string, id: string, now = new Date()): JourneyLibrary {
  if (library.journeys.length >= MAX_SAVED_JOURNEYS) throw new Error(`You can keep ${MAX_SAVED_JOURNEYS} journeys. Remove one to make room.`);
  validateSavedTrip(trip);
  const { journey, cycling, origin, destination, waypoints, options, mode, start } = trip;
  const snapshot: NavigationInput = { key: `saved:${id}`, journey, cycling, origin, destination, waypoints, options, mode, start };
  const entry: SavedJourney = { id, name: name.trim().slice(0, 100) || `${trip.origin.label} → ${trip.destination.label}`.slice(0, 100),
    savedAt: now, trip: snapshot, stage };
  // Round-trip now: the snapshot must not change with future realtime/route edits.
  return parseJourneyLibrary(encodeJourneyLibrary({ ...library, journeys: [entry, ...library.journeys] }));
}
