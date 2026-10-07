import type { Network } from "./model.ts";
import { transferEndpointKey, transferEndpointQuery, type StaticTransferEndpoint, type TransferEndpointQuery } from "./staticTransfers.ts";

export class StationTransferClient {
  readonly warnings = new Set<string>();
  private cache = new Map<string, StaticTransferEndpoint>();
  private failed = false;
  private fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) { this.fetcher = fetcher; }
  fork() { const next = new StationTransferClient(this.fetcher); next.cache = new Map([...this.cache].filter(([, v]) => v.status !== "unavailable")); return next; }
  async hydrate(network: Network, signal: AbortSignal): Promise<void> {
    const queries = new Map<string, TransferEndpointQuery>();
    for (const { leg } of network.edges.values()) if (leg.mode === "transit") for (const end of ["arrival", "departure"] as const) {
      const q = transferEndpointQuery(leg, end), key = transferEndpointKey(q);
      if (q.ref && !this.cache.has(key)) queries.set(key, q);
    }
    const all = [...queries.values()];
    for (let offset = 0; offset < all.length; offset += 24) {
      const batch = all.slice(offset, offset + 24);
      try {
        if (this.failed) throw new Error("Unavailable in this search");
        const response = await this.fetcher("/api/station-transfers/v1", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoints: batch }), signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
        if (!response.ok) throw new Error("Station transfer service failed");
        const data = await response.json() as { endpoints: StaticTransferEndpoint[] };
        if (!Array.isArray(data.endpoints) || data.endpoints.length !== batch.length || data.endpoints.some((e, i) => e.key !== transferEndpointKey(batch[i])))
          throw new Error("Incomplete station transfer response");
        data.endpoints.forEach(e => this.cache.set(e.key, e));
      } catch {
        signal.throwIfAborted(); this.failed = true;
        this.warnings.add("The station transfer table could not be loaded. Exact OJP times remain in use; other connections show a timetable default or estimated allowance.");
        batch.forEach(q => this.cache.set(transferEndpointKey(q), { key: transferEndpointKey(q), status: "unavailable" }));
      }
    }
    for (const { leg } of network.edges.values()) if (leg.mode === "transit") {
      leg.stationArrival = this.cache.get(transferEndpointKey(transferEndpointQuery(leg, "arrival")));
      leg.stationDeparture = this.cache.get(transferEndpointKey(transferEndpointQuery(leg, "departure")));
    }
  }
}
