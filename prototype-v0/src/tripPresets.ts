import type { BicycleScope } from "./bicyclePermission.ts";
import type { RoutePreference } from "./cyclingPreferences.ts";
import type { CyclingPreference } from "./preferences.ts";
import type { EndpointPreference } from "./model.ts";
import type { JourneyObjective } from "./journeyObjectives.ts";
export type TripPreset = "commuter" | "bikepacking" | "personalized";
export const TRIP_PRESETS: Record<Exclude<TripPreset, "personalized">, {
  bicycleScope: BicycleScope; routePreference: RoutePreference; cycling: CyclingPreference; endpoint: EndpointPreference;
  objectives: readonly JourneyObjective[];
}> = {
  commuter: { bicycleScope: "allow-uncertain", routePreference: "simplest", cycling: "commuter", endpoint: "none", objectives: ["fastest", "fewer-boardings", "least-cycling"] },
  bikepacking: { bicycleScope: "confirmed", routePreference: "lower-stress", cycling: "unrestricted", endpoint: "none", objectives: ["fastest", "fewer-boardings", "less-traffic"] },
};
