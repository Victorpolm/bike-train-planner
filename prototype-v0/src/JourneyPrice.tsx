import { fareCardSummary, type FareProfile } from "./fares";
import type { TransitLeg } from "./routing";

export default function JourneyPrice({ legs, profile }: { legs: TransitLeg[]; profile: FareProfile }) {
  const summary = fareCardSummary(legs, profile);
  return <span className="journey-price"><b>{summary.price}</b><small>{summary.detail}</small></span>;
}
