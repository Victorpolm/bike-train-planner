import { useId } from "react";
import { breakdown, finalClimb, pointAlong, STEEP_PERCENT, type CyclingRoute } from "./cycling";
import { formatMinutes } from "./routing";

export type CycleFocus = { routeId: string; distanceM: number };
export type NamedCycleRoute = { label: string; route: CyclingRoute };
const metres = (value: number | null) => value === null ? "Unknown" : `${Math.round(value)} m`;

export default function CyclingDetails({ routes, focus, onFocus }: {
  routes: NamedCycleRoute[]; focus: CycleFocus | null; onFocus: (focus: CycleFocus) => void;
}) {
  const id = useId();
  const selected = routes.find(r => r.route.id === focus?.routeId) ?? routes[0];
  if (!selected) return null;
  const { route, label } = selected;
  const distance = focus?.routeId === route.id ? Math.min(route.distanceKm * 1000, focus.distanceM) : 0;
  const point = pointAlong(route.elevation, distance), finish = finalClimb(route);
  const section = route.sections.find(s => s.startM <= distance && s.endM >= distance);
  const elevations = route.elevation.flatMap(p => p.elevationM === null ? [] : [p.elevationM]);
  const low = elevations.length ? Math.floor(Math.min(...elevations) / 10) * 10 : 0;
  const high = elevations.length ? Math.max(low + 20, Math.ceil(Math.max(...elevations) / 10) * 10) : 20;
  const x = (d: number) => 46 + 534 * d / (route.distanceKm * 1000 || 1), y = (alt: number) => 146 - (alt - low) / (high - low) * 120;
  let drawing = false;
  const path = route.elevation.map(p => {
    if (p.elevationM === null) { drawing = false; return ""; }
    const command = drawing ? "L" : "M"; drawing = true;
    return `${command}${x(p.distanceM).toFixed(2)},${y(p.elevationM).toFixed(2)}`;
  }).join(" ");
  const pick = (distanceM: number) => onFocus({ routeId: route.id, distanceM: Math.max(0, Math.min(route.distanceKm * 1000, distanceM)) });
  return <section className="cycling-details" aria-labelledby={`${id}-title`}>
    <div className="cycling-details-heading"><h3 id={`${id}-title`}>Your cycling route</h3><a href="#journey-map">See on map</a></div>
    {routes.length > 1 ? <label className="cycle-leg-picker">Cycling leg<select value={route.id} onChange={event => onFocus({ routeId: event.target.value, distanceM: 0 })}>
      {routes.map((r, index) => <option key={`${r.route.id}-${index}`} value={r.route.id}>{r.label}</option>)}
    </select></label> : <p>{label}</p>}
    <dl className="cycle-stats">
      <div><dt>Routed distance</dt><dd>{route.distanceKm.toFixed(1)} km</dd></div>
      <div><dt>Estimated ride</dt><dd>{formatMinutes(route.ridingSeconds / 60)}</dd></div>
      <div><dt>Ascent</dt><dd>{metres(route.ascentM)}</dd></div>
      <div><dt>Descent</dt><dd>{metres(route.descentM)}</dd></div>
    </dl>
    <p className="cycle-caption">Times use a touring bicycle at moderate effort. Terrain and riding pace affect the estimate.</p>
    {route.startGapM + route.endGapM > 1 && <p className="cycle-caption">Connected to a nearby path: {Math.round(route.startGapM)} m at the start and {Math.round(route.endGapM)} m at the end. Journey timing includes about {Math.ceil(route.connectorMinutes)} min of walking with your bike for these dotted links. Check that you can reach the path; entrance access is unverified.</p>}
    <div className="elevation-heading"><h4>Elevation along this leg</h4><span>{Math.round(route.elevationCoverage * 100)}% covered</span></div>
    {elevations.length > 1 ? <>
      <svg className="elevation-chart" viewBox="0 0 600 180" role="img" aria-labelledby={`${id}-chart-title`}
        onPointerMove={event => {
          const box = event.currentTarget.getBoundingClientRect(); pick(((event.clientX - box.left) / box.width * 600 - 46) / 534 * route.distanceKm * 1000);
        }}>
        <title id={`${id}-chart-title`}>Elevation in metres over {route.distanceKm.toFixed(1)} kilometres. Use the slider to inspect a point on the map.</title>
        {[low, (low + high) / 2, high].map(tick => <g key={tick}><line x1="46" x2="580" y1={y(tick)} y2={y(tick)} className="elevation-grid" /><text x="39" y={y(tick) + 4} textAnchor="end">{Math.round(tick)}</text></g>)}
        <path d={path} className="elevation-path" />
        {route.steep.map((s, i) => <line key={i} x1={x(s.startM)} x2={x(s.endM)} y1="153" y2="153" className={s.gradePercent > 0 ? "slope-up" : "slope-down"} />)}
        <line x1={x(distance)} x2={x(distance)} y1="20" y2="153" className="elevation-cursor" />
        {point?.elevationM !== null && point?.elevationM !== undefined && <circle cx={x(distance)} cy={y(point.elevationM)} r="4" className="elevation-dot" />}
        <text x="46" y="175">0 km</text><text x="580" y="175" textAnchor="end">{route.distanceKm.toFixed(1)} km</text>
      </svg>
      <label className="elevation-slider" htmlFor={`${id}-distance`}>Inspect on map · {(distance / 1000).toFixed(2)} km · {metres(point?.elevationM ?? null)}
        <input id={`${id}-distance`} type="range" min="0" max={Math.round(route.distanceKm * 1000)} step="1" value={Math.round(distance)}
          aria-valuetext={`${(distance / 1000).toFixed(2)} kilometres, elevation ${metres(point?.elevationM ?? null)}`} onChange={event => pick(Number(event.target.value))} />
      </label>
      <p className="cycle-caption">Hover the profile or the cycling line; use the slider on touch/keyboard. Orange: climbs ≥{STEEP_PERCENT}%. Blue: descents ≤−{STEEP_PERCENT}%, over approximately 100 m. Gaps mean missing elevation.</p>
    </> : <p>Elevation is unavailable for this cycling leg.</p>}
    <p className="profile-location">At this point: {section?.infrastructure ?? "Unknown infrastructure"} · {section?.surface ?? "Unknown surface"} · posted limit band: {section?.speedLimit ?? "Unknown"}.</p>
    <div className="finish-climb"><strong>Climbing in the final {(finish.distanceM / 1000).toFixed(1)} km of this leg</strong>
      <p>{metres(finish.ascentM)} ascent · steepest sampled climb {finish.maxGrade === null ? "unknown" : `${finish.maxGrade.toFixed(1)}%`}.</p>
    </div>
    {!!route.steep.length && <details className="cycle-breakdown"><summary>Steep sections ({route.steep.length})</summary>
      <ul>{route.steep.map((s, index) => <li key={index}><button type="button" onClick={() => pick((s.startM + s.endM) / 2)}>
        {(s.startM / 1000).toFixed(1)}–{(s.endM / 1000).toFixed(1)} km · {s.gradePercent > 0 ? "+" : ""}{s.gradePercent.toFixed(1)}%</button></li>)}</ul>
    </details>}
    {([ ["surface", "Surface"], ["infrastructure", "Cycling infrastructure"], ["speedLimit", "Posted road speed bands"] ] as const).map(([key, title]) =>
      <details className="cycle-breakdown" key={key} open={key === "surface"}><summary>{title}</summary>
        <ul>{breakdown(route, key).map(item => <li key={item.label}><span>{item.label}</span><span>{(item.metres / 1000).toFixed(1)} km · {Math.round(item.percent)}%</span></li>)}</ul>
        {key === "infrastructure" && <p className="cycle-caption">Mapped separated cycleways, painted lanes, shared roads and paths. Protection on shared roads may be unmapped; separation does not establish route safety.</p>}
        {key === "speedLimit" && <p className="cycle-caption">Posted limits from map tags, grouped by the routing provider. These are approximate bands, not exact signs or measured traffic speeds. Unknown includes missing, conditional or unrecognized limits.</p>}
      </details>)}
    <p className="cycle-caption">Elevation is sampled and smoothed; short ramps, bridges and tunnels may be inaccurate. Road/path attributes can be missing or outdated. <a href="https://brouter.de/" target="_blank" rel="noreferrer">BRouter</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · <a href="https://srtm.csi.cgiar.org/" target="_blank" rel="noreferrer">SRTM elevation</a>.</p>
  </section>;
}
