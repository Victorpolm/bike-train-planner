import { useEffect, useState } from "react";
import { fareQuery, type OnlineFare } from "./onlineFare.ts";
import type { TransitLeg } from "./routing.ts";
import { fareSummary, type FareProfile } from "./fares.ts";
import { fetchJson, HttpError } from "./http.ts";

type State = { quote?: OnlineFare; message: string };
const cache = new Map<string, { expires: number; promise: Promise<State> }>();
let queue: Promise<unknown> = Promise.resolve();
export function useOnlineFare(legs: TransitLeg[], profile: FareProfile): State {
  const query = fareQuery(legs, profile), prohibited = fareSummary(legs, profile).prohibited;
  const past = !!query && query.segments.some(segment => Date.parse(segment.departure) <= Date.now());
  const key = query && !past && !prohibited && !(profile.passenger === "ga" && profile.annualBikePass) ? JSON.stringify(query) : "";
  const [state, setState] = useState<State & { key: string }>({ key: "", message: "" });
  useEffect(() => {
    if (!key) return;
    let active = true;
    let entry = cache.get(key);
    if (!entry || entry.expires <= Date.now()) {
      const promise = queue.then(async (): Promise<State> => {
        try {
          // The quote endpoint itself reports missing configuration. A separate
          // five-second status check used to suppress valid, slower requests.
          const quote = await fetchJson<OnlineFare>("/api/fares/quote", undefined, 60000, fetch,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: key });
          return { quote, message: quote.passenger || quote.bicycle ? "OJP test fare estimate · confirm before purchase" : quote.reason ?? "No online fare returned." };
        } catch (error) { return { message: error instanceof HttpError && error.status === 503
          ? "Online fares are not connected yet." : "Online fare unavailable; operator quote needed." }; }
      });
      queue = promise.catch(() => {});
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      entry = { expires: Date.now() + 300000, promise }; cache.set(key, entry);
      const current = entry;
      void promise.then(value => { current.expires = Date.now() + (value.quote?.passenger || value.quote?.bicycle ? 300000 : 30000); });
    }
    entry.promise.then(value => { if (active) setState({ ...value, key }); });
    return () => { active = false; };
  }, [key]);
  return !key ? { message: past ? "Online fares are available for future departures only; historical fares cannot be quoted." : "" } : state.key === key ? state : { message: "Checking online fare…" };
}
