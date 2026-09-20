import { DEFAULT_OPTIONS, type EndpointPreference, type Options } from "./model.ts";
import type { BusPreference } from "./busCarriage.ts";
export type CyclingPreference = "less" | "balanced" | "more" | "unrestricted";
export function preferenceOptions(cycling: CyclingPreference, endpointPreference: EndpointPreference, busPreference: BusPreference = "known-rules"): Options {
  const budgets = {
    less: { maxBikeMinutes: 40, maxAccessMinutes: 20, maxEgressMinutes: 20, maxIntermediateMinutes: 10 },
    balanced: { maxBikeMinutes: 90, maxAccessMinutes: 60, maxEgressMinutes: 60, maxIntermediateMinutes: 20 },
    more: { maxBikeMinutes: 150, maxAccessMinutes: 90, maxEgressMinutes: 90, maxIntermediateMinutes: 30 },
    // The overall journey window remains binding; no extra cycling cap applies.
    unrestricted: { maxBikeMinutes: DEFAULT_OPTIONS.horizonMinutes, maxAccessMinutes: DEFAULT_OPTIONS.horizonMinutes,
      maxEgressMinutes: DEFAULT_OPTIONS.horizonMinutes, maxIntermediateMinutes: DEFAULT_OPTIONS.horizonMinutes },
  };
  return { ...DEFAULT_OPTIONS, ...budgets[cycling], endpointPreference, busPreference };
}
