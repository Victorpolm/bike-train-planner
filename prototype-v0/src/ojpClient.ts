import { haversineKm, type TransitLeg } from "./routing.ts";
import type { BicycleEvidence } from "./bicyclePermission.ts";
import type { Network, Stop } from "./model.ts";
import type { OjpConnections, OjpDetails, OjpReference, OjpStop } from "./ojp.ts";

const SOURCE = "https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/";
const normalize = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function addOjpConnections(network: Network, data: OjpConnections) {
  const stop = (s: OjpStop): Stop => {
    const existing = network.stops.get(s.id) ?? [...network.stops.values()].find(n => normalize(n.name) === normalize(s.name) && haversineKm(n, s) <= .25);
    if (existing) return existing;
    network.stops.set(s.id, s); return s;
  };
  for (const input of data.legs) {
    const from = stop(input.from), to = stop(input.to);
    if (from.id === to.id) continue;
    const leg: TransitLeg = { ...input, from: from.name, to: to.name, fromId: from.id, toId: to.id,
      departure: new Date(input.departure), arrival: new Date(input.arrival),
      fromPoint: from, toPoint: to, geometry: [from, to], ojp: input.reference };
    if (!Number.isFinite(leg.departure!.getTime()) || !Number.isFinite(leg.arrival!.getTime())) continue;
    if (input.rule && input.reference) {
      leg.bicycleEvidence = {
        permission: input.rule.permission, basis: input.rule.basis,
        fromId: from.id, toId: to.id, departure: input.departure, service: input.service, operator: input.operator,
        source: { title: input.rule.basis === "ojp-filter" ? "OJP bicycle-compatible search" : "OJP dated service conditions", url: SOURCE, checked: data.checked },
        conditions: input.rule.notes, prerequisites: { bikeTicket: "unknown", bikeReservation: input.rule.bikeReservation },
      };
    }
    const id = JSON.stringify(["ojp", input.reference?.journeyRef, input.reference?.operatingDay, from.id, to.id, input.departure, input.arrival]);
    const existing = network.edges.get(id)?.leg;
    // An unfiltered later query cannot erase a previous dated filter match or ban.
    if (existing?.bicycleEvidence && leg.bicycleEvidence) {
      const old = existing.bicycleEvidence, fresh = leg.bicycleEvidence;
      const permission = old.permission === "prohibited" || fresh.permission === "prohibited" ? "prohibited"
        : old.permission === "allowed" || fresh.permission === "allowed" ? "allowed" : "unknown";
      leg.bicycleEvidence = { ...fresh, permission, conditions: [...new Set([...old.conditions, ...fresh.conditions])],
        prerequisites: { ...fresh.prerequisites!, bikeReservation: fresh.prerequisites?.bikeReservation === "unknown"
          ? old.prerequisites?.bikeReservation ?? "unknown" : fresh.prerequisites!.bikeReservation } };
      if (old.permission === "allowed" && fresh.permission === "unknown") leg.bicycleEvidence.basis = old.basis;
    }
    network.edges.set(id, { id, from: from.id, to: to.id, leg });
  }
}

export class OjpClient {
  private cache = new Map<string, Promise<OjpConnections | null>>();
  readonly warnings = new Set<string>();
  private unavailable = false;
  signal: AbortSignal;
  private fetcher: typeof fetch;
  constructor(signal: AbortSignal, fetcher: typeof fetch = fetch) { this.signal = signal; this.fetcher = fetcher; }
  static async connect(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<OjpClient | null> {
    try {
      const r = await fetcher("/api/ojp/status", { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]), credentials: "same-origin" });
      if (r.ok && (await r.json()).available === true) return new OjpClient(signal, fetcher);
    } catch { signal.throwIfAborted(); }
    return null;
  }
  connections(from: Stop, to: Stop, departure: Date, claim: (calls: number) => boolean) {
    const body = { from, to, departure: departure.toISOString() }, key = JSON.stringify([from.id, to.id, body.departure]);
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (this.unavailable || !claim(2)) return Promise.resolve(null);
    const task = (async () => {
      try {
        const r = await this.fetcher("/api/ojp/connections", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: AbortSignal.any([this.signal, AbortSignal.timeout(35_000)]), credentials: "same-origin" });
        if (!r.ok) throw new Error("OJP unavailable");
        const data = await r.json() as OjpConnections;
        if (!Array.isArray(data.legs) || !data.checked || !Array.isArray(data.warnings)) throw new Error("Invalid OJP result");
        data.warnings.forEach(w => this.warnings.add(w));
        return data;
      } catch {
        this.signal.throwIfAborted(); this.unavailable = true;
        this.warnings.add("Bicycle information could not be checked. The fallback timetable may include services with unknown bicycle permission.");
        return null;
      }
    })();
    this.cache.set(key, task); return task;
  }
}

const detailCache = new Map<string, { expires: number; promise: Promise<OjpDetails> }>();
export function checkOjpTripInfo(ref: OjpReference): Promise<OjpDetails> {
  const body = { journeyRef: ref.journeyRef, operatingDay: ref.operatingDay, fromRef: ref.fromRef, toRef: ref.toRef,
    departure: ref.departure, arrival: ref.arrival };
  const key = JSON.stringify(body), cached = detailCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    const response = await fetch("/api/ojp/tripinfo", { method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", body: key, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error("The latest service details could not be checked.");
    return await response.json() as OjpDetails;
  })();
  if (detailCache.size >= 64) detailCache.delete(detailCache.keys().next().value!);
  detailCache.set(key, { expires: Date.now() + 5 * 60_000, promise });
  void promise.catch(() => detailCache.delete(key));
  return promise;
}

export function applyBicycleEvidence(network: Network, target: TransitLeg, evidence: BicycleEvidence) {
  for (const edge of network.edges.values()) {
    const leg = edge.leg;
    if (leg.fromId === target.fromId && leg.toId === target.toId && leg.departure?.getTime() === target.departure?.getTime()
      && leg.arrival?.getTime() === target.arrival?.getTime()
      && leg.service === target.service && leg.operator === target.operator && leg.ojp?.journeyRef === target.ojp?.journeyRef
      && leg.ojp?.operatingDay === target.ojp?.operatingDay) edge.leg = { ...leg, bicycleEvidence: evidence };
  }
}
