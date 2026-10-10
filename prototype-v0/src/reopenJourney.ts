import type { SearchSession } from "./api.ts";
import { emptyNetwork, type Solution } from "./model.ts";
import { TimetableClient } from "./timetableClient.ts";
import { validateSavedTrip, type SavedJourney } from "./savedJourneys.ts";

/** Restore an inspected snapshot without treating its saved data as a fresh search. */
export function reopenJourney(saved: SavedJourney): SearchSession {
  validateSavedTrip(saved.trip);
  const t = saved.trip, empty = (): Solution => ({ journeys: [], reachable: [], explored: 0, retained: 0, limited: false });
  const client = new TimetableClient(new AbortController().signal);
  client.warnings.add("This is a saved itinerary. Live checks can report changes, but do not replace missed or cancelled services. Plan again for a new travel date.");
  return { origin: t.origin, destination: t.destination, start: t.start, options: { ...t.options }, waypoints: t.waypoints,
    network: emptyNetwork(), client, originStations: [], destinationStations: [], baseline: empty(), extended: empty(),
    confirmed: { baseline: empty(), extended: empty() }, allTransit: { baseline: empty(), extended: empty() }, extendedComplete: true,
    cyclingComparison: t.cycling ?? undefined, cyclingStatus: t.cycling ? "ready" : undefined, savedAt: saved.savedAt };
}
