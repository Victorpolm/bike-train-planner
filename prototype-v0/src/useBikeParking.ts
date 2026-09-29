import { useEffect, useMemo, useState } from "react";
import { mergeBikeParking, type ParkingData, type ParkingProvider } from "./bikeParking.ts";

export type ParkingLoad = { data?: ParkingData; status: "idle" | "loading" | "ready" | "error" };
const providers: ParkingProvider[] = ["official", "osm"];
export function useBikeParking(enabled: boolean) {
  const [loads, setLoads] = useState<Record<ParkingProvider, ParkingLoad>>({ official: { status: "idle" }, osm: { status: "idle" } });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    for (const provider of providers) {
      if (loads[provider].status === "ready") continue;
      setLoads(current => ({ ...current, [provider]: { ...current[provider], status: "loading" } }));
      void fetch(`/api/parking?source=${provider}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("Parking unavailable");
        const data = await response.json() as ParkingData;
        if (!Array.isArray(data.facilities) || data.provider !== provider) throw new Error("Invalid parking response");
        if (!controller.signal.aborted) setLoads(current => ({ ...current, [provider]: { data, status: "ready" } }));
      }).catch(() => {
        if (!controller.signal.aborted) setLoads(current => ({ ...current, [provider]: { ...current[provider], status: "error" } }));
      });
    }
    return () => controller.abort();
    // A result must not cancel the other provider. Reload only on toggle or explicit retry.
  }, [enabled, attempt]);
  const datasets = useMemo(() => providers.flatMap(provider => loads[provider].data ? [loads[provider].data!] : []), [loads.official.data, loads.osm.data]);
  const facilities = useMemo(() => mergeBikeParking(datasets), [datasets]);
  return { loads, datasets, facilities, loading: providers.some(provider => loads[provider].status === "loading" || enabled && loads[provider].status === "idle"),
    retry: () => setAttempt(value => value + 1) };
}
