import { fareCardSummary, type FareProfile } from "./fares";
import type { TransitLeg } from "./routing";
import { useOnlineFare } from "./useOnlineFare";

export default function JourneyPrice({
  legs,
  profile,
}: {
  legs: TransitLeg[];
  profile: FareProfile;
}) {
  const online = useOnlineFare(legs, profile);
  const summary = fareCardSummary(legs, profile, online.quote);
  return (
    <span className="journey-price">
      <b>{summary.price.startsWith("CHF") ? `Total · ${summary.price}` : summary.price}</b>
    </span>
  );
}
