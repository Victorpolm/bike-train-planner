import type { JourneyTiming } from "../journeyTiming";
import { formatMinutes } from "../routing";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  day: "numeric",
  month: "short",
});

export default function JourneyTimeSummary({
  timing,
  requestedStart,
  arriveBy,
  details = false,
}: {
  timing: JourneyTiming;
  requestedStart: Date;
  arriveBy?: string;
  details?: boolean;
}) {
  const { departure, arrival } = timing;
  return (
    <span className="journey-time-summary">
      <span className="journey-time-range">
        Leave <b>{clock.format(departure)}</b>
        {day.format(departure) !== day.format(requestedStart) && ` · ${day.format(departure)}`}
        {" → "}Arrive <b>{clock.format(arrival)}</b>
        {day.format(arrival) !== day.format(departure) && ` · ${day.format(arrival)}`}
      </span>
      <strong>{formatMinutes(timing.journeyMinutes)} journey</strong>
      {!arriveBy && timing.beforeDepartureMinutes >= 1 && (
        <span className="departure-wait">
          {formatMinutes(timing.beforeDepartureMinutes)} before leaving, from your requested{" "}
          {clock.format(requestedStart)}
        </span>
      )}
      {details && (
        <>
          <span>
            Cycling ≈ {formatMinutes(timing.cyclingMinutes)} · Walking{" "}
            {formatMinutes(timing.walkingMinutes)} · On board {formatMinutes(timing.transitMinutes)}{" "}
            · Connections/boarding {formatMinutes(timing.connectionMinutes)}
            {timing.stopMinutes > 0 && <> · Facility stops {formatMinutes(timing.stopMinutes)}</>}
          </span>
          <span>Journey duration includes all walking, platform access and connection waits.</span>
          {!arriveBy && (
            <span>
              From requested departure to arrival: {formatMinutes(timing.elapsedMinutes)}.
            </span>
          )}
          {arriveBy && (
            <span>
              Arrive by {clock.format(new Date(arriveBy))} · {day.format(new Date(arriveBy))}.
            </span>
          )}
        </>
      )}
    </span>
  );
}
