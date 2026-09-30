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
  facility: DetourFacility;
  stages: DetourStage[];
  pace?: CyclingPace;
  preference?: RoutePreference;
  onRoutes: (routes: DetourRoutes | null) => void;
  onClose: () => void;
};

export default function DetourPanel({
  facility,
  stages,
  pace,
  preference,
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
    const client = new CyclingClient(signal, fetch, 500, true, fetch, pace, preference);
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
  }, [stage, facility, pace, preference, attempt, onRoutes]);
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

  return (
    <section ref={panel} tabIndex={-1} className="detour-panel" aria-labelledby="detour-heading">
      <div className="detour-heading">
        <div>
          <span className="detour-eyebrow">Cycling detour preview</span>
          <h3 id="detour-heading">Via {facility.name}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close cycling detour preview">
          Close
        </button>
      </div>
      <p>
        The selected public-transport services stay fixed. Journey cards and prices continue to
        describe the original route.
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
            At the facility around <b>{clock.format(timing.facilityArrival)}</b>. This section takes
            about {formatMinutes(timing.ridingMinutes)} travelling plus {visitMinutes} min at the
            stop.
          </p>
          <div className={`detour-connection detour-${timing.status}`} aria-live="polite">
            {timing.status === "kept" && (
              <p>
                <b>
                  The same {timing.nextService} at {clock.format(timing.nextDeparture)} still fits
                  the estimate.
                </b>{" "}
                About {Math.floor(timing.marginMinutes)} min remain after the{" "}
                {STATION_BUFFER_MINUTES}-minute boarding buffer. Destination arrival stays{" "}
                {clock.format(timing.arrival!)}.
              </p>
            )}
            {timing.status === "missed" && (
              <p>
                <b>This detour does not fit the selected connection.</b> You need about{" "}
                {Math.ceil(-timing.marginMinutes)} more minutes to catch {timing.nextService} at{" "}
                {clock.format(timing.nextDeparture)} with the {STATION_BUFFER_MINUTES}-minute
                boarding buffer. Shorten the stop or choose another facility. No replacement service
                has been searched.
              </p>
            )}
            {timing.status === "unknown" && (
              <p>
                <b>Connection timing cannot be checked.</b> Some onward leg details are missing. Do
                not assume this detour fits the selected service.
              </p>
            )}
            {timing.status === "no-connection" && (
              <p>
                No onward public-transport connection to catch. Estimated destination arrival with
                this detour: <b>{clock.format(timing.arrival)}</b>.
              </p>
            )}
          </div>
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
