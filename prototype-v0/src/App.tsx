import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { extend, plan, searchWarnings, type SearchSession } from "./api";
import { categorize, metrics, type ModelMode, type EndpointPreference, type Proposal } from "./model";
import MapView from "./MapView";
import JourneyPlan from "./JourneyPlan";
import { cyclingOnly, formatMinutes, type CyclingComparison, type Point } from "./routing";
import { exploredStops } from "./mapData";
import PlaceInput, { type PlaceValue } from "./PlaceInput";
import { KNOWN_PLACES, mapPlace, nameMapPlace, MAX_WAYPOINTS } from "./places";
import { preferenceOptions, type CyclingPreference } from "./preferences";
import { parseSwissDateTime, swissDateTimeInput } from "./departure";

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "numeric", month: "short" });
const BIKE_ONLY_ID = "cycling-only-reference";

function CyclingCard({ comparison, selected, start, maxBikeMinutes, onSelect }: {
  comparison: CyclingComparison; selected: boolean; start: Date; maxBikeMinutes: number; onSelect: () => void;
}) {
  return <button type="button" className={`journey-card cycling-only-card${selected ? " selected" : ""}`}
    onClick={onSelect} aria-pressed={selected}>
    <span className="category-badges"><span>Cycling only · estimate</span></span>
    <span className="journey-topline"><strong>≈ {formatMinutes(comparison.minutes)}</strong><span>0 boardings</span></span>
    <span className="arrival-summary">Estimated arrival <b>{clock.format(comparison.arrival)}</b>
      {day.format(comparison.arrival) !== day.format(start) && ` · ${day.format(comparison.arrival)}`}</span>
    <span className="cycling-summary">{comparison.distanceKm.toFixed(1)} km straight-line distance · 15 km/h</span>
    <span className="comparison-caution">Reference only: roads, hills and barriers are not included.</span>
    {comparison.minutes > maxBikeMinutes && <span className="comparison-caution">Exceeds your {maxBikeMinutes}-minute cycling budget for transit journeys.</span>}
    <span className="journey-plan-toggle">{selected ? "Shown on the map" : "Show cycling estimate on map"}</span>
  </button>;
}

function JourneyCard({ proposal, selected, expanded, planId, onSelect }: {
  proposal: Proposal; selected: boolean; expanded: boolean; planId: string; onSelect: () => void;
}) {
  const { journey: j, categories, extraMinutes, activeSaved } = proposal;
  const m = metrics(j), finalArrival = new Date(j.arrival.getTime() + m.end * 60_000);
  return <button type="button" className={`journey-card${selected ? " selected" : ""}`}
    onClick={onSelect} aria-expanded={expanded} aria-controls={planId}>
    <span className="category-badges">{categories.map(c => <span key={c}>{c}</span>)}</span>
    <span className="journey-topline"><strong>{formatMinutes(j.totalMinutes)}</strong>
      <span>{m.boardings} boarding{m.boardings === 1 ? "" : "s"} · {j.changes === 0 ? "no changes" : `${j.changes} change${j.changes === 1 ? "" : "s"}`}</span></span>
    <span className="arrival-summary">Arrive at your destination at <b>{clock.format(finalArrival)}</b>
      {day.format(finalArrival) !== day.format(j.startTime) && ` · ${day.format(finalArrival)}`}</span>
    {day.format(finalArrival) !== day.format(j.startTime) && <span className="comparison-caution">Next-day arrival. Total time includes waiting.</span>}
    <span className="route-services">{j.services.join(" → ")}</span>
    <span className="cycling-summary"><b>{formatMinutes(m.active)} cycling or walking</b>
      {" "}· cycling ≈ {formatMinutes(m.bike)} · walking {formatMinutes(m.walk)}</span>
    <span className="cycling-summary">Active time at start {formatMinutes(m.activeStart)} · arrival {formatMinutes(m.activeEnd)}
      {m.middle > 0 && ` · cycling between services ${formatMinutes(m.middle)}`}</span>
    <span className="route-stops">{j.originStation.name} → {j.destinationStation.name}</span>
    {!!j.waypoints?.length && <span className="route-stops">Via {j.waypoints.map(w => w.place.label).join(" → ")}</span>}
    {m.middle > 0 && <span className="middle-badge">{j.waypoints?.length ? "Cycling between journey stages" : "One cycling transfer"}</span>}
    {extraMinutes > 0 && <span className="tradeoff">{formatMinutes(extraMinutes)} longer than the fastest
      {activeSaved > 0 ? ` · ${formatMinutes(activeSaved)} less cycling or walking` : ""}</span>}
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
  const [mode, setMode] = useState<ModelMode>("baseline");
  const [cycling, setCycling] = useState<CyclingPreference>("balanced");
  const [endpoint, setEndpoint] = useState<EndpointPreference>("none");
  const [departureMode, setDepartureMode] = useState<"now" | "scheduled">("now");
  const [departureInput, setDepartureInput] = useState(() => swissDateTimeInput(new Date(Date.now() + 60 * 60_000)));
  const options = useMemo(() => preferenceOptions(cycling, endpoint), [cycling, endpoint]);
  const [session, setSession] = useState<SearchSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const solution = mode === "extended" ? session?.extended ?? session?.baseline : session?.baseline;
  const proposals = useMemo(() => categorize(solution?.journeys ?? [], session?.options ?? options), [solution, session, options]);
  const selected = selectedId === BIKE_ONLY_ID ? null : proposals.find(p => p.journey.id === selectedId)?.journey ?? proposals[0]?.journey ?? null;
  const bikeOnlySelected = !!session && selected === null;
  const cyclingReference = useMemo(() => session ? cyclingOnly(session.origin, session.destination, session.start, session.waypoints) : null, [session]);
  const mapWaypoints = useMemo(() => viaInputs.flatMap((input, index) => {
    const place = input.value.place ?? session?.waypoints?.[index];
    return place ? [{ id: input.id, place, number: index + 1 }] : [];
  }), [viaInputs, session]);
  const stops = useMemo(() => session ? exploredStops(session.network.stops.values(), session.originStations, session.destinationStations) : [], [session]);
  const warnings = session ? searchWarnings(session) : [];

  function invalidate() { setSession(null); setSelectedId(null); setExpandedId(null); setError(""); setProgress(""); }
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
        <p>Find your way with a bike, trains, buses and trams.</p>
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
        <details className="preferences"><summary>Preferences · optional</summary>
          <div className="preference-grid">
            <label><span>How much cycling?</span><select disabled={loading} value={cycling}
              onChange={e => { invalidate(); setCycling(e.target.value as CyclingPreference); }}>
              <option value="less">Less · up to 40 min total</option><option value="balanced">Balanced · up to 90 min total</option>
              <option value="more">More · up to 150 min total</option>
            </select></label>
            <label><span>Extra category</span><select disabled={loading} value={endpoint}
              onChange={e => { invalidate(); setEndpoint(e.target.value as EndpointPreference); }}>
              <option value="none">Just the three main categories</option><option value="start">Less cycling or walking at start</option><option value="end">Less cycling or walking at arrival</option>
            </select></label>
          </div>
          <p>Up to {options.maxAccessMinutes} minutes cycling at each {viaInputs.length ? "stage's " : ""}end{mode === "extended" ? `, and ${options.maxIntermediateMinutes} minutes between services` : ""}.
            {" "}Up to {options.maxBoardings} boardings and {options.horizonMinutes / 60} hours overall, including waiting.</p>
        </details>
        <button className="search-button" type="submit" disabled={loading}>{loading ? "Finding journeys…" : "Find journeys"}</button>
      </form>
      <div className="assumptions"><span><b>15 km/h</b> cycling estimate</span><span><b>3 min</b> before each boarding</span>
        <span><b>{session ? `${day.format(session.start)}, ${clock.format(session.start)}` : departureMode === "now" ? "Leave now" : "Chosen departure"}</b> · Swiss time</span>
        <span>Arrival within <b>{options.horizonMinutes / 60} hours</b> · includes overnight waiting</span></div>
      {loading && <div className="loading-block" role="status"><div className="progress-track"><i /></div>
        <p>{progress}</p><small>{proposals.length ? "You can open a travel plan while we check more options." : "The timetable service can take around 20 seconds to respond."}</small>
        <button type="button" className="cancel-button" onClick={cancel}>{proposals.length ? "Stop looking · keep these options" : "Stop search"}</button></div>}
      {!loading && progress && <p role="status">{progress}</p>}
      {error && <div className="error-block" role="alert"><strong>We could not complete this search.</strong><p>{error}</p></div>}
      {session && cyclingReference && <section className="results" aria-live="polite">
        <p className="resolved-places">{[session.origin, ...session.waypoints ?? [], session.destination].map(p => p.label).join(" → ")}</p>
        <div className="results-heading"><div><p className="eyebrow">{mode} results</p><h2>Your journey options</h2></div></div>
        {warnings.length > 0 && <details className="search-notice"><summary>Some alternatives could not be checked</summary>{warnings.map(w => <p key={w}>{w}</p>)}</details>}
        {!proposals.length && !loading && <p className="empty-results">{warnings.length
          ? "The timetable service did not return enough usable data. Please try this journey again."
          : `No transit journey was found within your cycling limits and ${session.options.horizonMinutes / 60}-hour arrival window. Try a different departure time or More cycling. This limited search can miss connections.`}</p>}
        {!proposals.length && loading && <p className="comparison-note">Cycling estimate ready. Transit options will appear as they are found.</p>}
        {proposals.length > 0 && <p className="comparison-note">Fastest transit option: {proposals[0].journey.totalMinutes === cyclingReference.minutes
          ? "the same estimated time as cycling only."
          : `${formatMinutes(Math.abs(proposals[0].journey.totalMinutes - cyclingReference.minutes))} ${proposals[0].journey.totalMinutes < cyclingReference.minutes ? "faster" : "slower"} than the cycling-only estimate.`}</p>}
        {session.extended && Number.isFinite(extendedFastest) && <p className="comparison-note">
          {!Number.isFinite(baselineFastest) ? "Extended found a journey where Baseline found none in this search."
            : extendedFastest < baselineFastest ? `Extended arrives ${formatMinutes(baselineFastest - extendedFastest)} earlier than Baseline in this search.`
              : "Both models have the same fastest arrival in this search."}
          {" "}Same departure time and limits.</p>}
        {proposals.length > 0 && <p className="result-explanation">Transit categories compare the connections explored. Boardings include the first vehicle. A route can win several categories.
          {" "}Alternatives arrive at most {session.options.extraTimeMinutes} minutes after the fastest.</p>}
        <div className="journey-list"><CyclingCard comparison={cyclingReference} selected={bikeOnlySelected} start={session.start}
          maxBikeMinutes={session.options.maxBikeMinutes} onSelect={() => { setSelectedId(BIKE_ONLY_ID); setExpandedId(null); }} />
          {proposals.map((proposal, index) => {
          const j = proposal.journey, expanded = expandedId === j.id, planId = `journey-plan-${index}`;
          return <div key={j.id} className="journey-option"><JourneyCard proposal={proposal} selected={selected?.id === j.id}
            expanded={expanded} planId={planId} onSelect={() => { setSelectedId(j.id); setExpandedId(expanded ? null : j.id); }} />
            {expanded && <JourneyPlan id={planId} journey={j} origin={session.origin} destination={session.destination} />}</div>;
        })}</div>
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
        accessMinutes={session?.options.maxAccessMinutes ?? options.maxAccessMinutes} egressMinutes={session?.options.maxEgressMinutes ?? options.maxEgressMinutes} />
      <div className="model-note"><strong>Experimental model</strong><p>Cycling uses straight-line estimates; map lines are schematic.
        Bicycle availability after transit is assumed. Carriage and reservation rules are deferred.</p></div>
    </aside></main>
  </div>;
}
