import { useEffect, useState } from "react";
import { amenityLoadError, loadAmenities, type AmenityLoadError } from "./amenityClient.ts";
import type { AmenityData } from "./osmAmenities.ts";
import type { ServiceDataset } from "./osmServices.ts";

export function useAmenities(enabled: boolean, dataset?: ServiceDataset) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; data?: AmenityData; error?: AmenityLoadError }>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || state.status === "ready") return;
    const controller = new AbortController();
    setState(current => ({ ...current, status: "loading", error: undefined }));
    void loadAmenities(controller.signal, fetch, { dataset, onUpdate: data => setState({ data, status: "ready" }) }).then(data => {
      if (!controller.signal.aborted) setState({ data, status: "ready" });
    }).catch(error => { if (!controller.signal.aborted) setState(current => ({ ...current, status: "error", error: amenityLoadError(error, dataset ?? "Water/toilet") })); });
    return () => controller.abort();
    // Each hook owns one fixed dataset. Map/route/subtype changes never refetch it.
  }, [enabled, attempt, dataset]);
  return { ...state, loading: enabled && (state.status === "loading" || state.status === "idle"), retry: () => setAttempt(value => value + 1) };
}
