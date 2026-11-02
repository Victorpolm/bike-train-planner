import { bicycleStatus } from "../bicycleStatus";
import type { TransitLeg } from "../routing";
import type { TravelProfile } from "../travelProfile";

export default function BicycleServiceStatus({
  leg,
  profile,
}: {
  leg: TransitLeg;
  profile?: TravelProfile;
}) {
  const status = bicycleStatus(leg, profile);
  return (
    <span className={`bicycle-service-status bicycle-service-${status.icon}`}>
      <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true" focusable="false">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="19" r="6" />
          <circle cx="28" cy="19" r="6" />
          <path d="m8 19 7-11 7 11H8m7-11h9l4 11M12 5h6m4-2h4l-2 5" />
          {status.icon === "prohibited" && <path d="M2 2 35 26" strokeWidth="3" />}
        </g>
        {status.icon === "reservation" && (
          <text x="30" y="10" fill="currentColor" fontSize="12" fontWeight="bold">
            R
          </text>
        )}
        {status.icon === "unverified" && (
          <text x="31" y="10" fill="currentColor" fontSize="12" fontWeight="bold">
            ?
          </text>
        )}
      </svg>
      <strong>{status.title}</strong>
      {status.reservationBasis && (
        <small title={status.reservationBasis.explanation}>ⓘ {status.reservationBasis.label}</small>
      )}
    </span>
  );
}
