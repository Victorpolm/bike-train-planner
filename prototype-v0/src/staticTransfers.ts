import { effectivePlatform, platformChanged } from "./realtime.ts";
import type { TransitLeg } from "./routing.ts";

export type TransferFeed = {
  version: string; validFrom: string; validThrough: string; zipSha256: string; source: string;
  generalRules: number; excludedScopedRows: number;
};
export type TransferEndpointQuery = { ref: string; stopId?: string; platform?: string; platformChanged?: boolean };
export type StaticTransferEndpoint = {
  key: string; status: "matched" | "station" | "unmapped" | "ambiguous" | "unavailable";
  id?: string; minimums?: Record<string, number>; feed?: TransferFeed;
  stationId?: string; stationMaximumSeconds?: number;
};
export function transferEndpointQuery(leg: TransitLeg, end: "arrival" | "departure"): TransferEndpointQuery {
  const arrival = end === "arrival", stopId = arrival ? leg.toId : leg.fromId;
  return { ref: (arrival ? leg.ojp?.toRef : leg.ojp?.fromRef) ?? stopId ?? "", stopId,
    platform: effectivePlatform(leg, end) ?? undefined, ...(platformChanged(leg, end) ? { platformChanged: true } : {}) };
}
export function transferEndpointKey(query: TransferEndpointQuery): string {
  return JSON.stringify([query.ref, query.stopId ?? "", query.platform ?? "", ...(query.platformChanged ? [true] : [])]);
}
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
function serviceDay(leg: TransitLeg, end: "arrival" | "departure") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(leg.ojp?.operatingDay ?? "")) return leg.ojp!.operatingDay;
  const date = end === "arrival" ? leg.arrival : leg.departure;
  return date && Number.isFinite(+date) ? dayFormatter.format(date) : "";
}
/** Pure resolver shared by routing, edits, detours and the journey details. */
export function staticTransfer(incoming: TransitLeg, next: TransitLeg): { seconds?: number; feed?: TransferFeed; basis?: "platform-pair" | "station-maximum"; reason: string } {
  const from = incoming.stationArrival, to = next.stationDeparture;
  if (!from || !to) return { reason: "The station transfer table was not available for both stops." };
  if (from.key !== transferEndpointKey(transferEndpointQuery(incoming, "arrival")) || to.key !== transferEndpointKey(transferEndpointQuery(next, "departure")))
    return { reason: "The platform changed after the station transfer lookup." };
  if (!["matched", "station"].includes(from.status) || !["matched", "station"].includes(to.status))
    return { reason: "The station transfer table could not uniquely match both platforms." };
  const feed = from.feed;
  if (!feed || feed.zipSha256 !== to.feed?.zipSha256) return { reason: "Station transfer editions do not match." };
  const days = [serviceDay(incoming, "arrival"), serviceDay(next, "departure")];
  if (days.some(day => !day || day < feed.validFrom || day > feed.validThrough))
    return { reason: `The station transfer table is valid ${feed.validFrom} to ${feed.validThrough}; this connection is outside that period.` };
  const seconds = to.id && from.status === "matched" && to.status === "matched" ? from.minimums?.[to.id] : undefined;
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0)
    return { seconds, feed, basis: "platform-pair", reason: "" };
  const maximums = [from.stationMaximumSeconds, to.stationMaximumSeconds]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  if (from.stationId && from.stationId === to.stationId && maximums.length)
    return { seconds: Math.max(...maximums), feed, basis: "station-maximum", reason: "" };
  return { reason: "No general transfer rule was supplied for this platform pair." };
}
