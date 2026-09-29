import { useEffect, useState } from "react";
import { amenityLoadError, loadAmenities, type AmenityLoadError } from "./amenityClient.ts";
import type { AmenityData } from "./osmAmenities.ts";

export function useAmenities(enabled: boolean) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; data?: AmenityData; error?: AmenityLoadError }>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || state.status === "ready") return;
    const controller = new AbortController();
    setState(current => ({ ...current, status: "loading", error: undefined }));
    void loadAmenities(controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ data, status: "ready" });
    }).catch(error => { if (!controller.signal.aborted) setState(current => ({ ...current, status: "error", error: amenityLoadError(error) })); });
    return () => controller.abort();
    // Water and toilets share one completed source; map and route changes never refetch it.
  }, [enabled, attempt]);
  return { ...state, loading: enabled && (state.status === "loading" || state.status === "idle"), retry: () => setAttempt(value => value + 1) };
}
