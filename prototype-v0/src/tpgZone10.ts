import { TPG_ZONE_10_LINES } from "./data/tpgZone10.ts";
import { operatorCode, normalizeCode } from "./normalization.ts";
import { swissStopId, replacementService } from "./transitScope.ts";
import { swissDateTimeInput } from "./departure.ts";
import type { TransitLeg } from "./routing.ts";

const TPG_ZONE_10_REVIEW = { from: "2026-10-11", through: "2026-12-12", checked: "2026-10-11", dataUpdated: "2026-10-04" };
/** Entire reviewed lines stay in Geneva Zone 10. Endpoint coordinates alone
 * never establish zones. The provider establishes the dated journey; the
 * official direction membership establishes zone coverage, not stop order. */
export function tpgZone10Leg(leg: TransitLeg, checkDate = true): boolean {
  if (leg.mode !== "transit" || operatorCode(leg.operator) !== "TPG" || replacementService(leg)
    || !["T", "TRAM", "B", "BUS", "NFB", "TROLLEYBUS"].includes(normalizeCode(leg.category))) return false;
  const line = normalizeCode(leg.service).match(/^(?:B|BUS|TRAM|T)?\s*(1|10|12|14|15|18)$/)?.[1];
  const route = TPG_ZONE_10_LINES.find(r => r.line === line);
  const from = swissStopId(leg, "departure"), to = swissStopId(leg, "arrival");
  if (!route || !from || !to || from === to || !leg.departure || !leg.arrival
    || !Number.isFinite(+leg.departure) || !Number.isFinite(+leg.arrival) || +leg.arrival <= +leg.departure) return false;
  const day = swissDateTimeInput(leg.departure).slice(0,10), end = swissDateTimeInput(leg.arrival).slice(0,10);
  if (checkDate && (day < TPG_ZONE_10_REVIEW.from || end > TPG_ZONE_10_REVIEW.through)) return false;
  return route.directions.some(stops => (stops as readonly string[]).includes(from) && (stops as readonly string[]).includes(to));
}
