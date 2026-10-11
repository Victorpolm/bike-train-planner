import { useEffect, useState } from "react";
import type { TransitLeg } from "./routing.ts";
import type { FareProfile } from "./fares.ts";
import { onlineFareRequest, requestOnlineFare, type OnlineFareState } from "./onlineFareClient.ts";
import { EXPERIMENTAL_FARES_ENABLED, EXPERIMENTAL_FARE_NOTICE } from "./sourcePolicy.ts";

export function useOnlineFare(legs: TransitLeg[], profile: FareProfile, takeBikeOnTransit = true): OnlineFareState {
  const { key, past } = onlineFareRequest(legs, profile, takeBikeOnTransit);
  const [state, setState] = useState<OnlineFareState & { key: string }>({ key: "", message: "" });
  useEffect(() => {
    if (!key || !EXPERIMENTAL_FARES_ENABLED) return;
    let active = true;
    requestOnlineFare(key).then(value => { if (active) setState({ ...value, key }); });
    return () => { active = false; };
  }, [key]);
  if (!EXPERIMENTAL_FARES_ENABLED) return { message: EXPERIMENTAL_FARE_NOTICE };
  return !key ? { message: past ? "Online fares are available for future departures only; historical fares cannot be quoted." : "" } : state.key === key ? state : { message: "Checking online fare…" };
}
