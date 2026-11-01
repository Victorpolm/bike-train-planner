import { ojpTripInfoRequest, ojpTripRequest, parseOjpConnections, parseOjpDetails, type OjpQuery, type OjpReference } from "../src/ojp.ts";
import { realtimeStale, type TransitRealtime } from "../src/realtime.ts";

type Observation = { status: "estimates-observed" | "no-estimates" | "error"; reason?: string };
export type CanaryResult = Observation & {
  day: string; checkedAt: string; services: number; estimatedTimes: number; parsedEstimates: number;
  fixtureSaved: boolean; corridor?: string; operators?: string[]; freshEstimatedServices?: number;
  freshDelayedServices?: number; realtimeMode?: "explanatory";
  tripInfo?: Observation & { service?: string; operator?: string | null; reference?: OjpReference;
    providerCheckedAt?: string; freshEstimates: number; fixtureSaved: boolean };
};
export type LiveFixture = { xml: string; checkedAt: string; reference?: OjpReference };
const minute = 60_000;
const hasEstimate = (r?: TransitRealtime) => !!(r?.estimatedDeparture || r?.estimatedArrival);
const fresh = (r: TransitRealtime | undefined, now: Date) => !!r && !realtimeStale(r, +now) && hasEstimate(r);

/** Two quota-accounted requests at most: one search and one exact dated service.
 * Both use the application's request builders and parsers. Raw XML alone cannot
 * establish success, nor can an estimate for an unrelated/past/far-future leg. */
export async function runLiveCanary(query: OjpQuery, fetcher: typeof fetch, now: Date, credential: string,
  authorize: (signal: AbortSignal) => Promise<void>) {
  const checkedAt = now.toISOString();
  const sample: CanaryResult = { day: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(now),
    checkedAt, status: "error", services: 0, estimatedTimes: 0, parsedEstimates: 0, fixtureSaved: false,
    freshEstimatedServices: 0, freshDelayedServices: 0, operators: [], realtimeMode: "explanatory" };
  let tripFixture: LiveFixture | undefined, infoFixture: LiveFixture | undefined;
  const request = async (body: string) => {
    if (!credential) throw new Error("Provider not configured");
    const signal = AbortSignal.timeout(20_000);
    await authorize(signal);
    const response = await fetcher("https://api.opentransportdata.swiss/ojp20", { method: "POST", redirect: "manual", signal,
      headers: { Authorization: "Bearer " + credential, "Content-Type": "application/xml", Accept: "application/xml" }, body });
    if (!response.ok || !response.body) throw new Error("Provider response unavailable");
    const reader = response.body.getReader(), parts: Uint8Array[] = []; let bytes = 0;
    try { for (;;) { signal.throwIfAborted(); const p = await reader.read(); if (p.done) break;
      bytes += p.value.length; if (bytes > 2_000_000) throw new Error("Provider response too large"); parts.push(p.value); }
    } finally { await reader.cancel().catch(() => {}); }
    const data = new Uint8Array(bytes); let offset = 0;
    for (const p of parts) { data.set(p, offset); offset += p.length; }
    return new TextDecoder().decode(data).split(credential).join("[REDACTED]");
  };
  try {
    const xml = await request(ojpTripRequest(query, false, checkedAt));
    const all = parseOjpConnections(xml, false).filter(l => l.mode === "transit");
    const legs = [...new Map(all.map(l => [JSON.stringify(l.reference), l])).values()];
    // Explanatory mode can include cancelled services; keep those observations,
    // but sample only the requested present-time window.
    const current = legs.filter(l => Date.parse(l.arrival) >= +now - minute && Date.parse(l.departure) <= +now + 120 * minute);
    sample.services = current.length;
    sample.estimatedTimes = (xml.match(/<(?:[\w-]+:)?EstimatedTime(?:\s[^>]*)?>/g) ?? []).length;
    sample.parsedEstimates = current.filter(l => hasEstimate(l.realtime)).length;
    sample.freshEstimatedServices = current.filter(l => fresh(l.realtime, now)).length;
    sample.freshDelayedServices = current.filter(l => fresh(l.realtime, now) &&
      (Date.parse(l.realtime!.estimatedDeparture ?? l.departure) > Date.parse(l.departure)
       || Date.parse(l.realtime!.estimatedArrival ?? l.arrival) > Date.parse(l.arrival))).length;
    sample.operators = [...new Set(current.map(l => l.operator).filter((s): s is string => !!s))];
    if (!current.length) throw new Error("No current parsed service");
    sample.status = sample.freshEstimatedServices ? "estimates-observed" : "no-estimates";
    if (!sample.freshEstimatedServices) sample.reason = "No fresh parsed estimates for the sampled current services. Timetable data is not evidence of punctuality.";
    if (sample.freshEstimatedServices && new TextEncoder().encode(xml).length <= 600_000) tripFixture = { xml, checkedAt };
    // Prefer a current service already carrying estimates, then the next dated
    // service. One bounded TripInfo sample tests the exact refresh path.
    const target = current.find(l => l.reference && fresh(l.realtime, now)) ?? current.find(l => l.reference);
    if (!target?.reference) throw new Error("No service reference");
    const info: NonNullable<CanaryResult["tripInfo"]> = { status: "error", service: target.service, operator: target.operator,
      reference: target.reference, freshEstimates: 0, fixtureSaved: false };
    sample.tripInfo = info;
    try {
      const raw = await request(ojpTripInfoRequest(target.reference, checkedAt));
      const details = parseOjpDetails(raw, target.reference);
      info.providerCheckedAt = details.realtime?.checkedAt;
      info.freshEstimates = fresh(details.realtime, now)
        ? Number(!!details.realtime?.estimatedDeparture) + Number(!!details.realtime?.estimatedArrival) : 0;
      info.status = info.freshEstimates ? "estimates-observed" : "no-estimates";
      if (!info.freshEstimates) info.reason = "The exact TripInfo segment returned no fresh parsed estimates. Search estimates do not prove that selected-journey refresh works.";
      if (info.freshEstimates && new TextEncoder().encode(raw).length <= 600_000) infoFixture = { xml: raw, checkedAt, reference: target.reference };
    } catch { info.reason = "Exact-service TripInfo retrieval or parsing failed; no upstream diagnostic or credential is retained."; }
  } catch { sample.reason = "Current-service search retrieval or parsing failed. Check configuration, quota and provider coverage; no upstream diagnostic or credential is retained."; }
  return { sample, tripFixture, infoFixture };
}
