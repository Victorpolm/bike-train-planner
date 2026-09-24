import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { extend, plan, searchWarnings, updateBicycleEvidence, type SearchSession } from "./api";
import { metrics, type ModelMode, type EndpointPreference } from "./model";
import { recommend, compareCycling, waitingMinutes, scopeLabels, type ScopedProposal } from "./recommendations";
import MapView from "./MapView";
import JourneyPlan from "./JourneyPlan";
import CyclingDetails, { type CycleFocus, type NamedCycleRoute } from "./CyclingDetails";
import { formatMinutes, type CyclingComparison, type Point } from "./routing";
import { journeySteps } from "./itinerary";
import { exploredStops } from "./mapData";
import PlaceInput, { type PlaceValue } from "./PlaceInput";
import { KNOWN_PLACES, mapPlace, nameMapPlace, MAX_WAYPOINTS } from "./places";
import { preferenceOptions, type CyclingPreference } from "./preferences";
import { parseSwissDateTime, swissDateTimeInput } from "./departure";
import { bicycleJourneySummary } from "./bicycleCarriage";
import { BICYCLE_SCOPES, bicycleExclusions, bicyclePermission, bicycleScopeHelp, bicycleScopeOptions, type BicycleScope } from "./bicyclePermission";

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "numeric", month: "short" });
const BIKE_ONLY_ID = "cycling-only-reference";

function CyclingCard({ comparison, selected, start, maxBikeMinutes, fastest, onSelect }: {
  comparison: CyclingComparison; selected: boolean; start: Date; maxBikeMinutes: number; fastest: boolean; onSelect: () => void;
}) {
  return <button type="button" className={`journey-card cycling-only-card${selected ? " selected" : ""}`}
    onClick={onSelect} aria-pressed={selected}>
    <span className="category-badges"><span>Cycling only · routed</span>{fastest && <span>Fastest in this search</span>}</span>
    <span className="journey-topline"><strong>≈ {formatMinutes(comparison.minutes)}</strong><span>0 boardings</span></span>
    <span className="arrival-summary">Estimated arrival <b>{clock.format(comparison.arrival)}</b>
      {day.format(comparison.arrival) !== day.format(start) && ` · ${day.format(comparison.arrival)}`}</span>
    <span className="cycling-summary">{comparison.distanceKm.toFixed(1)} km along roads and paths</span>
    <span className="comparison-caution">Estimated touring-bike time, including short walking access to the path. Select to explore elevation and surfaces.</span>
    {comparison.minutes > maxBikeMinutes && <span className="comparison-caution">Exceeds your {maxBikeMinutes}-minute cycling budget for transit journeys.</span>}
    <span className="journey-plan-toggle">{selected ? "Shown on the map" : "Show cycling route on map"}</span>
  </button>;
}

function JourneyCard({ proposal, selected, expanded, planId, comparison, onSelect }: {
  proposal: ScopedProposal; selected: boolean; expanded: boolean; planId: string; comparison: CyclingComparison | null; onSelect: () => void;
}) {
  const { journey: j, wins } = proposal;
  const sameWins = wins.length > 1 && wins.every(win => JSON.stringify(win.categories) === JSON.stringify(wins[0].categories)
    && win.extraMinutes === wins[0].extraMinutes);
  const prohibited = j.transitLegs.some(leg => leg.mode === "transit" && bicyclePermission(leg) === "prohibited");
  const m = metrics(j), finalArrival = new Date(j.arrival.getTime() + m.end * 60_000);
  const busSummary = bicycleJourneySummary(j.transitLegs);
  return <button type="button" className={`journey-card${selected ? " selected" : ""}`}
    onClick={onSelect} aria-expanded={expanded} aria-controls={planId}>
    {(sameWins ? wins.slice(0, 1) : wins).map(win => <span className={`scope-win scope-${win.scope}`} key={win.scope}>
      <strong>{sameWins ? wins.map(w => scopeLabels[w.scope]).join(" · ") : scopeLabels[win.scope]}</strong>
      <span className="category-badges">{win.categories.map(c => <span key={c}>{c === "Fastest" ? "Fastest with transit" : c}</span>)}</span>
      {win.extraMinutes > 0 && <span className="tradeoff">{formatMinutes(win.extraMinutes)} longer than the fastest in this group</span>}
    </span>)}
    {prohibited && <span className="permission-warning">Comparison only: bicycles are prohibited on at least one service. This is not a journey you can take with your bicycle.</span>}
    <span className="journey-topline"><strong>{formatMinutes(j.totalMinutes)}</strong>
      <span>{m.boardings} boarding{m.boardings === 1 ? "" : "s"} · {j.changes === 0 ? "no changes" : `${j.changes} change${j.changes === 1 ? "" : "s"}`}</span></span>
    <span className="arrival-summary">Arrive at your destination at <b>{clock.format(finalArrival)}</b>
      {day.format(finalArrival) !== day.format(j.startTime) && ` · ${day.format(finalArrival)}`}</span>
    {day.format(finalArrival) !== day.format(j.startTime) && <span className="comparison-caution">Next-day arrival. Total time includes waiting.</span>}
    <span className="route-services">{j.services.join(" → ")}</span>
    <span className="comparison-caution">Waiting and boarding: {formatMinutes(waitingMinutes(j))}</span>
    {busSummary && <span className="bus-summary">{busSummary}</span>}
    <span className="cycling-summary"><b>{formatMinutes(m.active)} cycling or walking</b>
      {" "}· cycling ≈ {formatMinutes(m.bike)} · walking {formatMinutes(m.walk)}</span>
    <span className="cycling-summary">Active time at start {formatMinutes(m.activeStart)} · arrival {formatMinutes(m.activeEnd)}
      {m.middle > 0 && ` · cycling between services ${formatMinutes(m.middle)}`}</span>
    <span className="route-stops">{j.originStation.name} → {j.destinationStation.name}</span>
    {!!j.waypoints?.length && <span className="route-stops">Via {j.waypoints.map(w => w.place.label).join(" → ")}</span>}
    {m.middle > 0 && <span className="middle-badge">{j.waypoints?.length ? "Cycling between journey stages" : "One cycling transfer"}</span>}
    {comparison && <span className="tradeoff cycling-tradeoff">{compareCycling(j, comparison)}</span>}
    <span className="journey-plan-toggle">{expanded ? "Hide travel plan −" : "View travel plan +"}</span>
  </button>;
}

export default function App() {
  const initial = (stopId: string): PlaceValue => {
    const place = KNOWN_PLACES.find(p => p.stopId === stopId)!; return { text: place.label, place };
  };
  const [fromInput, setFromInput] = useState<PlaceValue>(() => initial("8503000"));
  const [toInput, setToInput] = useState<PlaceValue>(() => initial("8509786"));
  const [viaInputs, setViaInputs] = useState<{ id: string; value: PlaceValue }[]>([]);
  const nextViaId = useRef(0);
  const naming = useRef(new Map<string, AbortController>());
  const [pointNotice, setPointNotice] = useState("");
  const [cycleFocus, setCycleFocus] = useState<CycleFocus | null>(null);
  const [mode, setMode] = useState<ModelMode>("baseline");
  const [cycling, setCycling] = useState<CyclingPreference>("balanced");
  const [endpoint, setEndpoint] = useState<EndpointPreference>("none");
  const [bicycleScope, setBicycleScope] = useState<BicycleScope>("allow-uncertain");
  const [departureMode, setDepartureMode] = useState<"now" | "scheduled">("now");
  const [departureInput, setDepartureInput] = useState(() => swissDateTimeInput(new Date(Date.now() + 60 * 60_000)));
  const options = useMemo(() => preferenceOptions(cycling, endpoint, "include-unknown", bicycleScope), [cycling, endpoint, bicycleScope]);
  const [session, setSession] = useState<SearchSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const solution = mode === "extended" ? session?.extended ?? session?.baseline : session?.baseline;
  const exclusions = session ? bicycleExclusions([...session.network.edges.values()].map(e => e.leg), session.options.bicycleScope ?? "allow-uncertain") : null;
  const confirmedSolution = mode === "extended" ? session?.confirmed?.extended ?? session?.confirmed?.baseline : session?.confirmed?.baseline;
  const allTransitSolution = mode === "extended" ? session?.allTransit?.extended ?? session?.allTransit?.baseline : session?.allTransit?.baseline;
  const recommendation = useMemo(() => recommend(confirmedSolution?.journeys ?? [], solution?.journeys ?? [], allTransitSolution?.journeys ?? [], session?.options ?? options), [confirmedSolution, solution, allTransitSolution, session, options]);
  const { proposals } = recommendation;
  const cyclingFastest = !!session?.cyclingComparison && session.cyclingComparison.minutes <= (session.options.maxBikeMinutes)
    && proposals.every(p => session.cyclingComparison!.minutes <= p.journey.totalMinutes);
  const selected = selectedId === BIKE_ONLY_ID || (selectedId === null && cyclingFastest) ? null
    : proposals.find(p => p.journey.id === selectedId)?.journey ?? proposals[0]?.journey ?? null;
  const bikeOnlySelected = !!session && selected === null;
  const cyclingReference = session?.cyclingComparison ?? null;
  const cyclingRoutes = useMemo<NamedCycleRoute[]>(() => selected && session
    ? journeySteps(selected, session.origin, session.destination).flatMap(step => step.cyclingRoute && step.cyclingRoute.distanceKm > 0
      ? [{ label: `${step.from} → ${step.to}`, route: step.cyclingRoute }] : [])
    : (cyclingReference?.routes ?? []).flatMap((route, index) => route.distanceKm > 0 ? [{ label: `Cycling stage ${index + 1}`, route }] : []), [selected, session, cyclingReference]);
  const focusedRoute = cyclingRoutes.find(r => r.route.id === cycleFocus?.routeId);
  const mapWaypoints = useMemo(() => viaInputs.flatMap((input, index) => {
    const place = input.value.place ?? session?.waypoints?.[index];
    return place ? [{ id: input.id, place, number: index + 1 }] : [];
  }), [viaInputs, session]);
  const stops = useMemo(() => session ? exploredStops(session.network.stops.values(), session.originStations, session.destinationStations) : [], [session]);
  const warnings = session ? searchWarnings(session) : [];

  function invalidate() { setSession(null); setSelectedId(null); setExpandedId(null); setCycleFocus(null); setError(""); setProgress(""); }
  useEffect(() => () => {
    controller.current?.abort();
    for (const abort of naming.current.values()) abort.abort();
  }, []);
  function setMapPoint(id: string, point: Point) {
    if (loading) return;
    const place = mapPlace(point), value = { text: place.label, place };
    invalidate();
    if (id === "origin") setFromInput(value);
    else if (id === "destination") setToInput(value);
    else setViaInputs(inputs => inputs.map(input => input.id === id ? { ...input, value } : input));
    setPointNotice("Location selected. Its exact position is kept while we look up a nearby name.");
    naming.current.get(id)?.abort();
    const abort = new AbortController(); naming.current.set(id, abort);
    void nameMapPlace(place, abort.signal).then(named => {
      if (abort.signal.aborted) return;
      const rename = (old: PlaceValue): PlaceValue => old.place === place ? { text: named.label, place: named } : old;
      setFromInput(rename); setToInput(rename);
      setViaInputs(inputs => inputs.map(input => ({ ...input, value: rename(input.value) })));
      setSession(current => current ? { ...current,
        origin: current.origin === place ? named : current.origin,
        destination: current.destination === place ? named : current.destination,
        waypoints: current.waypoints?.map(p => p === place ? named : p),
      } : current);
      setPointNotice(named.label === place.label ? "Point selected. A nearby place name was unavailable; the coordinates remain usable." : `Selected ${named.label}.`);
    }).catch(() => { /* A newer drag replaces this naming request. */ })
      .finally(() => { if (naming.current.get(id) === abort) naming.current.delete(id); });
  }
  function addWaypoint(point?: Point) {
    if (loading || viaInputs.length >= MAX_WAYPOINTS) return;
    const id = `via-${++nextViaId.current}`;
    invalidate(); setViaInputs(inputs => [...inputs, { id, value: { text: "" } }]);
    if (point) setMapPoint(id, point);
  }
  function moveWaypoint(index: number, delta: number) {
    invalidate(); setViaInputs(inputs => {
      const next = [...inputs]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next;
    });
  }
  function cancel() {
    runId.current++; controller.current?.abort(); setLoading(false); setProgress(session ? "Search stopped. The cycling estimate and any transit proposals are kept below." : "Search stopped. You can try again.");
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    if (loading || !fromInput.text.trim() || !toInput.text.trim()) return;
    invalidate(); controller.current?.abort();
    const id = ++runId.current, abort = new AbortController(); controller.current = abort;
    setLoading(true);
    try {
      const start = departureMode === "now" ? new Date() : parseSwissDateTime(departureInput);
      if (departureMode === "scheduled" && start.getTime() < Date.now() - 60_000) {
        throw new Error("Choose a future departure time, or select Leave now.");
      }
      const next = await plan(fromInput.place ?? fromInput.text.trim(), toInput.place ?? toInput.text.trim(), mode, options, abort.signal,
        message => { if (id === runId.current) setProgress(message); },
        result => { if (id === runId.current) setSession(result); },
        { start, waypoints: viaInputs.map(input => input.value.place ?? input.value.text.trim()) });
      if (id === runId.current) { setSession(next); setProgress(""); }
    } catch (e) {
      if (id === runId.current && !abort.signal.aborted) setError(e instanceof Error ? e.message : "Search failed. Please try again.");
    } finally { if (id === runId.current) setLoading(false); }
  }
  async function changeMode(next: ModelMode) {
    if (loading || next === mode) return;
    setMode(next); setExpandedId(null); setSelectedId(null); setError("");
    if (next === "extended" && session && !session.extendedComplete) {
      if (session.client.signal.aborted) { setProgress("Search again to explore cycling transfers. Your existing proposals are kept below."); return; }
      const id = ++runId.current; setLoading(true);
      try {
        const result = await extend(session, message => { if (id === runId.current) setProgress(message); },
          result => { if (id === runId.current) setSession(result); });
        if (id === runId.current) { setSession(result); setProgress(""); }
      } catch (e) {
        if (id === runId.current) setError(e instanceof Error ? e.message : "The extended search failed.");
      } finally { if (id === runId.current) setLoading(false); }
    }
  }
  const best = (journeys: { totalMinutes: number }[]) => Math.min(...journeys.map(j => j.totalMinutes));
  const baselineFastest = session ? best(session.baseline.journeys) : Infinity;
  const extendedFastest = session?.extended ? best(session.extended.journeys) : Infinity;

  return <div className="app-shell">
    <header><a className="brand" href="#top" aria-label="Bike plus train home">
      <span className="brand-mark">B<span>+</span>T</span><span><strong>Bike + Train</strong><small>Swiss route experiment</small></span>
    </a><span className="prototype-badge">Baseline + Extended</span></header>
    <main id="top"><section className="planner-panel">
      <div className="intro"><h1>Where are you going?</h1>
        <p>Find your way with a bike, trains, buses, trams and boats.</p>
      </div>
      <form onSubmit={search} className="search-form">
        <div className="place-inputs">
          <PlaceInput label="From" value={fromInput} disabled={loading} onChange={value => { invalidate(); setFromInput(value); }} />
          {viaInputs.map((input, index) => <div className="waypoint-row" key={input.id}>
            <PlaceInput label={`Intermediate stop ${index + 1}`} value={input.value} disabled={loading}
              onChange={value => { invalidate(); setViaInputs(inputs => inputs.map(item => item.id === input.id ? { ...item, value } : item)); }} />
            <div className="waypoint-actions">
              <button type="button" disabled={loading || index === 0} aria-label={`Move intermediate stop ${index + 1} up`} onClick={() => moveWaypoint(index, -1)}>↑</button>
              <button type="button" disabled={loading || index === viaInputs.length - 1} aria-label={`Move intermediate stop ${index + 1} down`} onClick={() => moveWaypoint(index, 1)}>↓</button>
              <button type="button" disabled={loading} aria-label={`Remove intermediate stop ${index + 1}`} onClick={() => {
                invalidate(); naming.current.get(input.id)?.abort(); setViaInputs(inputs => inputs.filter(item => item.id !== input.id));
              }}>Remove</button>
            </div>
          </div>)}
          <PlaceInput label="To" value={toInput} disabled={loading} onChange={value => { invalidate(); setToInput(value); }} />
        </div>
        <div className="location-actions">
          <button type="button" disabled={loading || viaInputs.length >= MAX_WAYPOINTS} onClick={() => addWaypoint()}>+ Add intermediate stop</button>
          <button type="button" disabled={loading} onClick={() => {
            invalidate(); setFromInput(toInput); setToInput(fromInput); setViaInputs(inputs => [...inputs].reverse());
          }}>Reverse route</button>
          <a href="#journey-map">Choose on map</a>
        </div>
        {!!viaInputs.length && <p className="waypoint-help">Visit stops in this order · up to {MAX_WAYPOINTS} stops. Cycling and boarding limits apply to the whole journey. No stopover time is added.</p>}
        {pointNotice && <p className="point-notice" role="status">{pointNotice}</p>}
        <div className="departure-controls">
          <label><span>Departure · Swiss time</span><select disabled={loading} value={departureMode}
            onChange={e => { invalidate(); setDepartureMode(e.target.value as "now" | "scheduled"); }}>
            <option value="now">Leave now</option><option value="scheduled">Choose date and time</option>
          </select></label>
          {departureMode === "scheduled" && <label><span>Date and time in Switzerland</span>
            <input type="datetime-local" required disabled={loading} value={departureInput}
              min={swissDateTimeInput(new Date())}
              onChange={e => { invalidate(); setDepartureInput(e.target.value); }} />
          </label>}
        </div>
        <fieldset className="model-picker" disabled={loading}>
          <legend>Journey options</legend>
          <div className="model-buttons">
            <button type="button" aria-pressed={mode === "baseline"} onClick={() => void changeMode("baseline")}>
              <strong>Baseline</strong><span>{viaInputs.length ? "Cycle at the ends of each stage" : "Cycle before and after transit"}</span></button>
            <button type="button" aria-pressed={mode === "extended"} onClick={() => void changeMode("extended")}>
              <strong>Extended</strong><span>Also allow one {viaInputs.length ? "extra " : ""}cycling transfer</span></button>
          </div>
        </fieldset>
        <fieldset className="bicycle-access" disabled={loading} aria-describedby="bicycle-access-help">
          <legend>Public transport with my bicycle</legend>
          {BICYCLE_SCOPES.map(scope => <label key={scope} className={bicycleScope === scope ? "selected" : ""}>
            <input type="radio" name="bicycle-access" value={scope} checked={bicycleScope === scope}
              onChange={() => { invalidate(); setBicycleScope(scope); }} />
            <span>{bicycleScopeOptions[scope]}</span>
          </label>)}
        </fieldset>
        <p className="bus-preference-help" id="bicycle-access-help">{bicycleScopeHelp[bicycleScope]} Applies to trains, buses, trams, boats and other public transport.</p>
        <details className="preferences"><summary>Preferences · optional</summary>
          <div className="preference-grid">
            <label><span>How much cycling?</span><select disabled={loading} value={cycling}
              onChange={e => { invalidate(); setCycling(e.target.value as CyclingPreference); }}>
              <option value="less">Less · up to 40 min total</option><option value="balanced">Balanced · up to 90 min total</option>
              <option value="more">More · up to 150 min total</option>
              <option value="unrestricted">Above 150 minutes cycling</option>
            </select></label>
            <label><span>Extra category</span><select disabled={loading} value={endpoint}
              onChange={e => { invalidate(); setEndpoint(e.target.value as EndpointPreference); }}>
              <option value="none">Just the three main categories</option><option value="start">Less cycling or walking at start</option><option value="end">Less cycling or walking at arrival</option>
            </select></label>
          </div>
          <p>{cycling === "unrestricted" ? "No separate cycling cap; shorter rides are also included."
            : `Up to ${options.maxAccessMinutes} minutes cycling at each ${viaInputs.length ? "stage's " : ""}end${mode === "extended" ? `, and ${options.maxIntermediateMinutes} minutes between services` : ""}.`}
            {" "}Up to {options.maxBoardings} boardings and {options.horizonMinutes / 60} hours overall, including waiting.</p>
        </details>
        <button className="search-button" type="submit" disabled={loading}>{loading ? "Finding journeys…" : "Find journeys"}</button>
      </form>
      <div className="assumptions"><span><b>Touring bicycle</b> · routed times</span><span><b>3 min</b> before each boarding</span>
        <span><b>{session ? `${day.format(session.start)}, ${clock.format(session.start)}` : departureMode === "now" ? "Leave now" : "Chosen departure"}</b> · Swiss time</span>
        <span>Arrival within <b>{options.horizonMinutes / 60} hours</b> · includes overnight waiting</span></div>
      {loading && <div className="loading-block" role="status"><div className="progress-track"><i /></div>
        <p>{progress}</p><small>{proposals.length ? "You can open a travel plan while we check more options." : "The timetable service can take around 20 seconds to respond."}</small>
        <button type="button" className="cancel-button" onClick={cancel}>{proposals.length ? "Stop looking · keep these options" : "Stop search"}</button></div>}
      {!loading && progress && <p role="status">{progress}</p>}
      {error && <div className="error-block" role="alert"><strong>We could not complete this search.</strong><p>{error}</p></div>}
      {session && <section className="results">
        <p className="resolved-places">{[session.origin, ...session.waypoints ?? [], session.destination].map(p => p.label).join(" → ")}</p>
        <div className="results-heading"><div><p className="eyebrow">{mode} results</p><h2>Your journey options</h2></div></div>
        {exclusions && (exclusions.prohibited + exclusions.uncertain > 0) && <div className="bus-search-note" role="status">
          <strong>Bicycle access filter</strong>
          {exclusions.prohibited > 0 && <p>{exclusions.prohibited} sampled departure{exclusions.prohibited === 1 ? " prohibits" : "s prohibit"} bicycles and {exclusions.prohibited === 1 ? "was" : "were"} excluded.</p>}
          {exclusions.uncertain > 0 && <p>{exclusions.uncertain} sampled departure{exclusions.uncertain === 1 ? " has" : "s have"} unverified bicycle access and {exclusions.uncertain === 1 ? "was" : "were"} excluded by your choice.</p>}
        </div>}
        {warnings.length > 0 && <details className="search-notice" open={!proposals.length}><summary>{proposals.length ? "Journey options found · see search notes" : "Search notes · some checks were unsuccessful"}</summary>
          <p>{proposals.length ? "The journeys below use successfully calculated cycling paths. Other candidate links could not be used, so additional options may be missing."
            : "The messages below identify unsuccessful checks. They do not prove that no journey exists."}</p>
          {warnings.map(w => <p key={w}>{w}</p>)}</details>}
        {!proposals.length && !loading && <p className="empty-results">{warnings.length
          ? "Some timetable or cycling data was unavailable. Please try this journey again."
          : `No transit journey was found with your cycling limits, bicycle-access choice and ${session.options.horizonMinutes / 60}-hour arrival window. ${session.options.maxBikeMinutes < session.options.horizonMinutes
            ? "Try Above 150 minutes cycling in Preferences, or a different departure time."
            : "Try a different departure time or nearby stops."} This limited search can miss connections.`}</p>}
        {!proposals.length && loading && <p className="comparison-note">Checking cycling paths and train connections. Options appear as they are found.</p>}
        <div className="permission-summary">
          {recommendation.groups.map(group => <div key={group.scope} className={`permission-group scope-${group.scope}`}>
              <h3>{scopeLabels[group.scope]}</h3>
              {group.scope === "all-transit" && <p>Bicycle restrictions are ignored in this comparison. It can include services that prohibit bicycles; these are labelled on the journey.</p>}
              {group.proposals.length ? <p>{group.proposals.length} recommendation{group.proposals.length === 1 ? "" : "s"} · fastest with transit {formatMinutes(Math.min(...group.proposals.map(p => p.journey.totalMinutes)))}</p>
                : <p>{group.scope === "confirmed"
                  ? "No journey could be confirmed from the available data. This does not mean bicycles are prohibited: one or more departures may have unknown permission."
                  : loading ? "Checking possible journeys…" : "No journey found in this limited search."}</p>}
            </div>)}
          <p className="comparison-caution">Confirmed permission concerns your bicycle on every service according to the provider. Open a journey for ticket and reservation requirements. Permission does not reserve a place. Service notes and applicable published rules are identified separately. Missing evidence stays unverified.</p>
        </div>
        {session.extended && Number.isFinite(extendedFastest) && <p className="comparison-note">
          <strong>{scopeLabels[session.options.bicycleScope ?? "allow-uncertain"]}: </strong>
          {!Number.isFinite(baselineFastest) ? "Extended found a journey where Baseline found none in this search."
            : extendedFastest < baselineFastest ? `Extended arrives ${formatMinutes(baselineFastest - extendedFastest)} earlier than Baseline in this search.`
              : "Both models have the same fastest arrival in this search."}
          {" "}Same departure time and limits.</p>}
        {proposals.length > 0 && <p className="result-explanation">Results use your bicycle-access choice for fastest, fewest boardings and least cycling or walking. Boardings include the first vehicle.
          {" "}Alternatives arrive at most {session.options.extraTimeMinutes} minutes after the fastest eligible transit journey. Cycling only remains a separate comparison.</p>}
        <div className="journey-list">{cyclingReference ? <CyclingCard comparison={cyclingReference} selected={bikeOnlySelected} start={session.start}
          maxBikeMinutes={session.options.maxBikeMinutes} fastest={cyclingFastest} onSelect={() => { setSelectedId(BIKE_ONLY_ID); setExpandedId(null); setCycleFocus(null); }} />
          : <div className="cycling-unavailable" role="status"><strong>Cycling only</strong><p>{session.cyclingStatus === "loading" && loading
            ? "Finding a route along roads and paths…" : "A complete cycling route is unavailable. No straight-line route has been substituted."}</p></div>}
          {proposals.map((proposal, index) => {
          const j = proposal.journey, expanded = expandedId === j.id, planId = `journey-plan-${index}`;
          return <div key={j.id} className="journey-option"><JourneyCard proposal={proposal} selected={selected?.id === j.id}
            expanded={expanded} planId={planId} comparison={cyclingReference} onSelect={() => { setSelectedId(j.id); setExpandedId(expanded ? null : j.id); setCycleFocus(null); }} />
            {expanded && <JourneyPlan id={planId} journey={j} origin={session.origin} destination={session.destination}
              onEvidence={(leg, evidence) => {
                if (session.client.signal.aborted) return;
                updateBicycleEvidence(session, leg, evidence, next => setSession(current => current?.network === session.network ? next : current));
              }} />}</div>;
        })}</div>
        {!!cyclingRoutes.length && <CyclingDetails routes={cyclingRoutes} focus={cycleFocus} onFocus={setCycleFocus} />}
        <details className="search-coverage"><summary>Stops explored ({stops.length})</summary>
          <p>Small dots mark candidate and observed timetable stops. Numbered pins mark where you board and alight on the selected journey. Click a pin for service, time and platform details. Use Fit all stops to see the whole search area. This search can miss useful journeys.</p>
          <div className="candidate-stations">{[["Near departure", session.originStations], ["Near arrival", session.destinationStations]].map(([title, list]) =>
            <div className="station-list" key={String(title)}><span>{String(title)}</span><div>{(list as SearchSession["originStations"]).map(s =>
              <small key={s.id}>{s.name}<b>{s.bikeMinutes} min</b></small>)}</div></div>)}</div>
          <p className="observed-stops">All observed stops: {stops.map(s => s.name).join(" · ")}</p>
        </details>
      </section>}
    </section><aside className="map-panel" id="journey-map">
      <MapView origin={fromInput.place ?? session?.origin ?? null} destination={toInput.place ?? session?.destination ?? null} stops={stops}
        waypoints={mapWaypoints} editingDisabled={loading} canAddWaypoint={viaInputs.length < MAX_WAYPOINTS}
        onSelectPoint={(target, point) => target === "via" ? addWaypoint(point) : setMapPoint(target, point)} onMovePoint={setMapPoint}
        selectedJourney={selected} cycling={cyclingReference} bikeOnlySelected={bikeOnlySelected}
        cycleFocus={focusedRoute && cycleFocus ? { route: focusedRoute.route, distanceM: cycleFocus.distanceM } : null}
        onCycleFocus={(routeId, distanceM) => setCycleFocus({ routeId, distanceM })} />
      <div className="model-note"><strong>Routed cycling · estimated times</strong><p>Cycling follows mapped roads and paths. Transit lines remain schematic.
        Each public-transport leg shows its bicycle-permission status. All-public-transport results may prohibit bicycles. The map shows explored stops and routes, not the complete Swiss network.</p></div>
      <p className="timetable-attribution">Timetables: <a href="https://search.ch/timetable/" target="_blank" rel="noreferrer">search.ch</a> · <a href="https://transport.opendata.ch/" target="_blank" rel="noreferrer">Swiss Transport API</a></p>
    </aside></main>
  </div>;
}
