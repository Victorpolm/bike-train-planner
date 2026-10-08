import { useEffect, useState } from "react";
import type { TransitLeg } from "./routing.ts";
import type { FareProfile } from "./fares.ts";
import { onlineFareRequest, requestOnlineFare, type OnlineFareState } from "./onlineFareClient.ts";

export function useOnlineFare(legs: TransitLeg[], profile: FareProfile, takeBikeOnTransit = true): OnlineFareState {
  const { key, past } = onlineFareRequest(legs, profile, takeBikeOnTransit);
  const [state, setState] = useState<OnlineFareState & { key: string }>({ key: "", message: "" });
  useEffect(() => {
    if (!key) return;
    let active = true;
    requestOnlineFare(key).then(value => { if (active) setState({ ...value, key }); });
    return () => { active = false; };
  }, [key]);
  return !key ? { message: past ? "Online fares are available for future departures only; historical fares cannot be quoted." : "" } : state.key === key ? state : { message: "Checking online fare…" };
}
