import { normalizeName as normalize } from "./normalization.ts";
import { haversineKm, type TransitLeg } from "./routing.ts";
import type { BicycleEvidence } from "./bicyclePermission.ts";
import type { Network, Stop } from "./model.ts";
import type { OjpConnections, OjpDetails, OjpReference, OjpStop } from "./ojp.ts";
import { fetchJson } from "./http.ts";

const SOURCE = "https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/";
export function addOjpConnections(network: Network, data: OjpConnections) {
  const stop = (s: OjpStop): Stop => {
    // Provider centroids can represent different platforms of the same large
    // station. Reuse the discovered station node, retaining OJP's exact service
    // and platform references on the leg. Road connector limits stay unchanged.
    const existing = network.stops.get(s.id) ?? [...network.stops.values()].find(n => normalize(n.name) === normalize(s.name) && haversineKm(n, s) <= .5);
    if (existing) return existing;
    network.stops.set(s.id, s); return s;
  };
  for (const input of data.legs) {
    const from = stop(input.from), to = stop(input.to);
    if (from.id === to.id) continue;
    const leg: TransitLeg = { ...input, from: from.name, to: to.name, fromId: from.id, toId: to.id,
      departure: new Date(input.departure), arrival: new Date(input.arrival),
      fromPoint: from, toPoint: to, geometry: [from, to], ojp: input.reference,
      fareSources: data.fareSources?.filter(s => input.fareSourceIds?.includes(s.id)) };
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
    if (existing?.fareSources?.length) leg.fareSources = [...new Map(
      [...existing.fareSources, ...(leg.fareSources ?? [])].map(s => [s.id, s])).values()].slice(-16);
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
  fork(signal: AbortSignal) { return new OjpClient(signal, this.fetcher); }
  static async connect(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<OjpClient | null> {
    try {
      const status = await fetchJson<{ available: boolean }>("/api/ojp/status", signal, 15_000, fetcher);
      if (status.available === true) return new OjpClient(signal, fetcher);
    } catch { signal.throwIfAborted(); }
    return null;
  }
  connections(from: Stop, to: Stop, departure: Date, claim: (calls: number) => boolean) {
    // Graph stations also carry road geometry and terrain details. They are not
    // part of an OJP stop reference and can exceed the backend's 8 KiB limit.
    const stop = ({ id, name, lat, lon }: Stop): OjpStop => ({ id, name, lat, lon });
    const body = { from: stop(from), to: stop(to), departure: departure.toISOString() }, key = JSON.stringify([from.id, to.id, body.departure]);
    if (this.cache.has(key)) return this.cache.get(key)!;
    if (this.unavailable || !claim(2)) return Promise.resolve(null);
    const task = (async () => {
      try {
        const data = await fetchJson<OjpConnections>("/api/ojp/connections", this.signal, 35_000, this.fetcher,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    return await fetchJson<OjpDetails>("/api/ojp/tripinfo", undefined, 20_000, fetch,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: key });
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
