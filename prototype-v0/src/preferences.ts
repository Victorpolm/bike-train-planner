import { DEFAULT_HILLS, type HillPreferences } from "./hills.ts";
import { DEFAULT_CYCLING_PACE, type CyclingPace } from "./cyclingPace.ts";
import type { RoutePreference } from "./cyclingPreferences.ts";
import { DEFAULT_OPTIONS, type CyclingPosition, type EndpointPreference, type Options } from "./model.ts";
import type { BicycleScope } from "./bicyclePermission.ts";
import type { BusPreference } from "./busCarriage.ts";
import { cyclingDurationOptions, type CyclingAmount } from "./cyclingDuration.ts";
export type CyclingPreference = "less" | "commuter" | "balanced" | "more" | "unrestricted";
export function preferenceOptions(cycling: CyclingPreference, endpointPreference: EndpointPreference, busPreference: BusPreference = "include-unknown", bicycleScope?: BicycleScope, cyclingPace: CyclingPace = DEFAULT_CYCLING_PACE, cyclingRoutePreference: RoutePreference = "fastest", cyclingPosition: CyclingPosition = "anywhere", hills: HillPreferences = DEFAULT_HILLS, climbOptimization = false, takeBikeOnTransit = true, maxWalkingMinutes = 30, amount?: CyclingAmount): Options {
  const budgets = {
    commuter: { maxBikeMinutes: 30, maxAccessMinutes: 30, maxEgressMinutes: 30, maxIntermediateMinutes: 30 },
    // Share the displayed total across sections without hidden, tighter leg caps.
    less: { maxBikeMinutes: 40, maxAccessMinutes: 40, maxEgressMinutes: 40, maxIntermediateMinutes: 40 },
    balanced: { maxBikeMinutes: 90, maxAccessMinutes: 60, maxEgressMinutes: 60, maxIntermediateMinutes: 20 },
    more: { maxBikeMinutes: 150, maxAccessMinutes: 90, maxEgressMinutes: 90, maxIntermediateMinutes: 30 },
    // The overall journey window remains binding; no extra cycling cap applies.
    unrestricted: { maxBikeMinutes: DEFAULT_OPTIONS.horizonMinutes, maxAccessMinutes: DEFAULT_OPTIONS.horizonMinutes,
      maxEgressMinutes: DEFAULT_OPTIONS.horizonMinutes, maxIntermediateMinutes: DEFAULT_OPTIONS.horizonMinutes },
  };
  return { ...DEFAULT_OPTIONS, hills: { ...hills }, climbOptimization, ...budgets[cycling], ...(amount ? cyclingDurationOptions(amount) : {}), cyclingPosition, takeBikeOnTransit, maxWalkingMinutes,
    cyclingPace: { ...cyclingPace }, cyclingRoutePreference, endpointPreference, busPreference,
    ...(bicycleScope ? { bicycleScope } : {}), ...(!takeBikeOnTransit ? { bicycleScope: "all-transit" as const } : {}) };
}
