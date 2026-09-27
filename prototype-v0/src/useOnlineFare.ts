import { useEffect, useState } from "react";
import { fareQuery, type OnlineFare } from "./onlineFare.ts";
import type { TransitLeg } from "./routing.ts";
import { fareSummary, type FareProfile } from "./fares.ts";

type State = { quote?: OnlineFare; message: string };
const cache = new Map<string, { expires: number; promise: Promise<State> }>();
let queue: Promise<unknown> = Promise.resolve();
let status: { expires: number; promise: Promise<boolean> } | undefined;
async function connected() {
  if (!status || status.expires <= Date.now()) status = { expires: Date.now() + 30000,
    promise: fetch("/api/fares/status", { signal: AbortSignal.timeout(5000) }).then(async r => r.ok && (await r.json()).available === true).catch(() => false) };
  return status.promise;
}
export function useOnlineFare(legs: TransitLeg[], profile: FareProfile): State {
  const query = fareQuery(legs, profile), prohibited = fareSummary(legs, profile).prohibited;
  const key = query && !prohibited && !(profile.passenger === "ga" && profile.annualBikePass) ? JSON.stringify(query) : "";
  const [state, setState] = useState<State & { key: string }>({ key: "", message: "" });
  useEffect(() => {
    if (!key) return;
    let active = true;
    let entry = cache.get(key);
    if (!entry || entry.expires <= Date.now()) {
      const promise = queue.then(async (): Promise<State> => {
        if (!await connected()) return { message: "Online fares are not connected yet." };
        try {
          const response = await fetch("/api/fares/quote", { method: "POST", headers: { "Content-Type": "application/json" },
            body: key, signal: AbortSignal.timeout(60000) });
          if (!response.ok) return { message: "Online fare unavailable; operator quote needed." };
          const quote = await response.json() as OnlineFare;
          return { quote, message: quote.passenger || quote.bicycle ? "OJP test fare estimate · confirm before purchase" : quote.reason ?? "No online fare returned." };
        } catch { return { message: "Online fare unavailable; operator quote needed." }; }
      });
      queue = promise.catch(() => {});
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      entry = { expires: Date.now() + 300000, promise }; cache.set(key, entry);
    }
    entry.promise.then(value => { if (active) setState({ ...value, key }); });
    return () => { active = false; };
  }, [key]);
  return !key ? { message: "" } : state.key === key ? state : { message: "Checking online fare…" };
}
