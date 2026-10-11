import { transferEndpointKey, transferEndpointQuery } from "./staticTransfers.ts";
import type { TransitLeg } from "./routing.ts";

export function swissStopId(leg: TransitLeg, end: "arrival" | "departure"): string | null {
  const id = end === "arrival" ? leg.toId : leg.fromId;
  if (/^85\d{5}$/.test(id ?? "")) return id!;
  const endpoint = end === "arrival" ? leg.stationArrival : leg.stationDeparture;
  // A ch: SLOID prefix also occurs abroad. Require the maintained DIDOK join.
  return endpoint && ["matched", "station"].includes(endpoint.status)
    && endpoint.key === transferEndpointKey(transferEndpointQuery(leg, end))
    && /^85\d{5}$/.test(endpoint.stationId ?? "") ? endpoint.stationId! : null;
}
export const domesticSwissLeg = (leg: TransitLeg) => !!swissStopId(leg, "departure") && !!swissStopId(leg, "arrival");
export const replacementService = (leg: TransitLeg) => ["EV", "SEV"].includes((leg.category ?? "").toUpperCase())
  || /replacement|ersatz|remplacement/i.test(`${leg.service} ${leg.serviceName ?? ""}`);
