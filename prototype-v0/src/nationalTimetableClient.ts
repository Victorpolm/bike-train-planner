import { addSections } from "./timetable.ts";
import type { Network, Stop } from "./model.ts";
import type { TransportSection } from "./itinerary.ts";

export class NationalTimetableClient {
  signal: AbortSignal;
  readonly warnings = new Set<string>();
  private fetcher: typeof fetch;
  constructor(signal: AbortSignal, fetcher: typeof fetch = fetch) { this.signal = signal; this.fetcher = fetcher; }
  static async connect(signal: AbortSignal, fetcher: typeof fetch = fetch) {
    try {
      const response = await fetcher("/api/timetable/status", { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) });
      if (response.ok && (await response.json()).available) return new NationalTimetableClient(signal, fetcher);
    } catch { signal.throwIfAborted(); }
    return null;
  }
  async add(network: Network, from: Stop, to: Stop, departure: Date) {
    try {
      const response = await this.fetcher("/api/timetable/connections", { method: "POST", credentials: "same-origin",
        signal: AbortSignal.any([this.signal, AbortSignal.timeout(13_000)]), headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: from.id, to: to.id, departure: departure.toISOString() }) });
      if (!response.ok) throw new Error("Timetable query failed");
      const data = await response.json() as { journeys: { sections: TransportSection[] }[]; warnings: string[]; incomplete: boolean };
      if (!Array.isArray(data.journeys) || !Array.isArray(data.warnings)) throw new Error("Invalid timetable data");
      data.warnings.forEach(w => this.warnings.add(w));
      for (const journey of data.journeys) addSections(network, journey.sections);
      // Preserve useful local paths, but still augment the pilot with the live
      // timetable until its pathways, headways and disruption gates are met.
      return data.journeys.length > 0 && !data.incomplete;
    } catch {
      this.signal.throwIfAborted();
      this.warnings.add("The local timetable is unavailable for this query; the live timetable is being used.");
      return false;
    }
  }
}
