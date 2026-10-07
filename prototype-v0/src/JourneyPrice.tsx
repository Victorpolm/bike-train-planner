import { fareCardSummary, type FareProfile } from "./fares";
import type { TransitLeg } from "./routing";
import { useOnlineFare } from "./useOnlineFare";

export default function JourneyPrice({
  legs,
  profile,
  takeBikeOnTransit = true,
}: {
  legs: TransitLeg[];
  profile: FareProfile;
  takeBikeOnTransit?: boolean;
}) {
  const online = useOnlineFare(legs, profile, takeBikeOnTransit);
  const summary = fareCardSummary(legs, profile, online.quote, takeBikeOnTransit);
  return (
    <span className="journey-price">
      <b>{summary.price.startsWith("CHF") ? `Total · ${summary.price}` : summary.price}</b>
      {summary.price.startsWith("Passenger") ? (
        <small>{summary.detail}</small>
      ) : (
        !summary.price.startsWith("CHF") && online.message && <small>{online.message}</small>
      )}
    </span>
  );
}
