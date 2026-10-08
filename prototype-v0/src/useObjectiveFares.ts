import { useEffect, useMemo, useState } from "react";
import type { FareProfile } from "./fares.ts";
import type { OnlineFare } from "./onlineFare.ts";
import { requestOnlineFare } from "./onlineFareClient.ts";
import { objectiveFareRequests, type ObjectiveJourneyPool } from "./objectiveFares.ts";

export function useObjectiveFares(pools: ObjectiveJourneyPool[], profile: FareProfile, enabled: boolean) {
  const requests = objectiveFareRequests(pools, profile);
  const key = enabled ? JSON.stringify(requests.keys) : "";
  const [quotes, setQuotes] = useState<Map<string, OnlineFare>>(new Map());
  const [progress, setProgress] = useState({ key: "", checked: 0, total: 0 });
  useEffect(() => {
    if (!key) return;
    let active = true;
    const keys: string[] = JSON.parse(key);
    setProgress({ key, checked: 0, total: keys.length });
    void (async () => {
      // Schedule one at a time so changing the trip/profile stops further work.
      for (let i = 0; i < keys.length && active; i++) {
        const quote = (await requestOnlineFare(keys[i])).quote;
        if (!active) return;
        setQuotes(previous => {
          const next = new Map(previous);
          if (quote) next.set(keys[i], quote); else next.delete(keys[i]);
          while (next.size > 128) next.delete(next.keys().next().value!);
          return next;
        });
        setProgress({ key, checked: i + 1, total: keys.length });
      }
    })();
    return () => { active = false; };
  }, [key]);
  const current = progress.key === key ? progress : { checked: 0, total: requests.keys.length };
  return { context: useMemo(() => ({ profile, quotes }), [profile, quotes]),
    checked: current.checked, total: current.total, eligible: requests.eligible,
    loading: enabled && current.checked < current.total };
}
