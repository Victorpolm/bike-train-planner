import type { HillPreferences } from "../hills";
import InlineHelp from "./InlineHelp";
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
import type { ModelMode, EndpointPreference, CyclingPosition } from "../model";
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
  cyclingPosition,
  onMode,
  onScope,
  onRoute,
  onCycling,
  onEndpoint,
  onPosition,
  hills,
  climbOptimization,
  onHills,
  onClimbOptimization,
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
  cyclingPosition: CyclingPosition;
  onMode: (mode: ModelMode) => void;
  onScope: (scope: BicycleScope) => void;
  onRoute: (route: RoutePreference) => void;
  onCycling: (cycling: CyclingPreference) => void;
  onEndpoint: (endpoint: EndpointPreference) => void;
  onPosition: (position: CyclingPosition) => void;
  hills: HillPreferences;
  climbOptimization: boolean;
  onHills: (hills: HillPreferences) => void;
  onClimbOptimization: (enabled: boolean) => void;
}) {
  return (
    <details
      className="preferences trip-preferences"
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
    >
      <summary>Preferences</summary>
      <fieldset className="model-picker" disabled={disabled}>
        <legend className="preference-heading">
          Journey options
          <InlineHelp
            label="What does Extended add?"
            text={
              "Baseline allows cycling at the start and finish, plus ordinary public-transport changes. " +
              "Extended allows up to two cycling connections between services. It can still choose zero " +
              "or one when that gives a better journey. Cycling to the first service and from the last " +
              "service does not count towards this limit. " +
              "Your cycling limits and bicycle-access rules still apply. This does not require a longer " +
              "ride. The two-connection allowance is shared across the whole journey." +
              (hasWaypoints
                ? " Requested intermediate stops can add cycling at stage boundaries in either model. " +
                  "The beginning-only and end-only restrictions apply across the whole journey, including these stops."
                : "")
            }
          />
        </legend>
        <div className="model-buttons">
          <button
            type="button"
            aria-pressed={mode === "baseline"}
            onClick={() => onMode("baseline")}
          >
            <strong>Baseline</strong>
            <span>0 cycling connections between services</span>
          </button>
          <button
            type="button"
            aria-pressed={mode === "extended"}
            disabled={cyclingPosition !== "anywhere"}
            onClick={() => onMode("extended")}
          >
            <strong>Extended</strong>
            <span>Up to 2 cycling connections between services</span>
          </button>
        </div>
      </fieldset>
      <div className="preference-heading">
        <label htmlFor="cycling-position">Where would you like to cycle?</label>
        <InlineHelp
          label="About where you can cycle"
          text={
            (cyclingPosition === "start-only"
              ? "Ride before your first service only. Choose a public-transport stop as your destination."
              : cyclingPosition === "end-only"
                ? "Ride after your last service only. Choose a public-transport stop as your starting point."
                : "Baseline allows cycling at either end. Extended also explores cycling between services.") +
            (cyclingPosition !== "anywhere"
              ? " Cycling between services is disabled. Existing walking transfers remain possible; walking routes to or from an address are not yet supported."
              : "") +
            " Your bicycle travels with you on public transport."
          }
        />
      </div>
      <select
        id="cycling-position"
        disabled={disabled}
        value={cyclingPosition}
        onChange={(e) => onPosition(e.target.value as CyclingPosition)}
      >
        <option value="anywhere">At either end and between services</option>
        <option value="start-only">Only at the beginning</option>
        <option value="end-only">Only at the end</option>
      </select>
      <fieldset className="bicycle-access" disabled={disabled}>
        <legend className="preference-heading">
          Public transport with my bicycle
          <InlineHelp
            label="About bicycle access on public transport"
            text={
              bicycleScopeHelp[bicycleScope] +
              " Applies to trains, buses, trams, boats and other public transport."
            }
          />
        </legend>
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
      <fieldset className="hill-preferences" disabled={disabled}>
        <legend className="preference-heading">
          Climbing
          <InlineHelp
            label="About climbing preferences"
            text="Less climbing reduces cumulative ascent. Gentler slopes favours paths with less uphill travel above your chosen percentage. These are preferences within your time limits, not guaranteed gradient limits. Elevation is sampled and may miss short ramps; missing data stays unknown."
          />
        </legend>
        <label>
          <span>Cycling hills</span>
          <select
            value={hills.mode}
            onChange={(e) =>
              onHills({
                ...hills,
                mode: e.target.value as HillPreferences["mode"],
                maxUphillPercent:
                  Number.isFinite(hills.maxUphillPercent) &&
                  hills.maxUphillPercent >= 1 &&
                  hills.maxUphillPercent <= 20
                    ? hills.maxUphillPercent
                    : 6,
                extraMinutes:
                  Number.isInteger(hills.extraMinutes) &&
                  hills.extraMinutes >= 0 &&
                  hills.extraMinutes <= 60
                    ? hills.extraMinutes
                    : 15,
              })
            }
          >
            <option value="none">No hill preference</option>
            <option value="less-climbing">Less climbing</option>
            <option value="gentler">Gentler slopes</option>
          </select>
        </label>
        {hills.mode === "gentler" && (
          <label>
            <span>Prefer to avoid uphill slopes above (%)</span>
            <input
              type="number"
              min="1"
              max="20"
              step="0.5"
              required
              value={Number.isFinite(hills.maxUphillPercent) ? hills.maxUphillPercent : ""}
              onChange={(e) => onHills({ ...hills, maxUphillPercent: e.target.valueAsNumber })}
            />
            <small>
              6% means climbing 6 metres over about 100 metres. A preference, not a hard limit.
            </small>
          </label>
        )}
        {hills.mode !== "none" && (
          <label>
            <span>Extra minutes allowed per cycling section</span>
            <input
              type="number"
              min="0"
              max="60"
              step="1"
              required
              value={Number.isFinite(hills.extraMinutes) ? hills.extraMinutes : ""}
              onChange={(e) => onHills({ ...hills, extraMinutes: e.target.valueAsNumber })}
            />
            <small>
              Compared with the quickest checked cycling path. Your total cycling limit still
              applies.
            </small>
          </label>
        )}
        <label className="check-row">
          <input
            type="checkbox"
            checked={climbOptimization}
            onChange={(e) => onClimbOptimization(e.target.checked)}
          />
          <span>Use public transport to reduce climbing</span>
        </label>
        {climbOptimization && (
          <p>
            Adds a <b>Least cycling ascent</b> recommendation. Compares the climbing you do on the
            bike, within 60 extra journey minutes. Bicycle access and fares still apply; public
            transport does not have to be uphill itself.
          </p>
        )}
      </fieldset>
    </details>
  );
}
