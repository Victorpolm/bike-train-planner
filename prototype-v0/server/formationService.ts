import { formationResult, parseFormation, type FormationEvidence, type FormationReference } from "../src/formation.ts";
import { swissDateTimeInput } from "../src/departure.ts";
import { claimApiCall, coolDownApi, type QuotaEnvironment, type QuotaGate } from "./apiQuota.ts";

export type FormationEnvironment = QuotaEnvironment & { API_FORMATION_KEY?: string; OJP_FORMATION_KEY?: string };
export const formationKey = (env: FormationEnvironment) => (env.API_FORMATION_KEY?.trim() || env.OJP_FORMATION_KEY?.trim() || "").replace(/^Bearer\s+/i, "").trim();
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
export function createFormationService(fetcher: typeof fetch = fetch, quota: QuotaGate = claimApiCall, timeoutMs = 6500) {
  const cache = new Map<string, { until: number; data: unknown }>();
  let activeKey = "", blockedUntil = 0;
  return async (ref: FormationReference | undefined, env: FormationEnvironment, parentSignal: AbortSignal): Promise<FormationEvidence> => {
    if (!ref) return formationResult("not-supported", "Formation data is unavailable for this service: its rail operator, train number or stops are not identified in the timetable.");
    const key = formationKey(env);
    if (!key) return formationResult("missing-key", "Train formation checking is not connected.");
    if (activeKey !== key) { cache.clear(); blockedUntil = 0; activeKey = key; }
    const today = swissDateTimeInput(new Date()).slice(0, 10), days = (Date.parse(ref.operatingDay) - Date.parse(today)) / 86_400_000;
    if (days < 0 || days > 3) return formationResult("outside-window", "Formation data is available only for today and the next three days. The timetable and operator rules still apply.");
    const route = days === 0 ? "formations_full" : "formations_vehicle_based";
    const url = new URL("https://api.opentransportdata.swiss/formation/v2/" + route);
    url.search = new URLSearchParams({ evu: ref.evu, operationDate: ref.operatingDay, trainNumber: ref.trainNumber }).toString();
    const cacheKey = url.toString(), cached = cache.get(cacheKey);
    if (cached && cached.until > Date.now()) return parseFormation(cached.data, ref);
    if (Date.now() < blockedUntil) return formationResult("unavailable", "The formation provider is temporarily limiting requests. Service and operator rules are shown.");
    const controller = new AbortController(), abort = () => controller.abort(parentSignal.reason);
    parentSignal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (parentSignal.aborted) controller.abort(parentSignal.reason);
      await abortable(quota(env, key, controller.signal), controller.signal);
      let response = await abortable(fetcher(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: controller.signal, redirect: "manual" }), controller.signal);
      // Full formations require both upstream systems. A stop-based response can
      // still carry the bicycle/reservation symbols when FOS is unavailable.
      if (route === "formations_full" && [400, 404, 500, 502, 503, 504].includes(response.status)) {
        await response.body?.cancel();
        await abortable(quota(env, key, controller.signal), controller.signal);
        url.pathname = "/formation/v2/formations_stop_based";
        response = await abortable(fetcher(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: controller.signal, redirect: "manual" }), controller.signal);
      }
      if (response.status === 401 || response.status === 403) return formationResult("auth-failed", "The formation API rejected its configured key. Timetable and operator evidence remains available.");
      if (response.status === 404 || response.status === 204) return formationResult("no-data", "The provider has no formation for this dated train. Timetable and operator rules still apply.");
      if (response.status === 429) { blockedUntil = Date.now() + 60_000; await coolDownApi(env, key); }
      if (!response.ok) { await response.body?.cancel(); return { ...formationResult("unavailable", "The formation provider could not supply this train (HTTP " + response.status + "). Timetable and operator rules still apply."), providerStatus: response.status }; }
      if (Number(response.headers.get("content-length")) > 2_000_000 || !response.body) throw new Error("Unavailable formation");
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const { value, done } = await abortable(reader.read(), controller.signal); if (done) break; size += value.length;
        if (size > 2_000_000) throw new Error("Formation too large"); chunks.push(value); } }
      finally { void reader.cancel().catch(() => {}); }
      const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
      const data = JSON.parse(new TextDecoder().decode(bytes).split(key).join("[REDACTED]"));
      if (cache.size >= 32) cache.delete(cache.keys().next().value!);
      if (activeKey === key) cache.set(cacheKey, { until: Date.now() + 30_000, data });
      return { ...parseFormation(data, ref), providerStatus: response.status };
    } catch { return formationResult("unavailable", "The formation check could not finish. Timetable and operator rules still apply; try refreshing this service."); }
    finally { clearTimeout(timer); parentSignal.removeEventListener("abort", abort); }
  };
}
