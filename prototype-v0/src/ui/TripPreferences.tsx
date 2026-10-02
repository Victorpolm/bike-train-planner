import InfoDisclosure from "../InfoDisclosure";
import {
  BICYCLE_SCOPES,
  bicycleScopeHelp,
  bicycleScopeOptions,
  type BicycleScope,
} from "../bicyclePermission";
import {
  ROUTE_PREFERENCES,
  routePreferenceLabels,
  type RoutePreference,
} from "../cyclingPreferences";
import type { ModelMode, EndpointPreference } from "../model";
import type { CyclingPreference } from "../preferences";

export default function TripPreferences({
  open,
  onOpenChange,
  disabled,
  mode,
  hasWaypoints,
  bicycleScope,
  routePreference,
  cycling,
  endpoint,
  onMode,
  onScope,
  onRoute,
  onCycling,
  onEndpoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  mode: ModelMode;
  hasWaypoints: boolean;
  bicycleScope: BicycleScope;
  routePreference: RoutePreference;
  cycling: CyclingPreference;
  endpoint: EndpointPreference;
  onMode: (mode: ModelMode) => void;
  onScope: (scope: BicycleScope) => void;
  onRoute: (route: RoutePreference) => void;
  onCycling: (cycling: CyclingPreference) => void;
  onEndpoint: (endpoint: EndpointPreference) => void;
}) {
  return (
    <details
      className="preferences trip-preferences"
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
    >
      <summary>Preferences</summary>
      <fieldset className="model-picker" disabled={disabled}>
        <legend>Journey options</legend>
        <div className="model-buttons">
          <button
            type="button"
            aria-pressed={mode === "baseline"}
            onClick={() => onMode("baseline")}
          >
            <strong>Baseline</strong>
            <span>
              {hasWaypoints ? "Cycle at the ends of each stage" : "Cycle before and after transit"}
            </span>
          </button>
          <button
            type="button"
            aria-pressed={mode === "extended"}
            onClick={() => onMode("extended")}
          >
            <strong>Extended</strong>
            <span>Also allow one bike connection between services</span>
          </button>
        </div>
      </fieldset>
      <InfoDisclosure label="What does Extended add?">
        <p>
          Baseline allows cycling at the start and finish, plus ordinary public-transport changes.
          Extended also allows one cycling connection between services, for example: bike → train →
          bike to another station → train → bike.
        </p>
        <p>
          Your cycling limits and bicycle-access rules still apply. This does not require a longer
          ride. With intermediate stops, the one extra cycling connection is shared across the whole
          journey.
        </p>
      </InfoDisclosure>
      <fieldset
        className="bicycle-access"
        disabled={disabled}
        aria-describedby="bicycle-access-help"
      >
        <legend>Public transport with my bicycle</legend>
        {BICYCLE_SCOPES.map((scope) => (
          <label key={scope} className={bicycleScope === scope ? "selected" : ""}>
            <input
              type="radio"
              name="bicycle-access"
              value={scope}
              checked={bicycleScope === scope}
              onChange={() => {
                onScope(scope);
              }}
            />
            <span>{bicycleScopeOptions[scope]}</span>
          </label>
        ))}
      </fieldset>
      <p className="bus-preference-help" id="bicycle-access-help">
        {bicycleScopeHelp[bicycleScope]} Applies to trains, buses, trams, boats and other public
        transport.
      </p>
      <div className="preference-grid">
        <label>
          <span>Cycling path</span>
          <select
            disabled={disabled}
            value={routePreference}
            onChange={(e) => {
              onRoute(e.target.value as RoutePreference);
            }}
          >
            {ROUTE_PREFERENCES.map((p) => (
              <option key={p} value={p}>
                {routePreferenceLabels[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>How much cycling?</span>
          <select
            disabled={disabled}
            value={cycling}
            onChange={(e) => {
              onCycling(e.target.value as CyclingPreference);
            }}
          >
            <option value="less">Less · up to 40 min total</option>
            <option value="commuter">Commuter · up to 45 min total</option>
            <option value="balanced">Balanced · up to 90 min total</option>
            <option value="more">More · up to 150 min total</option>
            <option value="unrestricted">No separate cycling cap · can exceed 150 min</option>
          </select>
        </label>
        <label>
          <span>Extra category</span>
          <select
            disabled={disabled}
            value={endpoint}
            onChange={(e) => {
              onEndpoint(e.target.value as EndpointPreference);
            }}
          >
            <option value="none">Just the three main categories</option>
            <option value="start">Less cycling or walking at start</option>
            <option value="end">Less cycling or walking at arrival</option>
          </select>
        </label>
      </div>
    </details>
  );
}
