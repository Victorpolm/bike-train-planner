import type { BicycleScope } from "./bicyclePermission.ts";
import type { RoutePreference } from "./cyclingPreferences.ts";
import type { CyclingPreference } from "./preferences.ts";
import type { EndpointPreference } from "./model.ts";
export type TripPreset = "commuter" | "bikepacking" | "personalized";
export const TRIP_PRESETS: Record<Exclude<TripPreset, "personalized">, {
  bicycleScope: BicycleScope; routePreference: RoutePreference; cycling: CyclingPreference; endpoint: EndpointPreference;
}> = {
  commuter: { bicycleScope: "allow-uncertain", routePreference: "simplest", cycling: "commuter", endpoint: "none" },
  bikepacking: { bicycleScope: "confirmed", routePreference: "lower-stress", cycling: "unrestricted", endpoint: "none" },
};
