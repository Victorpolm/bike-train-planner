import { withTripInfoRule } from "./bicycleCarriage.ts";
import type { OjpDetails } from "./ojp.ts";
import type { TransitLeg } from "./routing.ts";

/** The TripInfo parser has already matched the exact dated boarded segment.
 * Apply its requirements as well as its times; a replacement can change both. */
export function applyRealtimeService(leg: TransitLeg, details: OjpDetails): TransitLeg {
  if (!leg.ojp || !leg.departure || !leg.fromId || !leg.toId) return leg;
  const initial = leg.bicycleEvidence ?? {
    permission: "unknown" as const, fromId: leg.fromId, toId: leg.toId,
    departure: leg.departure.toISOString(), service: leg.service, operator: leg.operator ?? null,
    conditions: [], source: { title: "OJP dated service", url: "https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/", checked: details.checked },
  };
  return { ...leg, realtime: details.realtime ?? leg.realtime,
    bicycleEvidence: withTripInfoRule(initial, details.rule, details.checked),
    bicycleAttributes: details.rule.attributes };
}
