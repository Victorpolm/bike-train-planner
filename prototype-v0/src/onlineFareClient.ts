import { fareQuery, type OnlineFare } from "./onlineFare.ts";
import type { TransitLeg } from "./routing.ts";
import type { FareProfile } from "./fares.ts";
import { fetchJson, HttpError } from "./http.ts";

export type OnlineFareState = { quote?: OnlineFare; message: string };
const cache = new Map<string, { expires: number; promise: Promise<OnlineFareState> }>();
let queue: Promise<unknown> = Promise.resolve();
export function onlineFareRequest(legs: TransitLeg[], profile: FareProfile, takeBikeOnTransit = true, now = Date.now()) {
  const query = fareQuery(legs, profile, takeBikeOnTransit);
  const past = !!query && query.segments.some(segment => Date.parse(segment.departure) <= now);
  return { key: query && !past && !(profile.passenger === "ga" && !query.bicycle) ? JSON.stringify(query) : "", past };
}
// Cards and objective comparison share one bounded, serialized request cache.
export function requestOnlineFare(key: string, fetcher: typeof fetch = fetch): Promise<OnlineFareState> {
  let entry = cache.get(key);
  if (!entry || entry.expires <= Date.now()) {
    const promise = queue.then(async (): Promise<OnlineFareState> => {
      try {
        const quote = await fetchJson<OnlineFare>("/api/fares/quote", undefined, 60000, fetcher,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: key });
        return { quote, message: quote.passenger || quote.bicycle ? "OJP test fare estimate · confirm before purchase" : quote.reason ?? "No online fare returned." };
      } catch (error) { return { message: error instanceof HttpError && error.status === 503
        ? "Online fares are not connected yet." : "Online fare unavailable; operator quote needed." }; }
    });
    queue = promise.catch(() => {});
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    entry = { expires: Infinity, promise }; cache.set(key, entry);
    const current = entry;
    void promise.then(value => { current.expires = Date.now() + (value.quote?.passenger || value.quote?.bicycle ? 300000 : 30000); });
  }
  return entry.promise;
}
