import { type FormEvent, useMemo, useRef, useState } from "react";
import { extend, plan, searchWarnings, type SearchSession } from "./api";
import { categorize, metrics, type ModelMode, type EndpointPreference, type Proposal } from "./model";
import MapView from "./MapView";
import JourneyPlan from "./JourneyPlan";
import { formatMinutes } from "./routing";
import PlaceInput, { type PlaceValue } from "./PlaceInput";
import { KNOWN_PLACES } from "./places";
import { preferenceOptions, type CyclingPreference } from "./preferences";

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "numeric", month: "short" });

function JourneyCard({ proposal, selected, expanded, planId, onSelect }: {
  proposal: Proposal; selected: boolean; expanded: boolean; planId: string; onSelect: () => void;
}) {
  const { journey: j, categories, extraMinutes, cyclingSaved } = proposal;
  const m = metrics(j), finalArrival = new Date(j.arrival.getTime() + m.end * 60_000);
  return <button type="button" className={`journey-card${selected ? " selected" : ""}`}
    onClick={onSelect} aria-expanded={expanded} aria-controls={planId}>
    <span className="category-badges">{categories.map(c => <span key={c}>{c}</span>)}</span>
    <span className="journey-topline"><strong>{formatMinutes(j.totalMinutes)}</strong>
      <span>{j.changes === 0 ? "No changes" : `${j.changes} change${j.changes === 1 ? "" : "s"}`}</span></span>
    <span className="arrival-summary">Arrive at your destination at <b>{clock.format(finalArrival)}</b>
      {day.format(finalArrival) !== day.format(j.startTime) && ` · ${day.format(finalArrival)}`}</span>
    <span className="route-services">{j.services.join(" → ")}</span>
    <span className="cycling-summary"><b>{m.bike} min cycling</b> · start {m.start}
      {m.middle > 0 && ` · between services ${m.middle}`} · arrival {m.end}</span>
    <span className="route-stops">{j.originStation.name} → {j.destinationStation.name}</span>
    {m.middle > 0 && <span className="middle-badge">One cycling transfer</span>}
    {extraMinutes > 0 && <span className="tradeoff">{formatMinutes(extraMinutes)} longer than the fastest
      {cyclingSaved > 0 ? ` · ${formatMinutes(cyclingSaved)} less cycling` : ""}</span>}
    <span className="journey-plan-toggle">{expanded ? "Hide travel plan −" : "View travel plan +"}</span>
  </button>;
}

export default function App() {
  const initial = (stopId: string): PlaceValue => {
    const place = KNOWN_PLACES.find(p => p.stopId === stopId)!; return { text: place.label, place };
  };
  const [fromInput, setFromInput] = useState<PlaceValue>(() => initial("8503000"));
  const [toInput, setToInput] = useState<PlaceValue>(() => initial("8509786"));
  const [mode, setMode] = useState<ModelMode>("baseline");
  const [cycling, setCycling] = useState<CyclingPreference>("balanced");
  const [endpoint, setEndpoint] = useState<EndpointPreference>("none");
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
  const selected = proposals.find(p => p.journey.id === selectedId)?.journey ?? proposals[0]?.journey ?? null;
  const warnings = session ? searchWarnings(session) : [];

  function invalidate() { setSession(null); setSelectedId(null); setExpandedId(null); setError(""); setProgress(""); }
  function cancel() {
    runId.current++; controller.current?.abort(); setLoading(false); setProgress(proposals.length ? "Search stopped. The proposals already found are kept below." : "Search stopped. You can try again.");
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    if (loading || !fromInput.text.trim() || !toInput.text.trim()) return;
    invalidate(); controller.current?.abort();
    const id = ++runId.current, abort = new AbortController(); controller.current = abort;
    setLoading(true);
    try {
      const next = await plan(fromInput.place ?? fromInput.text.trim(), toInput.place ?? toInput.text.trim(), mode, options, abort.signal,
        message => { if (id === runId.current) setProgress(message); },
        result => { if (id === runId.current) setSession(result); });
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
          <button className="swap-button" type="button" disabled={loading} aria-label="Swap departure and arrival"
            onClick={() => { invalidate(); setFromInput(toInput); setToInput(fromInput); }}>⇅</button>
          <PlaceInput label="To" value={toInput} disabled={loading} onChange={value => { invalidate(); setToInput(value); }} />
        </div>
        <fieldset className="model-picker" disabled={loading}>
          <legend>Journey options</legend>
          <div className="model-buttons">
            <button type="button" aria-pressed={mode === "baseline"} onClick={() => void changeMode("baseline")}>
              <strong>Baseline</strong><span>Cycle before and after transit</span></button>
            <button type="button" aria-pressed={mode === "extended"} onClick={() => void changeMode("extended")}>
              <strong>Extended</strong><span>Also allow one cycling transfer</span></button>
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
              <option value="none">Just the three main categories</option><option value="start">Shorter ride at start</option><option value="end">Shorter ride at arrival</option>
            </select></label>
          </div>
          <p>Up to {options.maxAccessMinutes} minutes cycling at each end{mode === "extended" ? `, and ${options.maxIntermediateMinutes} minutes between services` : ""}.
            We handle the other settings for you.</p>
        </details>
        <button className="search-button" type="submit" disabled={loading}>{loading ? "Finding journeys…" : "Find journeys"}</button>
      </form>
      <div className="assumptions"><span><b>15 km/h</b> cycling estimate</span><span><b>3 min</b> before each boarding</span>
        <span><b>{session ? `${day.format(session.start)}, ${clock.format(session.start)}` : "Leave now"}</b> · Swiss time</span></div>
      {loading && <div className="loading-block" role="status"><div className="progress-track"><i /></div>
        <p>{progress}</p><small>{proposals.length ? "You can open a travel plan while we check more options." : "The timetable service can take around 20 seconds to respond."}</small>
        <button type="button" className="cancel-button" onClick={cancel}>{proposals.length ? "Stop looking · keep these options" : "Stop search"}</button></div>}
      {!loading && progress && <p role="status">{progress}</p>}
      {error && <div className="error-block" role="alert"><strong>We could not complete this search.</strong><p>{error}</p></div>}
      {session && (proposals.length > 0 || !loading) && <section className="results" aria-live="polite">
        <p className="resolved-places">{session.origin.label} → {session.destination.label}</p>
        <div className="results-heading"><div><p className="eyebrow">{mode} results</p><h2>{proposals.length ? "Your journey options" : warnings.length ? "Search incomplete" : "No journey found"}</h2></div></div>
        {warnings.length > 0 && <details className="search-notice"><summary>Some alternatives could not be checked</summary>{warnings.map(w => <p key={w}>{w}</p>)}</details>}
        {!proposals.length && <p className="empty-results">{warnings.length
          ? "The timetable service did not return enough usable data. Please try this journey again."
          : "No connection was found within your cycling preference. Try More cycling, Extended, or a nearby stop."}</p>}
        {session.extended && Number.isFinite(extendedFastest) && <p className="comparison-note">
          {!Number.isFinite(baselineFastest) ? "Extended found a journey where Baseline found none in this search."
            : extendedFastest < baselineFastest ? `Extended arrives ${formatMinutes(baselineFastest - extendedFastest)} earlier than Baseline in this search.`
              : "Both models have the same fastest arrival in this search."}
          {" "}Same departure time and limits.</p>}
        {proposals.length > 0 && <p className="result-explanation">Best by category among the connections explored. A route can win several categories.
          {" "}Alternatives arrive at most {session.options.extraTimeMinutes} minutes after the fastest.</p>}
        <div className="journey-list">{proposals.map((proposal, index) => {
          const j = proposal.journey, expanded = expandedId === j.id, planId = `journey-plan-${index}`;
          return <div key={j.id} className="journey-option"><JourneyCard proposal={proposal} selected={selected?.id === j.id}
            expanded={expanded} planId={planId} onSelect={() => { setSelectedId(j.id); setExpandedId(expanded ? null : j.id); }} />
            {expanded && <JourneyPlan id={planId} journey={j} origin={session.origin} destination={session.destination} />}</div>;
        })}</div>
        <details className="search-coverage"><summary>Stops explored</summary>
          <p>We start with nearby stops and check a few alternatives. If needed, we look farther within your cycling preference. This search can miss useful journeys.</p>
          <div className="candidate-stations">{[["Near departure", session.originStations], ["Near arrival", session.destinationStations]].map(([title, list]) =>
            <div className="station-list" key={String(title)}><span>{String(title)}</span><div>{(list as SearchSession["originStations"]).map(s =>
              <small key={s.id}>{s.name}<b>{s.bikeMinutes} min</b></small>)}</div></div>)}</div>
        </details>
      </section>}
    </section><aside className="map-panel">
      <MapView origin={session?.origin ?? null} destination={session?.destination ?? null} originStations={session?.originStations ?? []}
        destinationStations={session?.destinationStations ?? []} selectedJourney={selected}
        accessMinutes={session?.options.maxAccessMinutes ?? options.maxAccessMinutes} egressMinutes={session?.options.maxEgressMinutes ?? options.maxEgressMinutes} />
      <div className="model-note"><strong>Experimental model</strong><p>Cycling uses straight-line estimates; map lines are schematic.
        Bicycle availability after transit is assumed. Carriage and reservation rules are deferred.</p></div>
    </aside></main>
  </div>;
}
