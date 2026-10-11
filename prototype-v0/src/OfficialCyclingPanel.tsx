import { useEffect, useRef, useState } from "react";
import { CyclingClient } from "./cyclingClient";
import {
  checkOfficialOption,
  applyOfficialOption,
  requestOfficialData,
  type CheckedOfficialOption,
} from "./officialCyclingClient";
import {
  officialBounds,
  officialSections,
  OFFICIAL_CYCLING_ATTRIBUTION,
  OFFICIAL_CYCLING_MAP,
  type OfficialSection,
} from "./officialCycling";
import type { DetourStage } from "./cyclingDetour";
import { type AppliedCyclingEdit, type EditContext } from "./cyclingEditor";
import { formatMinutes, type Point } from "./routing";
import InlineHelp from "./ui/InlineHelp";

export default function OfficialCyclingPanel({
  stages,
  context,
  onApply,
  onClose,
  onPreview,
}: {
  stages: DetourStage[];
  context: EditContext;
  onApply(edit: AppliedCyclingEdit): void;
  onClose(): void;
  onPreview(lines: readonly (readonly Point[])[]): void;
}) {
  const [stageId, setStageId] = useState(stages[0]?.id);
  const stage = stages.find((s) => s.id === stageId) ?? stages[0];
  const [sections, setSections] = useState<OfficialSection[]>([]);
  const [checked, setChecked] = useState<CheckedOfficialOption | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const preview = useRef(onPreview);
  preview.current = onPreview;
  useEffect(
    () => () => {
      controller.current?.abort();
      preview.current([]);
    },
    [],
  );
  function reset() {
    controller.current?.abort();
    setSections([]);
    setChecked(null);
    setStatus("");
    setLoaded(false);
    setBusy(false);
    onPreview([]);
  }
  async function discover() {
    if (!stage) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setChecked(null);
    setStatus("Finding official cycling routes near this section…");
    onPreview([]);
    try {
      const reply = await requestOfficialData(
        "routes",
        officialBounds([stage.from, stage.to]),
        c.signal,
      );
      c.signal.throwIfAborted();
      const found = officialSections(reply.routes, stage.from, stage.to);
      setSections(found);
      setLoaded(true);
      setStatus(
        (found.length
          ? "Choose a section to check its connecting paths, cycling time and your train connections."
          : "No suitable continuous official section was found in this bounded search. Your existing journey remains available.") +
          (reply.incomplete ? " The source result is partial; other routes may exist." : ""),
      );
    } catch (error) {
      if (!c.signal.aborted)
        setStatus(error instanceof Error ? error.message : "Official routes could not be checked.");
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  async function check(section: OfficialSection) {
    if (!stage) return;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    const signal = AbortSignal.any([c.signal, AbortSignal.timeout(90000)]);
    setBusy(true);
    setChecked(null);
    setStatus("Checking the official section, connections and published closures…");
    onPreview([section.points]);
    try {
      const client = new CyclingClient(
        signal,
        fetch,
        500,
        true,
        fetch,
        context.options.cyclingPace,
        context.options.cyclingRoutePreference ?? "fastest",
        undefined,
        context.options.hills,
      );
      const result = await checkOfficialOption(context, stage, section, client, signal, (bounds) =>
        requestOfficialData("closures", bounds, signal),
      );
      signal.throwIfAborted();
      setChecked(result);
      onPreview(result.routes.map((r) => [r.from, ...r.points, r.to]));
      setStatus(
        "This option fits the selected journey’s cycling limits and scheduled connections. Review the preview before applying.",
      );
    } catch (error) {
      if (!c.signal.aborted) {
        onPreview([]);
        setStatus(
          signal.aborted
            ? "The check timed out. Retry or choose another route."
            : error instanceof Error
              ? error.message
              : "This option could not be checked.",
        );
      }
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="official-cycling-panel"
      aria-label="Official SwitzerlandMobility cycling routes"
    >
      <div className="detour-heading">
        <h3>Official cycling routes</h3>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p>
        Follow a section of a SwitzerlandMobility cycling route toward your destination.
        <InlineHelp
          label="About official cycling routes"
          text="Up to three nearby continuous sections are offered. Road routing checks the connecting paths and the direction you will ride; paths that diverge substantially from the official line are rejected. This is a Re.route itinerary using part of an official route, not the complete published tour. Official status does not guarantee a traffic-free, scenic or safe ride. Follow current signs and check conditions before leaving."
        />
      </p>
      <label>
        Cycling section
        <select
          value={stage?.id ?? ""}
          onChange={(e) => {
            reset();
            setStageId(e.target.value);
          }}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={busy || !stage} onClick={() => void discover()}>
        {loaded ? "Refresh suggestions" : "Find official routes"}
      </button>
      <p role="status" aria-live="polite">
        {status}
      </p>
      <ul className="official-route-options">
        {sections.map((s) => (
          <li key={s.id}>
            <strong>
              Route {s.route.number} · {s.route.title}
            </strong>
            <p>
              {s.distanceKm.toFixed(1)} km of the official route · connecting paths still to be
              checked.
            </p>
            <a href={s.route.url} target="_blank" rel="noreferrer">
              Published route ↗
            </a>{" "}
            <button type="button" disabled={busy} onClick={() => void check(s)}>
              Check this option
            </button>
          </li>
        ))}
      </ul>
      {checked && stage && (
        <div className="official-route-preview">
          <strong>Route {checked.section.route.number} preview</strong>
          <p>
            {checked.distanceKm.toFixed(1)} km · {formatMinutes(checked.minutes)} for this cycling
            section · {checked.minutes >= stage.originalMinutes ? "+" : "−"}
            {formatMinutes(Math.abs(checked.minutes - stage.originalMinutes))} cycling time.
          </p>
          <p>
            No intersecting closure was found in the checked feed (
            {new Date(checked.checkedAt).toLocaleString("en-CH")}). New or unreported closures and
            future travel conditions remain unknown.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              try {
                onApply(applyOfficialOption(context, stage, checked));
              } catch (error) {
                setChecked(null);
                setStatus(
                  error instanceof Error
                    ? error.message
                    : "The journey changed; check this option again.",
                );
              }
            }}
          >
            Use this route section
          </button>
        </div>
      )}
      {busy && (
        <button
          type="button"
          onClick={() => {
            controller.current?.abort();
            setBusy(false);
            setStatus("Check cancelled. Your journey is unchanged.");
            onPreview([]);
          }}
        >
          Cancel check
        </button>
      )}
      <p className="source-note">
        <a href={OFFICIAL_CYCLING_MAP} target="_blank" rel="noreferrer">
          Official routes and closures on swisstopo ↗
        </a>
        <br />
        {OFFICIAL_CYCLING_ATTRIBUTION}. Road connections: © OpenStreetMap contributors / BRouter.
      </p>
    </section>
  );
}
