import { useEffect, useMemo, useRef, useState } from "react";
import { FACILITY_JOBS, type FacilityLoad, type FacilityProvider } from "./facilitySources.ts";
import { loadFacilityJobs } from "./facilityClient.ts";
const EMPTY_LOADS: FacilityLoad[] = [];

function useProvider(provider: FacilityProvider, enabled: boolean) {
  const [loads, setLoads] = useState<FacilityLoad[]>(() => FACILITY_JOBS.filter(j => j.provider === provider).map(j => ({ ...j, status: "idle" })));
  const current = useRef(loads); current.current = loads;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(), jobs = current.current.filter(j => j.status !== "ready");
    void loadFacilityJobs(jobs, controller.signal, load => setLoads(old => old.map(j => j.key === load.key ? load : j)));
    return () => controller.abort();
  }, [enabled, provider, attempt]);
  return { loads: enabled ? loads : EMPTY_LOADS, retry: () => setAttempt(n => n + 1) };
}
export function useFacilitySources(enabled: Record<FacilityProvider, boolean>) {
  const rural = useProvider("graubuenden", enabled.graubuenden), stations = useProvider("sbb", enabled.sbb), topography = useProvider("swisstlm3d", enabled.swisstlm3d);
  const loads = useMemo(() => [...rural.loads, ...stations.loads, ...topography.loads], [rural.loads, stations.loads, topography.loads]);
  const facilities = useMemo(() => loads.flatMap(l => l.data?.facilities ?? []), [loads]);
  return { loads, facilities, retry: (provider: FacilityProvider) => ({ graubuenden: rural, sbb: stations, swisstlm3d: topography })[provider].retry() };
}
