import type { TransitLeg } from "./routing.ts";

export type TransferFeed = {
  version: string; validFrom: string; validThrough: string; zipSha256: string; source: string;
  generalRules: number; excludedScopedRows: number;
};
export type TransferEndpointQuery = { ref: string; stopId?: string; platform?: string };
export type StaticTransferEndpoint = {
  key: string; status: "matched" | "unmapped" | "ambiguous" | "unavailable";
  id?: string; minimums?: Record<string, number>; feed?: TransferFeed;
};
export function transferEndpointQuery(leg: TransitLeg, end: "arrival" | "departure"): TransferEndpointQuery {
  const arrival = end === "arrival", stopId = arrival ? leg.toId : leg.fromId;
  return { ref: (arrival ? leg.ojp?.toRef : leg.ojp?.fromRef) ?? stopId ?? "", stopId,
    platform: (arrival ? leg.arrivalPlatform : leg.departurePlatform) ?? undefined };
}
export function transferEndpointKey(query: TransferEndpointQuery): string {
  return JSON.stringify([query.ref, query.stopId ?? "", query.platform ?? ""]);
}
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
function serviceDay(leg: TransitLeg, end: "arrival" | "departure") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(leg.ojp?.operatingDay ?? "")) return leg.ojp!.operatingDay;
  const date = end === "arrival" ? leg.arrival : leg.departure;
  return date && Number.isFinite(+date) ? dayFormatter.format(date) : "";
}
/** Pure resolver shared by routing, edits, detours and the journey details. */
export function staticTransfer(incoming: TransitLeg, next: TransitLeg): { seconds?: number; feed?: TransferFeed; reason: string } {
  const from = incoming.stationArrival, to = next.stationDeparture;
  if (!from || !to) return { reason: "The station transfer table was not available for both stops." };
  if (from.key !== transferEndpointKey(transferEndpointQuery(incoming, "arrival")) || to.key !== transferEndpointKey(transferEndpointQuery(next, "departure")))
    return { reason: "The platform changed after the station transfer lookup." };
  if (from.status !== "matched" || to.status !== "matched" || !from.id || !to.id)
    return { reason: "The station transfer table could not uniquely match both platforms." };
  const feed = from.feed;
  if (!feed || feed.zipSha256 !== to.feed?.zipSha256) return { reason: "Station transfer editions do not match." };
  const days = [serviceDay(incoming, "arrival"), serviceDay(next, "departure")];
  if (days.some(day => !day || day < feed.validFrom || day > feed.validThrough))
    return { reason: `The station transfer table is valid ${feed.validFrom} to ${feed.validThrough}; this connection is outside that period.` };
  const seconds = from.minimums?.[to.id];
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0)
    return { reason: "No general transfer rule was supplied for this platform pair." };
  return { seconds, feed, reason: "" };
}
