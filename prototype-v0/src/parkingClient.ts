import type { ParkingData, ParkingProvider } from "./bikeParking.ts";
import { waitFor } from "./http.ts";

export type ParkingFailureCode = "session" | "access" | "network" | "timeout" | "response" | "source";
export class ParkingLoadError extends Error {
  code: ParkingFailureCode;
  status?: number;
  retryAfterMs?: number;
  constructor(code: ParkingFailureCode, message: string, status?: number, retryAfterMs?: number) {
    super(message); this.name = "ParkingLoadError"; this.code = code; this.status = status; this.retryAfterMs = retryAfterMs;
  }
}
export function parkingLoadError(error: unknown): ParkingLoadError {
  if (error instanceof ParkingLoadError) return error;
  if (error instanceof Error && error.name === "TimeoutError") return new ParkingLoadError("timeout", "The parking request timed out. Retry loading.");
  return new ParkingLoadError("network", "The browser could not reach the parking service. Check the connection or open the planner in its own tab, then retry.");
}

export async function loadParkingSource(provider: ParkingProvider, signal: AbortSignal, fetcher: typeof fetch = fetch,
  options: { timeoutMs?: number; retryDelayMs?: number } = {}): Promise<ParkingData> {
  // Versioned, distinct paths avoid old browser responses and query-key collisions.
  const url = `/api/parking/v3/${provider}`;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController(), abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(() => controller.abort(new DOMException("Parking request timed out", "TimeoutError")), options.timeoutMs ?? 50_000);
    try {
      controller.signal.throwIfAborted();
      const response = await fetcher(url, { signal: controller.signal, credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      const type = response.headers.get("Content-Type") ?? "";
      if (response.status === 401 || response.redirected || type.includes("text/html") && response.ok) {
        throw new ParkingLoadError("session", "The planner's sign-in session needs refreshing. Open the planner in its own tab and sign in again.", response.status);
      }
      if (response.status === 403) throw new ParkingLoadError("access", "The parking request was denied. Refresh the planner and check that you are signed in with the owner's account.", 403);
      if (!response.ok) {
        const retry = response.headers.get("Retry-After"), seconds = retry === null ? NaN : Number(retry);
        const retryMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : undefined;
        throw new ParkingLoadError("source", `Parking service returned HTTP ${response.status}.${retryMs ? ` Retry after ${Math.ceil(retryMs / 1000)} seconds.` : " Retry loading."}`, response.status, retryMs);
      }
      if (!type.includes("application/json")) throw new ParkingLoadError("response", "The parking service returned an unexpected response. Refresh the planner, then retry.");
      let data: ParkingData;
      try { data = await response.json() as ParkingData; }
      catch { controller.signal.throwIfAborted(); throw new ParkingLoadError("response", "The parking response was incomplete. Retry loading."); }
      if (!data || !Array.isArray(data.facilities) || data.provider !== provider || !Number.isFinite(Date.parse(data.fetchedAt))) {
        throw new ParkingLoadError("response", "The parking response did not match this source. Refresh the planner, then retry.");
      }
      return data;
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      const failure = parkingLoadError(controller.signal.aborted ? controller.signal.reason : error);
      const transient = failure.code === "network" || failure.code === "response" || [502, 504].includes(failure.status ?? 0);
      if (attempt !== 0 || !transient || failure.retryAfterMs) throw failure;
    } finally {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
    }
    await waitFor(options.retryDelayMs ?? 1000, signal);
  }
}
