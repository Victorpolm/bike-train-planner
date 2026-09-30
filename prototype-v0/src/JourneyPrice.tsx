import { fareCardSummary, fareRows, type FareProfile } from "./fares";
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
  const { fare, rows } = fareRows(legs, profile, online.quote),
    summary = fareCardSummary(legs, profile, online.quote);
  return (
    <span className="journey-price">
      {fare.prohibited ? (
        <b>{summary.price}</b>
      ) : (
        <>
          {rows.map((row) => (
            <span className="fare-card-row" key={row.label}>
              <span>{row.label}</span>
              <b>{row.value}</b>
              <small>{row.detail}</small>
            </span>
          ))}
          <b>{summary.price}</b>
        </>
      )}
      <small>{summary.detail}</small>
      {!fare.prohibited && online.message && !fare.online && <small>{online.message}</small>}
    </span>
  );
}
