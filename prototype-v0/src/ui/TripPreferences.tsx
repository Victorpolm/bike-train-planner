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
import type { CyclingAmount } from "../cyclingDuration";
import CyclingAmountControl from "./CyclingAmountControl";

export default function TripPreferences({
  open,
  onOpenChange,
  disabled,
  mode,
  hasWaypoints,
  bicycleScope,
  routePreference,
  cyclingAmount,
  endpoint,
  cyclingPosition,
  takeBikeOnTransit,
  maxWalkingMinutes,
  onMode,
  onScope,
  onRoute,
  onCyclingAmount,
  onEndpoint,
  onPosition,
  onBikeOnTransit,
  onWalkingMinutes,
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
  cyclingAmount: CyclingAmount;
  endpoint: EndpointPreference;
  cyclingPosition: CyclingPosition;
  takeBikeOnTransit: boolean;
  maxWalkingMinutes: number;
  onMode: (mode: ModelMode) => void;
  onScope: (scope: BicycleScope) => void;
  onRoute: (route: RoutePreference) => void;
  onCyclingAmount: (amount: CyclingAmount) => void;
  onEndpoint: (endpoint: EndpointPreference) => void;
  onPosition: (position: CyclingPosition) => void;
  onBikeOnTransit: (enabled: boolean) => void;
  onWalkingMinutes: (minutes: number) => void;
  hills: HillPreferences;
  climbOptimization: boolean;
  onHills: (hills: HillPreferences) => void;
  onClimbOptimization: (enabled: boolean) => void;
}) {
  const extraCount =
    (endpoint === "both" ? 2 : endpoint === "none" ? 0 : 1) +
    Number(climbOptimization) +
    Number(hills.mode === "gentler");
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
            "This restricts where cycling is allowed. Extra categories below add comparisons within these rules. " +
            (cyclingPosition === "start-only"
              ? "Ride before your first service, then walk from public transport to your destination."
              : cyclingPosition === "end-only"
                ? "Walk from your starting point to public transport, then ride after your last service."
                : "Baseline allows cycling at either end. Extended also explores cycling between services.") +
            (cyclingPosition !== "anywhere"
              ? " Cycling between services is disabled. Walking uses pedestrian paths and its own time allowance."
              : "") +
            (takeBikeOnTransit
              ? " Your bicycle travels with you on public transport."
              : " Bicycle access restrictions and bicycle charges do not apply to your transit journey.")
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
      {cyclingPosition !== "anywhere" && (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              disabled={disabled}
              checked={takeBikeOnTransit}
              onChange={(e) => onBikeOnTransit(e.target.checked)}
            />
            <span>Take my bicycle on public transport</span>
          </label>
          <p className="preference-note">
            {takeBikeOnTransit
              ? "Walk with your bicycle on the walking sections. Bicycle tickets and carriage rules apply."
              : cyclingPosition === "start-only"
                ? "Leave the bicycle at your departure station. Continue by public transport and on foot."
                : "Start on foot. Use a bicycle already waiting at your arrival station."}
          </p>
          <label>
            <span>Walk to/from public transport · up to (min)</span>
            <input
              type="number"
              min="0"
              max="60"
              step="1"
              required
              disabled={disabled}
              value={Number.isFinite(maxWalkingMinutes) ? maxWalkingMinutes : ""}
              onChange={(e) => onWalkingMinutes(e.target.valueAsNumber)}
            />
            <small>Per walking section. Separate from your cycling allowance.</small>
          </label>
        </>
      )}
      {takeBikeOnTransit && (
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
      )}
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
      </div>
      <CyclingAmountControl value={cyclingAmount} disabled={disabled} onChange={onCyclingAmount} />
      <div className="extra-categories-group">
        <div className="preference-heading">
          <strong>Extra categories</strong>
          <InlineHelp
            label="About extra categories"
            text="Choose any combination. These add alternatives to compare, within your journey limits. Endpoint alternatives reduce cycling or walking at that end; they do not forbid cycling elsewhere."
          />
        </div>
        <details className="extra-categories-menu">
          <summary>{extraCount ? `${extraCount} selected` : "Choose extra categories"}</summary>
          <fieldset className="extra-categories" disabled={disabled}>
            <legend className="sr-only">Extra category choices</legend>
            {(["start", "end"] as const).map((end) => (
              <label className="check-row" key={end}>
                <input
                  type="checkbox"
                  checked={endpoint === end || endpoint === "both"}
                  onChange={(e) => {
                    const other = end === "start" ? "end" : "start";
                    const hasOther = endpoint === other || endpoint === "both";
                    onEndpoint(
                      e.target.checked ? (hasOther ? "both" : end) : hasOther ? other : "none",
                    );
                  }}
                />
                <span>Less cycling or walking at {end === "start" ? "start" : "arrival"}</span>
              </label>
            ))}
            <label className="check-row">
              <input
                type="checkbox"
                disabled={disabled}
                checked={climbOptimization}
                onChange={(e) => onClimbOptimization(e.target.checked)}
              />
              <span>Reduce climbing</span>
            </label>
            {climbOptimization && (
              <p className="preference-note">
                Offers an alternative only when it saves at least 50 m and 25% of the climbing, with
                a limited time cost.
                <InlineHelp
                  label="How climbing alternatives are chosen"
                  text="Compared with the fastest journey (or latest departure for Arrive at), allow at most 30 extra minutes and 25% of its duration, within your overall alternative allowance. A saving of 100 m is worth up to 5 minutes in this initial compromise. Routes with incomplete elevation cannot qualify. Your cycling-path preference stays selected."
                />
              </p>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                checked={hills.mode === "gentler"}
                onChange={(e) =>
                  onHills({
                    ...hills,
                    mode: e.target.checked ? "gentler" : "none",
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
              />
              <span>Gentler slopes</span>
              <InlineHelp
                label="About gentler slopes"
                text="Adds an alternative with less uphill travel above your chosen percentage, when a suitable checked path is available within your time limits. Elevation is sampled and may miss short ramps, so this is a preference rather than a guaranteed limit. Your ordinary alternatives remain available."
              />
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
          </fieldset>
        </details>
      </div>
    </details>
  );
}
