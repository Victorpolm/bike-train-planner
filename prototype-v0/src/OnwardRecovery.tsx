import { useEffect, useMemo, useRef, useState } from "react";
import { plan, type SearchSession } from "./api";
import { confirmedOnwardRequest, navigationTrip, type NavigationInput } from "./navigation";
import { type Journey } from "./routing";
import { fareCardSummary, DEFAULT_FARE_PROFILE } from "./fares";
import { journeyTiming } from "./journeyTiming";
import JourneyTimeSummary from "./ui/JourneyTimeSummary";
export type RecoveryRequest = ReturnType<typeof confirmedOnwardRequest>;
export default function OnwardRecovery({
  trip,
  disabled,
  onAccept,
}: {
  trip: NavigationInput;
  disabled: boolean;
  onAccept: (session: SearchSession, journey: Journey, request: RecoveryRequest) => void;
}) {
  const nav = useMemo(() => navigationTrip(trip), [trip]);
  const [stage, setStage] = useState(-1),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState("");
  const [result, setResult] = useState<{
      session: SearchSession;
      request: RecoveryRequest;
      journeys: Journey[];
    } | null>(null),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  // Parent keys the component by selected itinerary and profile; ordinary live refreshes keep choices stable.
  useEffect(() => () => controller.current?.abort(), []);
  function reset() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setResult(null);
    setConfirmed(false);
    setMessage("");
  }
  async function search() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setResult(null);
    setBusy(true);
    try {
      const request = confirmedOnwardRequest(nav, stage, confirmed);
      setMessage("Finding up to three onward options within your remaining limits…");
      const session = await plan(
        request.origin,
        request.destination,
        request.mode,
        request.options,
        abort.signal,
        (m) => {
          if (!abort.signal.aborted) setMessage(m);
        },
        () => {},
        { start: request.start, waypoints: request.waypoints },
      );
      if (abort.signal.aborted) return;
      const journeys = (
        request.mode === "extended" ? (session.extended ?? session.baseline) : session.baseline
      ).journeys
        .slice(0, 3)
        .map((j) => ({ ...j, recovery: request.recovery }));
      setResult({ session, request, journeys });
      setMessage(
        journeys.length
          ? "Review an onward journey. Your original route remains selected until you choose one."
          : "No onward journey was found within the remaining limits. Your original journey is kept; change limits in Plan if needed.",
      );
    } catch (error) {
      if (!abort.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "Onward search failed. Your original journey is kept.",
        );
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <section className="onward-recovery" aria-label="Onward recovery">
      <h3>Find an onward connection</h3>
      <p>
        Choose where you are now. Completed riding, boardings, bicycle placement and remaining stops
        stay part of the journey limits. New tickets may be needed.
      </p>
      <label>
        Current boarding stop
        <select
          value={stage}
          disabled={disabled}
          onChange={(e) => {
            reset();
            setStage(Number(e.target.value));
          }}
        >
          <option value={-1}>Choose a stop</option>
          {nav.stages.map((s, i) =>
            s.mode === "transit" && s.leg?.fromPoint ? (
              <option key={i} value={i}>
                {s.from} · before {s.title}
              </option>
            ) : null,
          )}
        </select>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={disabled || stage < 0}
          onChange={(e) => {
            controller.current?.abort();
            setBusy(false);
            setResult(null);
            setConfirmed(e.target.checked);
          }}
        />
        I am at this stop, off the vehicle, and have completed the preceding sections.
      </label>
      <button type="button" disabled={disabled || busy || !confirmed} onClick={() => void search()}>
        Find onward options
      </button>
      {busy && (
        <button type="button" onClick={reset}>
          Cancel search
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {result?.journeys.map((j) => {
        const fare = fareCardSummary(
          j.transitLegs,
          trip.options.fareProfile ?? DEFAULT_FARE_PROFILE,
          undefined,
          result.request.options.takeBikeOnTransit !== false,
        );
        return (
          <article className="onward-choice" key={j.id}>
            <JourneyTimeSummary
              timing={journeyTiming(
                j,
                result.request.options.boardingMinutes,
                result.request.start,
              )}
              requestedStart={result.request.start}
            />
            <p>
              {j.services.join(" → ")} · {fare.price}. {fare.detail}
            </p>
            <button
              type="button"
              disabled={disabled || Date.now() - +result.request.start > 120000}
              onClick={() => onAccept(result.session, j, result.request)}
            >
              Use this onward journey
            </button>
          </article>
        );
      })}
      {result && Date.now() - +result.request.start > 120000 && (
        <p>Options are older than two minutes. Search again before choosing.</p>
      )}
    </section>
  );
}
