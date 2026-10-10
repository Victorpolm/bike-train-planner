import type { JourneyNavigation as Navigation } from "./useJourneyNavigation";
import type { RealtimeJourneyState } from "./useRealtimeJourney";
import {
  navigationConnection,
  navigationReplan,
  navigationRide,
  remainingMinutes,
} from "./navigation";
import { arrivalTime, effectivePlatform, realtimeStale, realtimeUnavailable } from "./realtime";
import { usableFix } from "./locationTracking";
import { formatMinutes } from "./routing";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
});
export default function JourneyNavigation({
  navigation: nav,
  canStart,
  busy,
  realtime,
  onStart,
  onRecalculate,
  onMap,
}: {
  navigation: Navigation;
  canStart: boolean;
  busy: boolean;
  realtime: RealtimeJourneyState;
  onStart: () => void;
  onRecalculate: () => void;
  onMap: () => void;
}) {
  const active = nav.following;
  if (!active)
    return (
      <section className="navigation-panel" aria-label="Follow your journey">
        <div className="navigation-heading">
          <strong>Follow your journey</strong>
          <button
            className="navigation-primary"
            type="button"
            disabled={!canStart || busy}
            onClick={onStart}
          >
            Start
          </button>
        </div>
        <p>Start asks for your phone’s location. Keep the app open to follow the route.</p>
        {nav.notice && <p role="status">{nav.notice}</p>}
        <details>
          <summary>Location and privacy</summary>
          <p>
            Tracking stays on this device and no GPS history is saved. Recalculate sends your
            current position to the route providers. Map tiles load around the viewed area.
            Following pauses when the app is hidden or your phone locks; there are no voice
            directions.
          </p>
        </details>
      </section>
    );
  const { trip, index, onboard, progress } = active;
  const stage = trip.stages[index];
  const fresh = usableFix(nav.location.fix, nav.now);
  const onPath = fresh && progress && progress.offSince === null;
  const connection = navigationConnection(
    trip,
    index,
    onboard,
    progress,
    realtime.journey,
    nav.location.fix,
    nav.now,
  );
  const ride = onboard ? navigationRide(stage, realtime.journey) : null;
  let replanReason = "";
  try {
    navigationReplan(trip, index, onboard, progress, nav.location.fix, nav.now);
  } catch (error) {
    replanReason = error instanceof Error ? error.message : "Recalculation is unavailable.";
  }
  const label =
    stage.mode === "transit"
      ? onboard
        ? "On board"
        : "Board when ready"
      : stage.mode === "bike"
        ? "Cycle"
        : stage.mode === "walk"
          ? "Walk"
          : "Follow the itinerary";
  const confirm =
    stage.mode === "transit"
      ? onboard
        ? "I’ve alighted"
        : "I’m on board"
      : index === trip.stages.length - 1
        ? "I’ve arrived · Finish"
        : "Section completed";
  return (
    <section className="navigation-panel navigation-active" aria-label="Journey following">
      <div className="navigation-heading">
        <strong>
          {label} · {index + 1}/{trip.stages.length}
        </strong>
        <button type="button" onClick={() => nav.stop()}>
          Stop
        </button>
      </div>
      <p className="navigation-destination">
        {stage.mode === "transit" ? `${stage.title} → ${stage.to}` : `To ${stage.to}`}
      </p>
      <div className="navigation-signal" role="status">
        {nav.location.message ||
          (nav.location.fix
            ? fresh
              ? `Location accuracy ±${Math.ceil(nav.location.fix.accuracy)} m`
              : "Location is old or imprecise. Waiting for a fresh signal; estimates are paused."
            : "Waiting for location…")}
      </div>
      {(nav.location.status === "error" || (nav.location.fix && !fresh)) && (
        <div className="navigation-actions">
          <button type="button" onClick={nav.retry}>
            Retry location
          </button>
          <a href={window.location.origin} target="_blank" rel="noreferrer">
            Open full planner
          </a>
        </div>
      )}
      {onPath && stage.lengthM > 0 && (
        <p>
          <strong>
            {((stage.lengthM - progress.distanceM + stage.endGapM) / 1000).toFixed(1)} km left
          </strong>
          {" · ≈ "}
          {formatMinutes(Math.ceil(remainingMinutes(stage, progress)))} at the planned pace
          {stage.lengthM - progress.distanceM + stage.endGapM < 40 && (
            <span> · Near the end: confirm when you arrive.</span>
          )}
        </p>
      )}
      {stage.endGapM > 25 && (
        <small>
          The mapped path ends about {Math.ceil(stage.endGapM)} m before the selected point. Final
          access is approximate; follow local signs.
        </small>
      )}
      {!["transit", "unknown"].includes(stage.mode) && !stage.path.length && (
        <p>
          Detailed path unavailable for this section. Follow station signs and confirm when
          completed.
        </p>
      )}
      {fresh && progress?.offRoute && (
        <p className="navigation-warning" role="status">
          You appear to be off the route. Return to it or recalculate from here.
        </p>
      )}
      <div className="navigation-actions">
        <button className="navigation-primary" type="button" disabled={busy} onClick={nav.confirm}>
          {confirm}
        </button>
        <button
          type="button"
          disabled={!nav.location.fix}
          onClick={() => {
            nav.recenter();
            onMap();
          }}
        >
          {nav.map.following ? "Recenter" : "Follow my position"}
        </button>
      </div>
      {ride && (
        <div className="navigation-connection">
          <strong>
            {ride.service} → {ride.to}
          </strong>
          <p>
            {arrivalTime(ride)
              ? `Arrival ${clock.format(arrivalTime(ride)!)}`
              : "Arrival time unknown"}
            {effectivePlatform(ride, "arrival")
              ? ` · Platform ${effectivePlatform(ride, "arrival")}`
              : " · Platform unknown"}
          </p>
          {ride.realtime?.estimatedArrival && ride.arrival && (
            <small>
              {Math.round((+new Date(ride.realtime.estimatedArrival) - +ride.arrival) / 60000) > 0
                ? `+${Math.round((+new Date(ride.realtime.estimatedArrival) - +ride.arrival) / 60000)} min arrival delay`
                : "Arrival estimate updated"}
            </small>
          )}
          {realtimeUnavailable(ride) && (
            <p className="navigation-warning">
              Service or stop cancelled. Check the onboard information.
            </p>
          )}
          {ride.realtime?.undefinedDelay && (
            <p className="navigation-warning">Delay duration is unknown.</p>
          )}
          <small>
            {!ride.realtime || realtimeStale(ride.realtime, nav.now)
              ? "Live update unavailable or outdated. Check onboard information."
              : "Using the latest available transit update."}
          </small>
        </div>
      )}
      {connection && (
        <div className="navigation-connection">
          <strong>
            Next: {connection.service}
            {connection.departure ? ` · ${clock.format(connection.departure)}` : ""}
          </strong>
          {connection.delayMinutes !== null && (
            <small>
              {connection.delayMinutes > 0
                ? `+${connection.delayMinutes} min delay`
                : connection.delayMinutes < 0
                  ? `${connection.delayMinutes} min earlier`
                  : "No departure delay reported"}
            </small>
          )}
          <p>
            {connection.station}
            {connection.platform ? ` · Platform ${connection.platform}` : " · Platform unknown"}
          </p>
          {connection.stationArrival && (
            <p>Estimated at station: {clock.format(connection.stationArrival)}</p>
          )}
          {connection.unavailable ? (
            <p className="navigation-warning">
              This service or your stop is cancelled. Check another journey.
            </p>
          ) : connection.unknownDelay ? (
            <p className="navigation-warning">
              Delay duration is unknown. Check station information.
            </p>
          ) : (
            connection.slackMinutes !== null && (
              <p className={connection.slackMinutes < 3 ? "navigation-warning" : ""}>
                {connection.slackMinutes < 0
                  ? "You may miss this connection after the boarding allowance."
                  : `≈ ${Math.floor(connection.slackMinutes)} min spare after the boarding allowance.`}
              </p>
            )
          )}
          <small>
            {connection.stale
              ? "Live times unavailable or older than 2 minutes; check the station display."
              : "Using the latest available transit update."}
          </small>
          <details>
            <summary>Boarding allowance</summary>
            <p>{connection.allowance}</p>
          </details>
        </div>
      )}
      {!!realtime.issues.length && (
        <details className="navigation-warning">
          <summary>Transit alerts ({realtime.issues.length})</summary>
          {realtime.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </details>
      )}
      {realtime.failed && (
        <p className="navigation-warning">
          Live transit refresh failed. Last known times may be outdated.
        </p>
      )}
      <div className="navigation-actions">
        <button type="button" disabled={busy || !!replanReason} onClick={onRecalculate}>
          {busy ? "Recalculating…" : "Recalculate from here"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={nav.keepAwake}
            onChange={(e) => nav.setKeepAwake(e.target.checked)}
          />{" "}
          Keep screen awake
        </label>
      </div>
      {replanReason && <small>{replanReason}</small>}
      {nav.keepAwake && (
        <small>
          {nav.awake === "on"
            ? "Screen kept awake while the app is visible."
            : nav.awake === "requesting"
              ? "Requesting screen wake lock…"
              : "Screen wake lock is unavailable or released. Your phone may lock."}
        </small>
      )}
      <details>
        <summary>Adjust current stage</summary>
        <p>Earlier stages count as completed, including requested stops at their ends.</p>
        <label>
          Current stage{" "}
          <select
            value={index}
            disabled={busy}
            onChange={(e) => nav.setStage(Number(e.target.value))}
          >
            {trip.stages.map((s, i) => (
              <option key={i} value={i}>
                {i + 1}. {s.title} → {s.to}
              </option>
            ))}
          </select>
        </label>
        {onboard && (
          <button type="button" onClick={() => nav.setStage(index)}>
            I haven’t boarded yet
          </button>
        )}
      </details>
      <small>
        Confirm each stage when completed. Keep the app visible; following pauses when hidden.
      </small>
    </section>
  );
}
