import type { CyclingRoute } from "./cycling";
import { modeTotals, travelModeLabel } from "./cyclingTerrain";
import { formatMinutes } from "./routing";
import { SWISSTOPO_SOURCE } from "./swisstopo";
import { routePreferenceLabels } from "./cyclingPreferences";

export default function CyclingTerrainSummary({ route }: { route: CyclingRoute }) {
  const totals = modeTotals(route),
    flagged = route.sections.filter((s) => s.mode !== "cycle" || s.reasons?.length);
  const topo = route.topoCheck;
  return (
    <div className="terrain-summary">
      <dl className="cycle-stats">
        {totals
          .filter((t) => t.metres > 0.5)
          .map((t) => (
            <div key={t.mode}>
              <dt>{travelModeLabel[t.mode]}</dt>
              <dd>
                {(t.metres / 1000).toFixed(2)} km · {formatMinutes(t.seconds / 60)}
              </dd>
            </div>
          ))}
      </dl>
      {route.preference && (
        <p className="cycle-caption">
          {routePreferenceLabels[route.preference]} ·{" "}
          {route.turnCount === undefined
            ? "Turn count unavailable"
            : route.turnCount + " navigation instructions"}
          . {route.preferenceNote}
        </p>
      )}
      <p className="cycle-caption">
        <a href={SWISSTOPO_SOURCE.url} target="_blank" rel="noreferrer">
          swisstopo check
        </a>
        :{" "}
        {topo
          ? topo.status === "unavailable"
            ? topo.note
            : (topo.status === "partial" ? "Partial check. " : "") +
              (topo.matchedMetres / 1000).toFixed(2) +
              " km matched to official path data. " +
              topo.note
          : "Unavailable for this path; riding access is not certified."}
      </p>
      {!!flagged.length && (
        <details className="cycle-breakdown">
          <summary>Walking and path restrictions ({flagged.length})</summary>
          <ul>
            {flagged.map((s, i) => (
              <li className="terrain-section" key={i}>
                <strong>
                  {(s.startM / 1000).toFixed(2)}–{(s.endM / 1000).toFixed(2)} km ·{" "}
                  {travelModeLabel[s.mode ?? "cycle"]}
                </strong>
                <span>
                  {s.pathType ?? "Unknown path"} · {s.surface} ·{" "}
                  {formatMinutes((s.seconds ?? 0) / 60)}
                </span>
                {s.reasons?.map((reason) => (
                  <span key={reason}>{reason}</span>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
