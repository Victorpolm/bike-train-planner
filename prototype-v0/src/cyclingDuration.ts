import type { CyclingPreference } from "./preferences.ts";

export type CyclingAmount = { mode: "at-most" | "at-least" | "none"; minutes: number };
export const CYCLING_TIME_PRESETS = [40, 45, 90, 150] as const;
export function cyclingAmountForPreset(preset: CyclingPreference): CyclingAmount {
  return { mode: preset === "unrestricted" ? "none" : "at-most",
    minutes: ({ less: 40, commuter: 45, balanced: 90, more: 150, unrestricted: 150 })[preset] };
}
export function cyclingDurationOptions(amount: CyclingAmount, horizonMinutes = 1440) {
  // Keep transient empty number inputs renderable; validateOptions rejects
  // invalid durations before any search starts.
  const maximum = amount.mode === "at-most" ? amount.minutes : horizonMinutes;
  return { minBikeMinutes: amount.mode === "at-least" ? amount.minutes : 0,
    maxBikeMinutes: maximum, maxAccessMinutes: maximum, maxEgressMinutes: maximum, maxIntermediateMinutes: maximum };
}
export function cyclingDurationFits(minutes: number, limits: { minBikeMinutes?: number; maxBikeMinutes: number }) {
  return Number.isFinite(minutes) && minutes + 1e-9 >= (limits.minBikeMinutes ?? 0) && minutes <= limits.maxBikeMinutes + 1e-9;
}
/** Until a minimum is reached, less cycling must not dominate useful progress. */
export function cyclingMinimumResource(minutes: number, limits: { minBikeMinutes?: number }) {
  return (limits.minBikeMinutes ?? 0) > 0 ? [-Math.min(minutes, limits.minBikeMinutes!)] : [];
}
