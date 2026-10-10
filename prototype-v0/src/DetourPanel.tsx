import type { HillPreferences } from "./hills";
import { useEffect, useMemo, useRef, useState } from "react";
import { CyclingClient } from "./cyclingClient";
import {
  detourTiming,
  nearestDetourStage,
  requestCyclingDetour,
  type DetourFacility,
  type DetourRoutes,
  type DetourStage,
} from "./cyclingDetour";
import { formatMinutes, STATION_BUFFER_MINUTES } from "./routing";
import type { CyclingPace } from "./cyclingPace";
import type { RoutePreference } from "./cyclingPreferences";
import type { AppliedCyclingEdit, EditContext } from "./cyclingEditor";
import { applyFacilityStop, facilityStopSteps } from "./facilityStops";
import { visitHours } from "./facilityHours";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
  day: "numeric",
  month: "short",
});
const signed = (value: number, unit: "min" | "km") =>
  `${value >= 0 ? "+" : "−"}${unit === "km" ? Math.abs(value).toFixed(1) : Math.ceil(Math.abs(value))} ${unit}`;
type Props = {
  context: EditContext | null;
  onApply: (edit: AppliedCyclingEdit) => void;
  facility: DetourFacility;
  stages: DetourStage[];
  pace?: CyclingPace;
  preference?: RoutePreference;
  hills?: HillPreferences;
  arriveBy?: string;
  onRoutes: (routes: DetourRoutes | null) => void;
  onClose: () => void;
};

export default function DetourPanel({
  context,
  onApply,
  facility,
  stages,
  pace,
  preference,
  hills,
  arriveBy,
  onRoutes,
  onClose,
}: Props) {
  const [stageId, setStageId] = useState(() => nearestDetourStage(stages, facility)?.id);
  const stage = stages.find((s) => s.id === stageId) ?? stages[0];
  const [visit, setVisit] = useState("5");
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Calculating cycling paths…");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    stageId: string;
    routes: DetourRoutes;
    warnings: string[];
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  useEffect(() => {
    if (!stage) return;
    const abort = new AbortController();
    controller.current = abort;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(60_000)]);
    const client = new CyclingClient(
      signal,
      fetch,
      500,
      true,
      fetch,
      pace,
      preference,
      undefined,
      hills,
    );
    setResult(null);
    onRoutes(null);
    setBusy(true);
    setStatus("Calculating only this cycling section…");
    void requestCyclingDetour(stage, facility, client, signal)
      .then((routes) => {
        if (abort.signal.aborted) return;
        setResult({ stageId: stage.id, routes, warnings: [...client.warnings] });
        onRoutes(routes);
        setStatus("Cycling detour ready.");
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        setStatus(
          signal.aborted
            ? "The cycling check took too long. Retry when ready; your journey is unchanged."
            : ([...client.failedLinks.values()][0]?.message ??
                (error instanceof Error
                  ? error.message
                  : "The cycling check failed. Please retry.")),
        );
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => {
      abort.abort();
      onRoutes(null);
    };
  }, [stage, facility, pace, preference, hills, attempt, onRoutes]);
  const visitMinutes = Number(visit);
  const validVisit =
    visit.trim() !== "" &&
    Number.isFinite(visitMinutes) &&
    visitMinutes >= 0 &&
    visitMinutes <= 180;
  const current = result?.stageId === stage?.id ? result : null;
  const timing = useMemo(
    () =>
      stage && current && validVisit ? detourTiming(stage, current.routes, visitMinutes) : null,
    [stage, current, validVisit, visitMinutes],
  );
  const assessment = useMemo(() => {
    if (!context || !stage || !current || !validVisit)
      return { edit: null, error: "Finish the cycling check and choose a valid stop duration." };
    try {
      return {
        edit: applyFacilityStop(context, stage, current.routes, facility, visitMinutes),
        error: "",
      };
    } catch (error) {
      return {
        edit: null,
        error: error instanceof Error ? error.message : "This stop could not be added.",
      };
    }
  }, [context, stage, current, validVisit, facility, visitMinutes]);
  const visits = assessment.edit && context ? facilityStopSteps(assessment.edit, context) : [];
  const existingVisits = new Set(
    context ? facilityStopSteps(context, context).map((s) => s.leg?.facilityVisit) : [],
  );
  const addedVisit = visits.find((s) => !existingVisits.has(s.leg?.facilityVisit));
  const arrival = assessment.edit?.journey
    ? new Date(+assessment.edit.journey.startTime + assessment.edit.journey.totalMinutes * 60_000)
    : assessment.edit?.cycling?.arrival;
  const departure = assessment.edit?.journey?.startTime ?? assessment.edit?.cycling?.departure;

  return (
    <section ref={panel} tabIndex={-1} className="detour-panel" aria-labelledby="detour-heading">
      <div className="detour-heading">
        <div>
          <span className="detour-eyebrow">Add a facility stop</span>
          <h3 id="detour-heading">Via {facility.name}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close cycling detour preview">
          Close
        </button>
      </div>
      <p>
        Preview the cycling detour and time at the stop. Add it when the connection and budget
        checks pass; the selected public-transport services stay fixed.
      </p>
      <div className="detour-fields">
        <label>
          Cycling section
          <select value={stage?.id ?? ""} onChange={(e) => setStageId(e.target.value)}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Time at the stop (minutes)
          <input
            type="number"
            min="0"
            max="180"
            step="1"
            value={visit}
            aria-invalid={!validVisit}
            onChange={(e) => setVisit(e.target.value)}
          />
        </label>
      </div>
      {!validVisit && <p role="alert">Choose a stop duration from 0 to 180 minutes.</p>}
      <p role="status" aria-live="polite">
        {status}
      </p>
      {busy ? (
        <button
          type="button"
          onClick={() => {
            controller.current?.abort();
            setBusy(false);
            setStatus("Check cancelled. Your journey is unchanged.");
          }}
        >
          Cancel check
        </button>
      ) : (
        !current && (
          <button type="button" onClick={() => setAttempt((a) => a + 1)}>
            Retry cycling check
          </button>
        )
      )}
      {timing && current && (
        <>
          <dl className="detour-metrics">
            <div>
              <dt>Distance change</dt>
              <dd>{signed(timing.addedKm, "km")}</dd>
            </div>
            <div>
              <dt>Travel time change</dt>
              <dd>{signed(timing.addedTravelMinutes, "min")}</dd>
            </div>
            <div>
              <dt>Including your stop</dt>
              <dd>{signed(timing.addedMinutes, "min")}</dd>
            </div>
          </dl>
          <p>
            At the facility around{" "}
            <b>{clock.format(addedVisit?.departure ?? timing.facilityArrival)}</b>. This section
            takes about {formatMinutes(timing.ridingMinutes)} travelling plus {visitMinutes} min at
            the stop.
          </p>
          {!assessment.edit &&
            arriveBy &&
            "arrival" in timing &&
            timing.arrival &&
            +timing.arrival > Date.parse(arriveBy) && (
              <p className="permission-warning">
                This detour would arrive after your chosen arrival time of{" "}
                {clock.format(new Date(arriveBy))}.
              </p>
            )}
          {assessment.edit && arrival && departure ? (
            <div className="detour-connection detour-kept" aria-live="polite">
              <p>
                <b>This stop fits the checked connections and your journey limits.</b>
              </p>
              <p>
                Leave {clock.format(departure)} → arrive {clock.format(arrival)}. Available time
                before leaving may be used for the stop.
              </p>
              {addedVisit && (
                <p>
                  {
                    visitHours(
                      facility.openingHours,
                      facility.seasonal,
                      addedVisit.departure!,
                      addedVisit.arrival!,
                    ).message
                  }
                </p>
              )}
            </div>
          ) : (
            <div className={`detour-connection detour-${timing.status}`} aria-live="polite">
              {timing.status === "kept" && (
                <p>
                  <b>
                    The same {timing.nextService} at {clock.format(timing.nextDeparture)} still fits
                    the estimate.
                  </b>{" "}
                  About {Math.floor(timing.marginMinutes)} min remain after the transfer and
                  boarding check. Destination arrival stays {clock.format(timing.arrival!)}.
                </p>
              )}
              {timing.status === "missed" && (
                <p>
                  <b>This detour does not fit the selected connection.</b> You need about{" "}
                  {Math.ceil(-timing.marginMinutes)} more minutes to catch {timing.nextService} at{" "}
                  {clock.format(timing.nextDeparture)} after allowing for transfer and boarding
                  time. Shorten the stop or choose another facility. No replacement service has been
                  searched.
                </p>
              )}
              {timing.status === "unknown" && (
                <p>
                  <b>Connection timing cannot be checked.</b> Some onward leg details are missing.
                  Do not assume this detour fits the selected service.
                </p>
              )}
              {(timing.status === "kept" || timing.status === "missed") && (
                <p className="detour-note">{timing.boardingNote}</p>
              )}
              {timing.status === "no-connection" && (
                <p>
                  No onward public-transport connection to catch. Estimated destination arrival with
                  this detour: <b>{clock.format(timing.arrival)}</b>.
                </p>
              )}
            </div>
          )}
          {!assessment.edit && (
            <p className="permission-warning" role="status">
              Cannot add this stop: {assessment.error}
            </p>
          )}
          <button
            type="button"
            className="facility-apply-button"
            disabled={!assessment.edit || busy}
            onClick={() => {
              if (assessment.edit) onApply(assessment.edit);
            }}
          >
            Add as stop · {visitMinutes} min
          </button>
          <p className="detour-note">
            Adding updates the selected itinerary, map, times and transport-price eligibility.
            Purchases and parking fees are separate. You can add another stop or restore the
            original route. A parking visit continues with your bicycle.
          </p>
          <p>
            The dashed purple path is the preview. Other cycling sections, intermediate stops and
            transit legs stay as selected.
          </p>
          <p>
            {facility.note ??
              "The route reaches the mapped location; check access and opening hours."}{" "}
            {timing.facilityGapM > 1 && (
              <>
                The nearest routed path is up to {Math.ceil(timing.facilityGapM)} m from this pin;
                estimated walking connectors are included.
              </>
            )}
          </p>
          <p className="detour-source">
            Cycling: {Array.from(new Set(current.routes.map((r) => r.source))).join(" + ")}. Travel
            times include mapped pushing, carrying and endpoint connectors where known. Indoor
            walking is not estimated.
          </p>
          {current.warnings.map((warning) => (
            <p key={warning} className="detour-source">
              {warning}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
