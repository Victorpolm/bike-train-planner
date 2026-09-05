import { type FormEvent, useMemo, useRef, useState } from "react";
import { extend, plan, searchWarnings, type SearchSession } from "./api";
import { categorize, DEFAULT_OPTIONS, metrics, type ModelMode, type Options, type Proposal } from "./model";
import MapView from "./MapView";
import JourneyPlan from "./JourneyPlan";
import { formatMinutes } from "./routing";

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
  const [fromInput, setFromInput] = useState("Stauffacherstrasse 60, Zürich");
  const [toInput, setToInput] = useState("Laax GR, posta");
  const [mode, setMode] = useState<ModelMode>("baseline");
  const [options, setOptions] = useState<Options>({ ...DEFAULT_OPTIONS });
  const [session, setSession] = useState<SearchSession | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const runId = useRef(0);
  const solution = mode === "extended" ? session?.extended : session?.baseline;
  const proposals = useMemo(() => categorize(solution?.journeys ?? [], session?.options ?? options), [solution, session, options]);
  const selected = proposals.find(p => p.journey.id === selectedId)?.journey ?? proposals[0]?.journey ?? null;
  const warnings = session ? searchWarnings(session) : [];

  function invalidate() { setSession(null); setSelectedId(null); setExpandedId(null); setError(""); setProgress(""); }
  function changeOption<K extends keyof Options>(key: K, value: Options[K]) { invalidate(); setOptions(o => ({ ...o, [key]: value })); }
  function cancel() {
    runId.current++; controller.current?.abort(); setLoading(false); invalidate(); setProgress("Search cancelled.");
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    if (loading || !fromInput.trim() || !toInput.trim()) return;
    invalidate(); controller.current?.abort();
    const id = ++runId.current, abort = new AbortController(); controller.current = abort;
    setLoading(true);
    try {
      const next = await plan(fromInput.trim(), toInput.trim(), mode, options, abort.signal,
        message => { if (id === runId.current) setProgress(message); });
      if (id === runId.current) { setSession(next); setProgress(""); }
    } catch (e) {
      if (id === runId.current && !abort.signal.aborted) setError(e instanceof Error ? e.message : "Search failed. Please try again.");
    } finally { if (id === runId.current) setLoading(false); }
  }
  async function changeMode(next: ModelMode) {
    if (loading || next === mode) return;
    setMode(next); setExpandedId(null); setSelectedId(null); setError("");
    if (next === "extended" && session && !session.extended) {
      const id = ++runId.current; setLoading(true);
      try {
        const result = await extend(session, message => { if (id === runId.current) setProgress(message); });
        if (id === runId.current) { setSession(result); setProgress(""); }
      } catch (e) {
        if (id === runId.current) setError(e instanceof Error ? e.message : "The extended search failed.");
      } finally { if (id === runId.current) setLoading(false); }
    }
  }
  const numeric = (label: string, key: keyof Pick<Options, "maxBikeMinutes" | "maxAccessMinutes" | "maxEgressMinutes" |
    "maxIntermediateMinutes" | "extraTimeMinutes" | "horizonMinutes" | "maxBoardings">, min: number, max: number) =>
    <label><span>{label}</span><input type="number" min={min} max={max} step="1" required disabled={loading}
      value={Number.isFinite(options[key]) ? options[key] : ""} onChange={e => changeOption(key, e.target.valueAsNumber)} /></label>;
  const best = (journeys: { totalMinutes: number }[]) => Math.min(...journeys.map(j => j.totalMinutes));
  const baselineFastest = session ? best(session.baseline.journeys) : Infinity;
  const extendedFastest = session?.extended ? best(session.extended.journeys) : Infinity;

  return <div className="app-shell">
    <header><a className="brand" href="#top" aria-label="Bike plus train home">
      <span className="brand-mark">B<span>+</span>T</span><span><strong>Bike + Train</strong><small>Swiss route experiment</small></span>
    </a><span className="prototype-badge">Baseline + Extended</span></header>
    <main id="top"><section className="planner-panel">
      <div className="intro"><p className="eyebrow">More ways to make the journey</p>
        <h1>A little cycling.<br />More possibilities.</h1>
        <p>Combine your bike with trains, buses and trams. Compare a quicker arrival, less cycling and fewer changes.</p>
      </div>
      <form onSubmit={search} className="search-form">
        <div className="place-inputs">
          <label><span>Departure point</span><input value={fromInput} required disabled={loading} autoComplete="off"
            onChange={e => { invalidate(); setFromInput(e.target.value); }} placeholder="Street, place or station" /></label>
          <button className="swap-button" type="button" disabled={loading} aria-label="Swap departure and arrival"
            onClick={() => { invalidate(); setFromInput(toInput); setToInput(fromInput); }}>⇅</button>
          <label><span>Arrival point</span><input value={toInput} required disabled={loading} autoComplete="off"
            onChange={e => { invalidate(); setToInput(e.target.value); }} placeholder="Street, place or station" /></label>
        </div>
        <fieldset className="model-picker" disabled={loading}>
          <legend>Choose your routing model</legend>
          <div className="model-buttons">
            <button type="button" aria-pressed={mode === "baseline"} onClick={() => void changeMode("baseline")}>
              <strong>Baseline</strong><span>Cycle before and after transit</span></button>
            <button type="button" aria-pressed={mode === "extended"} onClick={() => void changeMode("extended")}>
              <strong>Extended</strong><span>Also allow one cycling transfer</span></button>
          </div>
          <p>Both allow ordinary public transport changes. Extended keeps the Baseline options.</p>
        </fieldset>
        <details className="preferences"><summary>Cycling limits & preferences</summary>
          <div className="preference-grid">
            {numeric("Total cycling limit (min)", "maxBikeMinutes", 0, 240)}
            {numeric("Cycling at start (max min)", "maxAccessMinutes", 0, 120)}
            {numeric("Cycling at arrival (max min)", "maxEgressMinutes", 0, 120)}
            {numeric("Cycling transfer (max min)", "maxIntermediateMinutes", 0, 60)}
            {numeric("Public transport boardings (max)", "maxBoardings", 1, 8)}
            {numeric("Journey duration (max min)", "horizonMinutes", 30, 1440)}
            {numeric("Extra time for alternatives (min)", "extraTimeMinutes", 0, 1440)}
            <label><span>Optional fourth category</span><select disabled={loading} value={options.endpointPreference}
              onChange={e => changeOption("endpointPreference", e.target.value as Options["endpointPreference"])}>
              <option value="none">Three main categories</option><option value="start">Shorter ride at start</option><option value="end">Shorter ride at arrival</option>
            </select></label>
          </div>
          <p>Least cycling and fewest changes stay within your extra-time allowance of the fastest journey. Every proposal includes public transport.</p>
        </details>
        <button className="search-button" type="submit" disabled={loading}>{loading ? "Calculating…" : `Find ${mode === "baseline" ? "Baseline" : "Extended"} journeys`}</button>
      </form>
      <div className="assumptions"><span><b>15 km/h</b> cycling estimate</span><span><b>3 min</b> before each boarding</span>
        <span><b>{session ? `${day.format(session.start)}, ${clock.format(session.start)}` : "Leave now"}</b> · Swiss time</span></div>
      {loading && <div className="loading-block" role="status"><div className="progress-track"><i /></div>
        <p>{progress}</p><small>We compare several stops and services. Extended can take a little longer.</small>
        <button type="button" className="cancel-button" onClick={cancel}>Cancel search</button></div>}
      {!loading && progress && <p role="status">{progress}</p>}
      {error && <div className="error-block" role="alert"><strong>We could not complete this search.</strong><p>{error}</p></div>}
      {!loading && session && <section className="results" aria-live="polite" aria-busy={loading}>
        <p className="resolved-places">{session.origin.label} → {session.destination.label}</p>
        <div className="results-heading"><div><p className="eyebrow">{mode} results</p><h2>{proposals.length ? "Your journey options" : "No journey found"}</h2></div></div>
        {warnings.length > 0 && <div className="search-notice" role="status"><strong>Partial search</strong>{warnings.map(w => <p key={w}>{w}</p>)}</div>}
        {!proposals.length && <p className="empty-results">No journey was found among the sampled connections within these limits.
          {mode === "baseline" ? " Try Extended, or increase your cycling or journey-time limits." : " Try increasing your cycling or journey-time limits."}</p>}
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
        <details className="search-coverage"><summary>Stops explored & search limits</summary>
          <p>Catchments expand in 20-minute steps, up to {session.options.maxAccessMinutes} minutes at departure and {session.options.maxEgressMinutes} at arrival.
            Stop and timetable sampling can miss useful journeys.</p>
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
