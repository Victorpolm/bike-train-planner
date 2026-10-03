import { readFareProfile, type FareProfile } from "./fares.ts";
import { CYCLING_PRESETS, type CyclingPace, type CyclingPreset } from "./cyclingPace.ts";

export type PersonalSettings = { fare: FareProfile; pace: CyclingPace; ridingPreset: CyclingPreset | "custom"; age: number | null };
export type TravellerProfile = PersonalSettings & { id: string; name: string };
export type TravellerLibrary = { version: 1; profiles: TravellerProfile[]; activeId: string | null };
const PROFILE_STORAGE_KEY = "bike-train-travellers-v1";
export const emptyLibrary = (): TravellerLibrary => ({ version: 1, profiles: [], activeId: null });
export function guestSettings(legacyFare?: unknown): PersonalSettings {
  return { fare: readFareProfile(legacyFare), pace: { flatSpeedKmh: 20, electricAssist: false }, ridingPreset: "relaxed", age: null };
}
export function validPersonalSettings(value: PersonalSettings): boolean {
  return Number.isFinite(value.pace.flatSpeedKmh) && value.pace.flatSpeedKmh >= 8 && value.pace.flatSpeedKmh <= 35 &&
    typeof value.pace.electricAssist === "boolean" &&
    (value.age === null || (Number.isInteger(value.age) && value.age >= 0 && value.age <= 120));
}
export function parseTravellerLibrary(raw: string | null): TravellerLibrary {
  if (!raw) return emptyLibrary();
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.profiles)) throw new Error("Unsupported profile data");
  const ids = new Set<string>();
  const profiles: TravellerProfile[] = [];
  for (const p of value.profiles) {
    if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id) || typeof p.name !== "string" || !p.name.trim() ||
      !p.pace || !validPersonalSettings(p) || !p.fare || !["full", "half-fare", "ga"].includes(p.fare.passenger) ||
      typeof p.fare.annualBikePass !== "boolean") throw new Error("Invalid profile data");
    const preset = p.ridingPreset in CYCLING_PRESETS ? p.ridingPreset as CyclingPreset : "custom";
    const matching = preset !== "custom" && CYCLING_PRESETS[preset].flatSpeedKmh === p.pace.flatSpeedKmh && CYCLING_PRESETS[preset].electricAssist === p.pace.electricAssist;
    profiles.push({ id: p.id, name: p.name.trim().slice(0, 60), age: p.age, fare: readFareProfile(p.fare),
      pace: { flatSpeedKmh: p.pace.flatSpeedKmh, electricAssist: p.pace.electricAssist }, ridingPreset: matching ? preset : "custom" });
    ids.add(p.id);
  }
  return { version: 1, profiles, activeId: ids.has(value.activeId) ? value.activeId : null };
}
export function personalSettings(value: PersonalSettings): PersonalSettings {
  return { age: value.age, fare: { ...value.fare }, pace: { ...value.pace }, ridingPreset: value.ridingPreset };
}
export function samePersonalSettings(a: PersonalSettings, b: PersonalSettings): boolean {
  return a.age === b.age && a.fare.passenger === b.fare.passenger && a.fare.annualBikePass === b.fare.annualBikePass &&
    a.pace.flatSpeedKmh === b.pace.flatSpeedKmh && a.pace.electricAssist === b.pace.electricAssist && a.ridingPreset === b.ridingPreset;
}
export function loadTravellers(): { library: TravellerLibrary; guest: PersonalSettings; notice: string } {
  let guest = guestSettings();
  try { guest = guestSettings(JSON.parse(localStorage.getItem("bike-train-fare-profile-v1") ?? "null")); } catch { /* Optional legacy preferences. */ }
  try { return { library: parseTravellerLibrary(localStorage.getItem(PROFILE_STORAGE_KEY)), guest, notice: "" }; }
  catch { return { library: emptyLibrary(), guest, notice: "Saved profiles could not be read. You can continue as Guest." }; }
}
export function persistTravellers(library: TravellerLibrary, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(library));
}

// Both the header manager and trip cards use this same persistence boundary.
// Selection may work for this visit; edits must not pretend to be saved.
export function changeTravellerLibrary(current: TravellerLibrary, next: TravellerLibrary, action: "save" | "select",
  storage?: Pick<Storage, "setItem">): { library: TravellerLibrary; notice: string; accepted: boolean } {
  try {
    persistTravellers(next, storage);
    return { library: next, notice: action === "save" ? "Saved on this device." : "", accepted: true };
  } catch {
    if (action === "select") return { library: next, accepted: true,
      notice: "Profile selected for this visit. Your browser could not remember the selection." };
    return { library: current, accepted: false,
      notice: "Your browser could not save this change. Your trip settings still work; allow device storage to save profiles." };
  }
}
