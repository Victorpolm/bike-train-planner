import { cachedMapData } from "./mapDataCache.ts";
import { validAmenityData, type AmenityData } from "./osmAmenities.ts";
import { waitFor } from "./http.ts";
import type { ServiceDataset } from "./osmServices.ts";

export class AmenityLoadError extends Error {
  code: "session" | "access" | "network" | "timeout" | "response" | "source";
  status?: number;
  retryAfterMs?: number;
  constructor(code: AmenityLoadError["code"], message: string, status?: number, retryAfterMs?: number) {
    super(message); this.name = "AmenityLoadError"; this.code = code; this.status = status; this.retryAfterMs = retryAfterMs;
  }
}
export function amenityLoadError(error: unknown, label = "Water/toilet"): AmenityLoadError {
  if (error instanceof AmenityLoadError) return error;
  if (error instanceof Error && error.name === "TimeoutError") return new AmenityLoadError("timeout", `${label} data took too long to load. Retry loading.`);
  return new AmenityLoadError("network", `Could not reach the ${label.toLowerCase()} service. Check the connection or open the planner in its own tab.`);
}
export async function loadAmenities(signal: AbortSignal, fetcher: typeof fetch = fetch,
  options: { timeoutMs?: number; retryDelayMs?: number; dataset?: ServiceDataset; onUpdate?: (data: AmenityData) => void } = {}): Promise<AmenityData> {
  if (fetcher === fetch) return cachedMapData(`amenities-v2:${options.dataset ?? "water-toilets"}`, signal,
    (data): data is AmenityData => validAmenityData(data, options.dataset),
    () => fetchAmenities(new AbortController().signal, fetcher, options), options.onUpdate);
  return fetchAmenities(signal, fetcher, options);
}
async function fetchAmenities(signal: AbortSignal, fetcher: typeof fetch,
  options: { timeoutMs?: number; retryDelayMs?: number; dataset?: ServiceDataset }): Promise<AmenityData> {
  const label = options.dataset === "repairs" ? "Repair" : options.dataset === "food" ? "Food" : options.dataset === "food-dining" ? "Café/restaurant" : "Water/toilet";
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController(), abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    const timer = setTimeout(() => controller.abort(new DOMException("Amenity request timed out", "TimeoutError")), options.timeoutMs ?? 50_000);
    try {
      controller.signal.throwIfAborted();
      const response = await fetcher(options.dataset ? `/api/services/v1/${options.dataset}` : "/api/amenities/v1", { signal: controller.signal, credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const type = response.headers.get("Content-Type") ?? "";
      if (response.status === 401 || response.redirected || type.includes("text/html") && response.ok) throw new AmenityLoadError("session", "Refresh your sign-in by opening the planner in its own tab.", response.status);
      if (response.status === 403) throw new AmenityLoadError("access", `${label} access was denied. Refresh the planner and check that you are signed in with the owner's account.`, 403);
      if (!response.ok) {
        const retry = response.headers.get("Retry-After"), seconds = retry === null ? NaN : Number(retry);
        const retryMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : undefined;
        throw new AmenityLoadError("source", `${label} service returned HTTP ${response.status}.${retryMs ? ` Retry after ${Math.ceil(retryMs / 1000)} seconds.` : " Retry loading."}`, response.status, retryMs);
      }
      if (!type.includes("application/json")) throw new AmenityLoadError("response", `Unexpected ${label.toLowerCase()} response. Refresh the planner, then retry.`);
      let data: unknown;
      try { data = await response.json(); }
      catch { controller.signal.throwIfAborted(); throw new AmenityLoadError("response", `${label} data was incomplete. Retry loading.`); }
      if (!validAmenityData(data, options.dataset)) throw new AmenityLoadError("response", `${label} data did not match the expected source. Retry loading.`);
      return data;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      const failure = amenityLoadError(controller.signal.aborted ? controller.signal.reason : error, label);
      const transient = failure.code === "network" || failure.code === "response" || [502, 504].includes(failure.status ?? 0);
      if (attempt || !transient || failure.retryAfterMs) throw failure;
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
    await waitFor(options.retryDelayMs ?? 1000, signal);
  }
}
