import AppHeader from "./ui/AppHeader";
import ProfilePanel from "./ui/ProfilePanel";
import PlannerForm from "./ui/PlannerForm";
import RouteFields from "./ui/RouteFields";
import DepartureControls from "./ui/DepartureControls";
import TripPresetPicker from "./ui/TripPresetPicker";
import TripPreferences from "./ui/TripPreferences";
import type { FareProfile } from "./fares";
import InfoDisclosure from "./InfoDisclosure";
import {
  loadTravellers,
  validPersonalSettings,
  personalSettings,
  changeTravellerLibrary,
  type PersonalSettings,
  type TravellerLibrary,
} from "./travellerProfiles";
import { TRIP_PRESETS, type TripPreset } from "./tripPresets";
import { type RoutePreference } from "./cyclingPreferences";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { extend, plan, searchWarnings, updateBicycleEvidence, type SearchSession } from "./api";
import { metrics, type ModelMode, type EndpointPreference, type CyclingPosition } from "./model";
import {
  recommend,
  compareCycling,
  waitingMinutes,
  scopeLabels,
  type ScopedProposal,
} from "./recommendations";
import MapView from "./MapView";
import JourneyPlan from "./JourneyPlan";
import JourneyPrice from "./JourneyPrice";
import CyclingDetails, { type CycleFocus, type NamedCycleRoute } from "./CyclingDetails";
import { formatMinutes, type CyclingComparison, type Point } from "./routing";
import { journeySteps } from "./itinerary";
import { exploredStops } from "./mapData";
import type { PlaceValue } from "./PlaceInput";
import { KNOWN_PLACES, mapPlace, nameMapPlace, MAX_WAYPOINTS } from "./places";
import { slopeSpeedKmh, type CyclingPace, type CyclingPreset } from "./cyclingPace";
import { preferenceOptions, type CyclingPreference } from "./preferences";
import { parseSwissDateTime, swissDateTimeInput } from "./departure";
import { bicycleJourneySummary } from "./bicycleCarriage";
import {
  bicycleExclusions,
  bicyclePermission,
  bicycleScopeOptions,
  type BicycleScope,
} from "./bicyclePermission";

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
const BIKE_ONLY_ID = "cycling-only-reference";

function CyclingCard({
  comparison,
  selected,
  start,
  maxBikeMinutes,
  fastest,
  cyclingPosition,
  onSelect,
}: {
  comparison: CyclingComparison;
  selected: boolean;
  start: Date;
  maxBikeMinutes: number;
  fastest: boolean;
  cyclingPosition: CyclingPosition;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`journey-card cycling-only-card${selected ? " selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="category-badges">
        <span>Cycling only · routed</span>
        {fastest && <span>Fastest in this search</span>}
      </span>
      <span className="journey-topline">
        <strong>≈ {formatMinutes(comparison.minutes)}</strong>
        <span>0 boardings</span>
      </span>
      <span className="journey-price">
        <b>CHF 0.00 public transport cost</b>
        <small>No public transport tickets needed.</small>
      </span>
      <span className="arrival-summary">
        Estimated arrival <b>{clock.format(comparison.arrival)}</b>
        {day.format(comparison.arrival) !== day.format(start) &&
          ` · ${day.format(comparison.arrival)}`}
      </span>
      <span className="cycling-summary">
        {comparison.distanceKm.toFixed(1)} km along roads and paths
      </span>
      <span className="comparison-caution">
        Estimated using your cycling profile, including short walking access to the path. Select to
        explore elevation and surfaces.
      </span>
      {comparison.minutes > maxBikeMinutes && (
        <span className="comparison-caution">
          Exceeds your {maxBikeMinutes}-minute cycling budget for transit journeys.
        </span>
      )}
      {cyclingPosition !== "anywhere" && (
        <span className="comparison-caution">
          Reference only: a cycling-only trip does not match your choice to ride only{" "}
          {cyclingPosition === "start-only" ? "before" : "after"} public transport.
        </span>
      )}
      <span className="journey-plan-toggle">
        {selected ? "Shown on the map" : "Show cycling route on map"}
      </span>
    </button>
  );
}

function JourneyCard({
  proposal,
  selected,
  expanded,
  planId,
  comparison,
  fareProfile,
  extraTimeMinutes,
  onSelect,
}: {
  proposal: ScopedProposal;
  selected: boolean;
  expanded: boolean;
  planId: string;
  comparison: CyclingComparison | null;
  fareProfile: FareProfile;
  extraTimeMinutes: number;
  onSelect: () => void;
}) {
  const { journey: j, wins } = proposal;
  const sameWins =
    wins.length > 1 &&
    wins.every(
      (win) =>
        JSON.stringify(win.categories) === JSON.stringify(wins[0].categories) &&
        win.extraMinutes === wins[0].extraMinutes,
    );
  const prohibited = j.transitLegs.some(
    (leg) => leg.mode === "transit" && bicyclePermission(leg) === "prohibited",
  );
  const m = metrics(j),
    finalArrival = new Date(j.arrival.getTime() + m.end * 60_000);
  const busSummary = bicycleJourneySummary(j.transitLegs);
  const verified = j.transitLegs
    .filter((l) => l.mode === "transit")
    .every((l) => bicyclePermission(l) === "confirmed");
  return (
    <button
      type="button"
      className={`journey-card${selected ? " selected" : ""}`}
      onClick={onSelect}
      aria-expanded={expanded}
      aria-controls={planId}
    >
      {(sameWins ? wins.slice(0, 1) : wins).map((win) => (
        <span className={`scope-win scope-${win.scope}`} key={win.scope}>
          <span className="category-badges">
            {win.categories.map((c) => (
              <span key={c}>{c === "Fastest" ? "Fastest with transit" : c}</span>
            ))}
          </span>
          {win.categories.some((c) => c.startsWith("Least cycling or walking")) && (
            <span className="comparison-caution">
              Among journeys up to {extraTimeMinutes} minutes longer than the fastest in this group.
            </span>
          )}
          {win.extraMinutes > 0 && (
            <span className="tradeoff">
              {formatMinutes(win.extraMinutes)} longer than the fastest in this group
            </span>
          )}
        </span>
      ))}
      {busSummary && (
        <span
          className={`journey-permission permission-${prohibited ? "prohibited" : verified ? "confirmed" : "uncertain"}`}
        >
          {busSummary}
        </span>
      )}
      {prohibited && (
        <span className="permission-warning">
          Comparison only: bicycles are prohibited on at least one service. This is not a journey
          you can take with your bicycle.
        </span>
      )}
      <span className="journey-topline">
        <strong>{formatMinutes(j.totalMinutes)}</strong>
        <span>
          {m.boardings} boarding{m.boardings === 1 ? "" : "s"} ·{" "}
          {j.changes === 0 ? "no changes" : `${j.changes} change${j.changes === 1 ? "" : "s"}`}
        </span>
      </span>
      <JourneyPrice legs={j.transitLegs} profile={fareProfile} />
      <span className="arrival-summary">
        Arrive at your destination at <b>{clock.format(finalArrival)}</b>
        {day.format(finalArrival) !== day.format(j.startTime) && ` · ${day.format(finalArrival)}`}
      </span>
      {day.format(finalArrival) !== day.format(j.startTime) && (
        <span className="comparison-caution">Next-day arrival. Total time includes waiting.</span>
      )}
      <span className="route-services">{j.services.join(" → ")}</span>
      <span className="comparison-caution">
        Waiting and boarding: {formatMinutes(waitingMinutes(j))}
      </span>
      <span className="cycling-summary">
        <b>{formatMinutes(m.active)} cycling or walking</b> · cycling ≈ {formatMinutes(m.bike)} ·
        walking {formatMinutes(m.walk)}
      </span>
      <span className="cycling-summary">
        Active time at start {formatMinutes(m.activeStart)} · arrival {formatMinutes(m.activeEnd)}
        {m.middle > 0 && ` · cycling between services ${formatMinutes(m.middle)}`}
      </span>
      <span className="route-stops">
        {j.originStation.name} → {j.destinationStation.name}
      </span>
      {!!j.waypoints?.length && (
        <span className="route-stops">Via {j.waypoints.map((w) => w.place.label).join(" → ")}</span>
      )}
      {m.middle > 0 && (
        <span className="middle-badge">
          {j.waypoints?.length ? "Cycling between journey stages" : "One cycling transfer"}
        </span>
      )}
      {comparison && (
        <span className="tradeoff cycling-tradeoff">{compareCycling(j, comparison)}</span>
      )}
      <span className="journey-plan-toggle">
        {expanded ? "Hide travel plan −" : "View travel plan +"}
      </span>
    </button>
  );
}

export default function App() {
  const initial = (stopId: string): PlaceValue => {
    const place = KNOWN_PLACES.find((p) => p.stopId === stopId)!;
    return { text: place.label, place };
  };
  const [fromInput, setFromInput] = useState<PlaceValue>(() => initial("8503000"));
  const [toInput, setToInput] = useState<PlaceValue>(() => initial("8509786"));
  const [viaInputs, setViaInputs] = useState<{ id: string; value: PlaceValue }[]>([]);
  const nextViaId = useRef(0);
  const naming = useRef(new Map<string, AbortController>());
  const [pointNotice, setPointNotice] = useState("");
  const [cycleFocus, setCycleFocus] = useState<CycleFocus | null>(null);
  const [travellers] = useState(loadTravellers);
  const [profileLibrary, setProfileLibrary] = useState(travellers.library);
  const [profileNotice, setProfileNotice] = useState(travellers.notice);
  const initialTraveller =
    travellers.library.profiles.find((p) => p.id === travellers.library.activeId) ??
    travellers.guest;
  const guest = useRef(travellers.guest);
  const [fareProfile, setFareProfile] = useState<FareProfile>(initialTraveller.fare);
  const [age, setAge] = useState<number | null>(initialTraveller.age);
  const [mode, setMode] = useState<ModelMode>("baseline");
  const [ridingPreset, setRidingPreset] = useState<CyclingPreset | "custom">(
    initialTraveller.ridingPreset,
  );
  const [cyclingPace, setCyclingPace] = useState<CyclingPace>(initialTraveller.pace);
  const [cycling, setCycling] = useState<CyclingPreference>("commuter");
  const [routePreference, setRoutePreference] = useState<RoutePreference>("simplest");
  const [tripPreset, setTripPreset] = useState<TripPreset>("commuter");
  const [profileOpen, setProfileOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"planning" | "map">("planning");
  const viewScroll = useRef({ planning: 0, map: 0 });
  function showMobileView(view: "planning" | "map") {
    if (view === mobileView) return;
    if (window.matchMedia("(max-width: 900px)").matches) {
      viewScroll.current[mobileView] = window.scrollY;
      requestAnimationFrame(() =>
        window.scrollTo({ top: viewScroll.current[view], behavior: "instant" }),
      );
    }
    setMobileView(view);
  }
  const tripPersonal: PersonalSettings = {
    fare: fareProfile,
    age,
    pace: cyclingPace,
    ridingPreset,
  };
  function applyPersonal(next: PersonalSettings) {
    if (
      next.pace.flatSpeedKmh !== cyclingPace.flatSpeedKmh ||
      next.pace.electricAssist !== cyclingPace.electricAssist
    )
      invalidate();
    setFareProfile({ ...next.fare });
    setCyclingPace({ ...next.pace });
    setAge(next.age);
    setRidingPreset(next.ridingPreset);
  }
  function updateProfiles(next: TravellerLibrary, action: "save" | "select") {
    const result = changeTravellerLibrary(profileLibrary, next, action);
    setProfileNotice(result.notice);
    if (!result.accepted) return false;
    setProfileLibrary(result.library);
    if (action === "select" || next.activeId !== profileLibrary.activeId) {
      if (profileLibrary.activeId === null) guest.current = personalSettings(tripPersonal);
      const profile = next.profiles.find((p) => p.id === next.activeId);
      applyPersonal(profile ?? guest.current);
    }
    return true;
  }
  function choosePreset(preset: TripPreset) {
    setTripPreset(preset);
    if (preset === "personalized") {
      setPreferencesOpen(true);
      return;
    }
    invalidate();
    const next = TRIP_PRESETS[preset];
    setCycling(next.cycling);
    setRoutePreference(next.routePreference);
    setBicycleScope(next.bicycleScope);
    setEndpoint(next.endpoint);
    setProfileOpen(false);
    setPreferencesOpen(false);
  }
  const [endpoint, setEndpoint] = useState<EndpointPreference>("none");
  const [cyclingPosition, setCyclingPosition] = useState<CyclingPosition>("anywhere");
  const [bicycleScope, setBicycleScope] = useState<BicycleScope>("allow-uncertain");
  const [departureMode, setDepartureMode] = useState<"now" | "scheduled">("now");
  const [departureInput, setDepartureInput] = useState(() => swissDateTimeInput(new Date()));
  const options = useMemo(
    () =>
      preferenceOptions(
        cycling,
        endpoint,
        "include-unknown",
        bicycleScope,
        cyclingPace,
        routePreference,
        cyclingPosition,
      ),
    [cycling, endpoint, bicycleScope, cyclingPace, routePreference, cyclingPosition],
  );
  const [session, setSession] = useState<SearchSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const solution =
    mode === "extended" ? (session?.extended ?? session?.baseline) : session?.baseline;
  const exclusions = session
    ? bicycleExclusions(
        [...session.network.edges.values()].map((e) => e.leg),
        session.options.bicycleScope ?? "allow-uncertain",
      )
    : null;
  const confirmedSolution =
    mode === "extended"
      ? (session?.confirmed?.extended ?? session?.confirmed?.baseline)
      : session?.confirmed?.baseline;
  const allTransitSolution =
    mode === "extended"
      ? (session?.allTransit?.extended ?? session?.allTransit?.baseline)
      : session?.allTransit?.baseline;
  const recommendation = useMemo(
    () =>
      recommend(
        confirmedSolution?.journeys ?? [],
        solution?.journeys ?? [],
        allTransitSolution?.journeys ?? [],
        session?.options ?? options,
      ),
    [confirmedSolution, solution, allTransitSolution, session, options],
  );
  const { proposals } = recommendation;
  const cyclingFastest =
    (session?.options.cyclingPosition ?? "anywhere") === "anywhere" &&
    !!session?.cyclingComparison &&
    session.cyclingComparison.minutes <= session.options.maxBikeMinutes &&
    proposals.every((p) => session.cyclingComparison!.minutes <= p.journey.totalMinutes);
  const selected =
    selectedId === BIKE_ONLY_ID || (selectedId === null && cyclingFastest)
      ? null
      : (proposals.find((p) => p.journey.id === selectedId)?.journey ??
        proposals[0]?.journey ??
        null);
  const bikeOnlySelected = !!session && selected === null;
  const cyclingReference = session?.cyclingComparison ?? null;
  const cyclingRoutes = useMemo<NamedCycleRoute[]>(
    () =>
      selected && session
        ? journeySteps(selected, session.origin, session.destination).flatMap((step) =>
            step.cyclingRoute && step.cyclingRoute.distanceKm > 0
              ? [{ label: `${step.from} → ${step.to}`, route: step.cyclingRoute }]
              : [],
          )
        : (cyclingReference?.routes ?? []).flatMap((route, index) =>
            route.distanceKm > 0 ? [{ label: `Cycling stage ${index + 1}`, route }] : [],
          ),
    [selected, session, cyclingReference],
  );
  const focusedRoute = cyclingRoutes.find((r) => r.route.id === cycleFocus?.routeId);
  const mapWaypoints = useMemo(
    () =>
      viaInputs.flatMap((input, index) => {
        const place = input.value.place ?? session?.waypoints?.[index];
        return place ? [{ id: input.id, place, number: index + 1 }] : [];
      }),
    [viaInputs, session],
  );
  const stops = useMemo(
    () =>
      session
        ? exploredStops(
            session.network.stops.values(),
            session.originStations,
            session.destinationStations,
          )
        : [],
    [session],
  );
  const warnings = session ? searchWarnings(session) : [];

  function invalidate() {
    setSession(null);
    setSelectedId(null);
    setExpandedId(null);
    setCycleFocus(null);
    setError("");
    setProgress("");
  }
  useEffect(
    () => () => {
      controller.current?.abort();
      for (const abort of naming.current.values()) abort.abort();
    },
    [],
  );
  function setMapPoint(id: string, point: Point) {
    if (loading) return;
    const place = mapPlace(point),
      value = { text: place.label, place };
    invalidate();
    if (id === "origin") setFromInput(value);
    else if (id === "destination") setToInput(value);
    else
      setViaInputs((inputs) =>
        inputs.map((input) => (input.id === id ? { ...input, value } : input)),
      );
    setPointNotice("Location selected. Its exact position is kept while we look up a nearby name.");
    naming.current.get(id)?.abort();
    const abort = new AbortController();
    naming.current.set(id, abort);
    void nameMapPlace(place, abort.signal)
      .then((named) => {
        if (abort.signal.aborted) return;
        const rename = (old: PlaceValue): PlaceValue =>
          old.place === place ? { text: named.label, place: named } : old;
        setFromInput(rename);
        setToInput(rename);
        setViaInputs((inputs) => inputs.map((input) => ({ ...input, value: rename(input.value) })));
        setSession((current) =>
          current
            ? {
                ...current,
                origin: current.origin === place ? named : current.origin,
                destination: current.destination === place ? named : current.destination,
                waypoints: current.waypoints?.map((p) => (p === place ? named : p)),
              }
            : current,
        );
        setPointNotice(
          named.label === place.label
            ? "Point selected. A nearby place name was unavailable; the coordinates remain usable."
            : `Selected ${named.label}.`,
        );
      })
      .catch(() => {
        /* A newer drag replaces this naming request. */
      })
      .finally(() => {
        if (naming.current.get(id) === abort) naming.current.delete(id);
      });
  }
  function addWaypoint(point?: Point) {
    if (loading || viaInputs.length >= MAX_WAYPOINTS) return;
    const id = `via-${++nextViaId.current}`;
    invalidate();
    setViaInputs((inputs) => [...inputs, { id, value: { text: "" } }]);
    if (point) setMapPoint(id, point);
  }
  function moveWaypoint(index: number, delta: number) {
    invalidate();
    setViaInputs((inputs) => {
      const next = [...inputs];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  function cancel() {
    runId.current++;
    controller.current?.abort();
    setLoading(false);
    setProgress(
      session
        ? "Search stopped. The cycling estimate and any transit proposals are kept below."
        : "Search stopped. You can try again.",
    );
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    if (loading || !fromInput.text.trim() || !toInput.text.trim()) return;
    if (!validPersonalSettings(tripPersonal)) {
      setProfileOpen(true);
      return;
    }
    invalidate();
    controller.current?.abort();
    const id = ++runId.current,
      abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    try {
      const start = departureMode === "now" ? new Date() : parseSwissDateTime(departureInput);
      if (departureMode === "scheduled" && start.getTime() < Date.now() - 60_000) {
        throw new Error("Choose a future departure time, or select Leave now.");
      }
      const next = await plan(
        fromInput.place ?? fromInput.text.trim(),
        toInput.place ?? toInput.text.trim(),
        mode,
        options,
        abort.signal,
        (message) => {
          if (id === runId.current) setProgress(message);
        },
        (result) => {
          if (id === runId.current) setSession(result);
        },
        {
          start,
          waypoints: viaInputs.map((input) => input.value.place ?? input.value.text.trim()),
        },
      );
      if (id === runId.current) {
        setSession(next);
        setProgress("");
      }
    } catch (e) {
      if (id === runId.current && !abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Search failed. Please try again.");
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }
  async function changeMode(next: ModelMode) {
    if (loading || next === mode) return;
    setMode(next);
    setExpandedId(null);
    setSelectedId(null);
    setError("");
    if (next === "extended" && session && !session.extendedComplete) {
      if (session.client.signal.aborted) {
        setProgress(
          "Search again to explore cycling transfers. Your existing proposals are kept below.",
        );
        return;
      }
      const id = ++runId.current;
      setLoading(true);
      try {
        const result = await extend(
          session,
          (message) => {
            if (id === runId.current) setProgress(message);
          },
          (result) => {
            if (id === runId.current) setSession(result);
          },
        );
        if (id === runId.current) {
          setSession(result);
          setProgress("");
        }
      } catch (e) {
        if (id === runId.current)
          setError(e instanceof Error ? e.message : "The extended search failed.");
      } finally {
        if (id === runId.current) setLoading(false);
      }
    }
  }
  const best = (journeys: { totalMinutes: number }[]) =>
    Math.min(...journeys.map((j) => j.totalMinutes));
  const baselineFastest = session ? best(session.baseline.journeys) : Infinity;
  const extendedFastest = session?.extended ? best(session.extended.journeys) : Infinity;

  return (
    <div className="app-shell" data-mobile-view={mobileView}>
      <AppHeader
        profile={
          <ProfilePanel
            open={profileOpen}
            onOpenChange={setProfileOpen}
            library={profileLibrary}
            notice={profileNotice}
            onNotice={setProfileNotice}
            onLibraryChange={updateProfiles}
            settings={tripPersonal}
            disabled={loading}
            onChange={applyPersonal}
          />
        }
      />
      <main id="top">
        <section className="planner-panel" id="planning-panel" aria-label="Journey planning">
          <PlannerForm
            loading={loading}
            onSubmit={search}
            sections={{
              locations: (
                <RouteFields
                  from={fromInput}
                  to={toInput}
                  vias={viaInputs}
                  disabled={loading}
                  notice={pointNotice}
                  onFrom={(value) => {
                    invalidate();
                    setFromInput(value);
                  }}
                  onTo={(value) => {
                    invalidate();
                    setToInput(value);
                  }}
                  onVia={(id, value) => {
                    invalidate();
                    setViaInputs((inputs) =>
                      inputs.map((item) => (item.id === id ? { ...item, value } : item)),
                    );
                  }}
                  onReverse={() => {
                    invalidate();
                    setFromInput(toInput);
                    setToInput(fromInput);
                    setViaInputs((inputs) => [...inputs].reverse());
                  }}
                  onAdd={() => addWaypoint()}
                  onRemove={(id) => {
                    invalidate();
                    naming.current.get(id)?.abort();
                    setViaInputs((inputs) => inputs.filter((item) => item.id !== id));
                  }}
                  onMove={moveWaypoint}
                  onChooseMap={() => showMobileView("map")}
                />
              ),
              departure: (
                <DepartureControls
                  mode={departureMode}
                  value={departureInput}
                  disabled={loading}
                  onChange={(value) => {
                    invalidate();
                    setDepartureInput(value);
                    setDepartureMode("scheduled");
                  }}
                  onNow={() => {
                    invalidate();
                    setDepartureMode("now");
                    setDepartureInput(swissDateTimeInput(new Date()));
                  }}
                />
              ),
              presets: (
                <TripPresetPicker
                  value={tripPreset}
                  disabled={loading}
                  onChange={choosePreset}
                  library={profileLibrary}
                  settings={tripPersonal}
                  notice={profileNotice}
                  onSelectProfile={(activeId) =>
                    updateProfiles({ ...profileLibrary, activeId }, "select")
                  }
                />
              ),
              preferences: (
                <TripPreferences
                  open={preferencesOpen}
                  onOpenChange={setPreferencesOpen}
                  disabled={loading}
                  mode={mode}
                  hasWaypoints={viaInputs.length > 0}
                  bicycleScope={bicycleScope}
                  routePreference={routePreference}
                  cycling={cycling}
                  endpoint={endpoint}
                  cyclingPosition={cyclingPosition}
                  onPosition={(position) => {
                    invalidate();
                    setCyclingPosition(position);
                    if (position !== "anywhere") setMode("baseline");
                    setTripPreset("personalized");
                  }}
                  onMode={(next) => void changeMode(next)}
                  onScope={(scope) => {
                    invalidate();
                    setBicycleScope(scope);
                    setTripPreset("personalized");
                  }}
                  onRoute={(route) => {
                    invalidate();
                    setRoutePreference(route);
                    setTripPreset("personalized");
                  }}
                  onCycling={(amount) => {
                    invalidate();
                    setCycling(amount);
                    setTripPreset("personalized");
                  }}
                  onEndpoint={(preference) => {
                    invalidate();
                    setEndpoint(preference);
                    setTripPreset("personalized");
                  }}
                />
              ),
            }}
          />
          <details className="planning-notes">
            <summary>Planning notes &amp; assumptions</summary>
            <p id="cycling-pace-help">
              These are flat-ground pace presets, not fitness ratings. Choose one and adjust it to
              your usual moving speed. Climbs are calculated from your riding power, so stronger
              riders gain more uphill.
              {cyclingPace.electricAssist
                ? " Electric assistance adds climbing power and fades near 25 km/h."
                : " Descents can be faster than your flat pace."}{" "}
              This setting changes station access, transfers and arrival times. Wind, traffic stops
              and battery range are not modelled.
            </p>
            {Number.isFinite(cyclingPace.flatSpeedKmh) &&
              cyclingPace.flatSpeedKmh >= 8 &&
              cyclingPace.flatSpeedKmh <= 35 && (
                <details className="pace-model">
                  <summary>How hills change your speed</summary>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Terrain</th>
                        <th scope="col">Estimated speed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [0, "Flat"],
                        [0.03, "3% climb"],
                        [0.06, "6% climb"],
                        [0.1, "10% climb"],
                      ].map(([grade, label]) => (
                        <tr key={label}>
                          <th scope="row">{label}</th>
                          <td>{slopeSpeedKmh(Number(grade), cyclingPace).toFixed(1)} km/h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>
                    Planning assumptions: rider plus bicycle{" "}
                    {cyclingPace.electricAssist ? "105" : "90"} kg; touring-bike rolling and air
                    resistance.
                    {cyclingPace.electricAssist &&
                      " The model adds up to 250 W of climbing help, fading between 20 and 25 km/h; actual motors and assistance settings vary."}{" "}
                    Downhill speed is capped at 45 km/h. Missing elevation uses flat-ground speed.
                  </p>
                </details>
              )}
            <p>
              {cycling === "unrestricted"
                ? "No separate cycling cap; shorter rides are also included."
                : `Up to ${options.maxAccessMinutes} minutes cycling at each ${viaInputs.length ? "stage's " : ""}end${mode === "extended" ? `, and ${options.maxIntermediateMinutes} minutes between services` : ""}.`}{" "}
              Up to {options.maxBoardings} boardings and {options.horizonMinutes / 60} hours
              overall, including waiting.
            </p>

            <p>
              Scheduled searches currently require a future departure. Historical journey searches
              are planned separately.
            </p>
            <div className="assumptions">
              <span>
                <b>{cyclingPace.electricAssist ? "Electric bike" : "Bicycle"}</b> ·{" "}
                {cyclingPace.flatSpeedKmh || "—"} km/h on flat ground
              </span>
              <span>
                <b>3 min</b> before each boarding
              </span>
              <span>
                <b>
                  {session
                    ? `${day.format(session.start)}, ${clock.format(session.start)}`
                    : departureMode === "now"
                      ? "Leave now"
                      : "Chosen departure"}
                </b>{" "}
                · Swiss time
              </span>
              <span>
                Arrival within <b>{options.horizonMinutes / 60} hours</b> · includes overnight
                waiting
              </span>
            </div>
          </details>
          {loading && (
            <div className="loading-block" role="status">
              <div className="progress-track">
                <i />
              </div>
              <p>{progress}</p>
              <small>
                {proposals.length
                  ? "You can open a travel plan while we check more options."
                  : "Checking cycling paths, terrain and timetables can take up to 90 seconds. Options appear as they are ready."}
              </small>
              <button type="button" className="cancel-button" onClick={cancel}>
                {proposals.length ? "Stop looking · keep these options" : "Stop search"}
              </button>
            </div>
          )}
          {!loading && progress && <p role="status">{progress}</p>}
          {error && (
            <div className="error-block" role="alert">
              <strong>We could not complete this search.</strong>
              <p>{error}</p>
            </div>
          )}
          {session && (
            <section className="results">
              <p className="resolved-places">
                {[session.origin, ...(session.waypoints ?? []), session.destination]
                  .map((p) => p.label)
                  .join(" → ")}
              </p>
              <div className="results-heading">
                <div>
                  <p className="eyebrow">{mode} results</p>
                  <h2>Your journey options</h2>
                </div>
              </div>
              {exclusions && exclusions.prohibited + exclusions.uncertain > 0 && (
                <div className="bus-search-note" role="status">
                  <strong>Bicycle access filter</strong>
                  {exclusions.prohibited > 0 && (
                    <p>
                      {exclusions.prohibited} sampled departure
                      {exclusions.prohibited === 1 ? " prohibits" : "s prohibit"} bicycles and{" "}
                      {exclusions.prohibited === 1 ? "was" : "were"} excluded.
                    </p>
                  )}
                  {exclusions.uncertain > 0 && (
                    <p>
                      {exclusions.uncertain} sampled departure
                      {exclusions.uncertain === 1 ? " has" : "s have"} unverified bicycle access and{" "}
                      {exclusions.uncertain === 1 ? "was" : "were"} excluded by your choice.
                    </p>
                  )}
                </div>
              )}
              {warnings.length > 0 && (
                <details className="search-notice" open={!proposals.length}>
                  <summary>
                    {proposals.length
                      ? "Journey options found · see search notes"
                      : "Search notes · some checks were unsuccessful"}
                  </summary>
                  <p>
                    {proposals.length
                      ? "The journeys below use successfully calculated cycling paths. Other candidate links could not be used, so additional options may be missing."
                      : "The messages below identify unsuccessful checks. They do not prove that no journey exists."}
                  </p>
                  {warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </details>
              )}
              {!proposals.length && !loading && (
                <p className="empty-results">
                  {warnings.length
                    ? "Some timetable or cycling data was unavailable. Please try this journey again."
                    : `No transit journey was found with your cycling limits, bicycle-access choice and ${session.options.horizonMinutes / 60}-hour arrival window. ${
                        session.options.maxBikeMinutes < session.options.horizonMinutes
                          ? "Try No separate cycling cap in Preferences, or a different departure time."
                          : "Try a different departure time or nearby stops."
                      } This limited search can miss connections.`}
                </p>
              )}
              {!proposals.length && loading && (
                <p className="comparison-note">
                  Checking cycling paths and train connections. Options appear as they are found.
                </p>
              )}
              <InfoDisclosure label="How these journeys are compared">
                <div className="permission-summary">
                  {recommendation.groups.map((group) => (
                    <div key={group.scope} className={`permission-group scope-${group.scope}`}>
                      <h3>Search filter: {bicycleScopeOptions[group.scope]}</h3>
                      {group.scope === "all-transit" && (
                        <p>
                          Bicycle restrictions are ignored in this comparison. It can include
                          services that prohibit bicycles; these are labelled on the journey.
                        </p>
                      )}
                      {group.proposals.length ? (
                        <p>
                          {group.proposals.length} recommendation
                          {group.proposals.length === 1 ? "" : "s"} · fastest with transit{" "}
                          {formatMinutes(
                            Math.min(...group.proposals.map((p) => p.journey.totalMinutes)),
                          )}
                        </p>
                      ) : (
                        <p>
                          {group.scope === "confirmed"
                            ? "No journey could be confirmed from the available data. This does not mean bicycles are prohibited: one or more departures may have unknown permission."
                            : loading
                              ? "Checking possible journeys…"
                              : "No journey found in this limited search."}
                        </p>
                      )}
                    </div>
                  ))}
                  <p className="comparison-caution">
                    Verified access means bicycles are permitted on every transit leg, based on
                    service data or applicable published operator rules. Open a journey for ticket
                    and reservation requirements. Unknown ticket or reservation details do not
                    change verified permission. Permission does not reserve a place.
                  </p>
                </div>
                {session.extended && Number.isFinite(extendedFastest) && (
                  <p className="comparison-note">
                    <strong>
                      {scopeLabels[session.options.bicycleScope ?? "allow-uncertain"]}:{" "}
                    </strong>
                    {!Number.isFinite(baselineFastest)
                      ? "Extended found a journey where Baseline found none in this search."
                      : extendedFastest < baselineFastest
                        ? `Extended arrives ${formatMinutes(baselineFastest - extendedFastest)} earlier than Baseline in this search.`
                        : "Both models have the same fastest arrival in this search."}{" "}
                    Same departure time and limits.
                  </p>
                )}
                {proposals.length > 0 && (
                  <p className="result-explanation">
                    Results use your bicycle-access choice for fastest, fewest boardings and least
                    cycling or walking. Boardings include the first vehicle. Alternatives arrive at
                    most {session.options.extraTimeMinutes} minutes after the fastest eligible
                    transit journey. Cycling only remains a separate comparison.
                  </p>
                )}
              </InfoDisclosure>
              <div className="journey-list">
                {cyclingReference ? (
                  <CyclingCard
                    comparison={cyclingReference}
                    selected={bikeOnlySelected}
                    start={session.start}
                    maxBikeMinutes={session.options.maxBikeMinutes}
                    fastest={cyclingFastest}
                    cyclingPosition={session.options.cyclingPosition ?? "anywhere"}
                    onSelect={() => {
                      setSelectedId(BIKE_ONLY_ID);
                      setExpandedId(null);
                      setCycleFocus(null);
                    }}
                  />
                ) : (
                  <div className="cycling-unavailable" role="status">
                    <strong>Cycling only</strong>
                    <p>
                      {session.cyclingStatus === "loading" && loading
                        ? "Finding a route along roads and paths…"
                        : "A complete cycling route is unavailable. No straight-line route has been substituted."}
                    </p>
                  </div>
                )}
                {proposals.map((proposal, index) => {
                  const j = proposal.journey,
                    expanded = expandedId === j.id,
                    planId = `journey-plan-${index}`;
                  return (
                    <div key={j.id} className="journey-option">
                      <JourneyCard
                        proposal={proposal}
                        selected={selected?.id === j.id}
                        extraTimeMinutes={session!.options.extraTimeMinutes}
                        expanded={expanded}
                        planId={planId}
                        comparison={cyclingReference}
                        fareProfile={fareProfile}
                        onSelect={() => {
                          setSelectedId(j.id);
                          setExpandedId(expanded ? null : j.id);
                          setCycleFocus(null);
                        }}
                      />
                      {expanded && (
                        <JourneyPlan
                          fareProfile={fareProfile}
                          id={planId}
                          journey={j}
                          origin={session.origin}
                          destination={session.destination}
                          onEvidence={(leg, evidence) => {
                            if (session.client.signal.aborted) return;
                            updateBicycleEvidence(session, leg, evidence, (next) =>
                              setSession((current) =>
                                current?.network === session.network ? next : current,
                              ),
                            );
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {!!cyclingRoutes.length && (
                <CyclingDetails routes={cyclingRoutes} focus={cycleFocus} onFocus={setCycleFocus} />
              )}
              <details className="search-coverage">
                <summary>Stops explored ({stops.length})</summary>
                <p>
                  Small dots mark candidate and observed timetable stops. Numbered pins mark where
                  you board and alight on the selected journey. Click a pin for service, time and
                  platform details. Use Fit all stops to see the whole search area. This search can
                  miss useful journeys.
                </p>
                <div className="candidate-stations">
                  {[
                    ["Near departure", session.originStations],
                    ["Near arrival", session.destinationStations],
                  ].map(([title, list]) => (
                    <div className="station-list" key={String(title)}>
                      <span>{String(title)}</span>
                      <div>
                        {(list as SearchSession["originStations"]).map((s) => (
                          <small key={s.id}>
                            {s.name}
                            <b>{s.bikeMinutes} min</b>
                          </small>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="observed-stops">
                  All observed stops: {stops.map((s) => s.name).join(" · ")}
                </p>
              </details>
            </section>
          )}
        </section>
        <aside className="map-panel" id="journey-map">
          <MapView
            visible={mobileView === "map"}
            origin={fromInput.place ?? session?.origin ?? null}
            destination={toInput.place ?? session?.destination ?? null}
            stops={stops}
            waypoints={mapWaypoints}
            editingDisabled={loading}
            canAddWaypoint={viaInputs.length < MAX_WAYPOINTS}
            onSelectPoint={(target, point) =>
              target === "via" ? addWaypoint(point) : setMapPoint(target, point)
            }
            onMovePoint={setMapPoint}
            selectedJourney={selected}
            cycling={cyclingReference}
            bikeOnlySelected={bikeOnlySelected}
            start={session?.start ?? null}
            cyclingPace={session?.options.cyclingPace}
            routePreference={session?.options.cyclingRoutePreference}
            cycleFocus={
              focusedRoute && cycleFocus
                ? { route: focusedRoute.route, distanceM: cycleFocus.distanceM }
                : null
            }
            onCycleFocus={(routeId, distanceM) => setCycleFocus({ routeId, distanceM })}
          />
          <details className="model-note">
            <summary>About the map and estimated times</summary>
            <p>
              Cycling follows mapped roads and paths. Transit lines remain schematic. Each
              public-transport leg shows its bicycle-permission status. All-public-transport results
              may prohibit bicycles. The map shows explored stops and routes, not the complete Swiss
              network.
            </p>
          </details>
          <p className="timetable-attribution">
            Timetables:{" "}
            <a href="https://search.ch/timetable/" target="_blank" rel="noreferrer">
              search.ch
            </a>{" "}
            ·{" "}
            <a href="https://transport.opendata.ch/" target="_blank" rel="noreferrer">
              Swiss Transport API
            </a>
          </p>
        </aside>
      </main>
      <nav className="mobile-view-switch" aria-label="Planner view">
        <button
          type="button"
          aria-pressed={mobileView === "planning"}
          aria-controls="planning-panel"
          onClick={() => showMobileView("planning")}
        >
          Planning
        </button>
        <button
          type="button"
          aria-pressed={mobileView === "map"}
          aria-controls="journey-map"
          onClick={() => showMobileView("map")}
        >
          Map
        </button>
      </nav>
    </div>
  );
}
