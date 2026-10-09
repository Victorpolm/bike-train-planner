import { StationTransferClient } from "./stationTransferClient.ts";
import { emptyNetwork } from "./model.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkOjpTripInfo } from "./ojpClient.ts";
import { platformChanged, realtimeKey, type TransitRealtime } from "./realtime.ts";
import { realtimeJourney, type RealtimePlatforms } from "./realtimeJourney.ts";
import type { Journey } from "./routing.ts";

const EMPTY_UPDATES = new Map<string, TransitRealtime>();
const EMPTY_PLATFORMS: RealtimePlatforms = new Map();
const swissDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
export function useRealtimeJourney(journey: Journey | null, enabled: boolean, boardingMinutes = 3, arriveBy?: string) {
  const key = journey ? JSON.stringify([journey.id, journey.transitLegs.map(realtimeKey)]) : "";
  const current = useRef(journey); current.current = journey;
  const [attempt, retry] = useState(0);
  const [state, setState] = useState<{ key: string; updates: Map<string, TransitRealtime>; platforms: RealtimePlatforms; loading: boolean; failed: boolean; now: number }>(
    { key: "", updates: EMPTY_UPDATES, platforms: EMPTY_PLATFORMS, loading: false, failed: false, now: Date.now() });
  const records = state.key === key ? state.updates : EMPTY_UPDATES;
  const platforms = state.key === key ? state.platforms : EMPTY_PLATFORMS;
  const today = swissDay.format(new Date());
  const active = !!journey?.transitLegs.some(leg => leg.ojp && [leg.departure, leg.arrival].some(date => date && swissDay.format(date) === today));
  useEffect(() => {
    if (!enabled || !active || !key) return;
    let disposed = false, running = false;
    const controller = new AbortController();
    const transfers = new StationTransferClient();
    const refresh = async () => {
      if (disposed || running || document.visibilityState === "hidden") return;
      running = true;
      setState(old => ({ key, updates: old.key === key ? old.updates : EMPTY_UPDATES, platforms: old.key === key ? old.platforms : EMPTY_PLATFORMS, loading: true, failed: false, now: Date.now() }));
      const legs = current.current?.transitLegs.filter(l => l.ojp && [l.departure, l.arrival].some(d => d && swissDay.format(d) === swissDay.format(new Date()))) ?? [];
      let next = 0, failed = false;
      const worker = async () => {
        while (!disposed && next < legs.length) {
          const leg = legs[next++];
          try {
            const details = await checkOjpTripInfo(leg.ojp!, controller.signal);
            if (!details.realtime) throw new Error("No realtime response");
            const updated = { ...leg, realtime: details.realtime };
            if (platformChanged(updated, "arrival") || platformChanged(updated, "departure")) {
              const network = emptyNetwork(); network.edges.set("selected", { id: "selected", from: leg.fromId ?? "", to: leg.toId ?? "", leg: updated });
              await transfers.hydrate(network, controller.signal);
            }
            if (!disposed) setState(old => ({ ...old, key, updates: new Map(old.updates).set(realtimeKey(leg), details.realtime!),
              platforms: new Map(old.platforms).set(realtimeKey(leg), { stationArrival: updated.stationArrival, stationDeparture: updated.stationDeparture }), now: Date.now() }));
          } catch { if (!disposed) failed = true; }
        }
      };
      await Promise.all([worker(), worker()]);
      running = false;
      if (!disposed) setState(old => ({ ...old, loading: false, failed, now: Date.now() }));
    };
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") { setState(old => ({ ...old, now: Date.now() })); void refresh(); } }, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { disposed = true; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [key, enabled, active, attempt]);
  const evaluated = useMemo(() => journey ? realtimeJourney(journey, records, boardingMinutes, arriveBy, platforms) : null,
    [journey, records, platforms, boardingMinutes, arriveBy]);
  return { journey: evaluated?.journey ?? null, issues: evaluated?.issues ?? [], active, loading: state.key === key && state.loading,
    failed: state.key === key && state.failed, now: state.now, refresh: () => retry(n => n + 1) };
}
export type RealtimeJourneyState = ReturnType<typeof useRealtimeJourney>;
