import {
  BOARDING_COMPROMISE,
  JOURNEY_OBJECTIVES,
  objectiveLabels,
  type JourneyObjective,
} from "../journeyObjectives";
import InlineHelp from "./InlineHelp";

export default function JourneyObjectives({
  value,
  personalized,
  disabled,
  onChange,
}: {
  value: readonly JourneyObjective[];
  personalized: boolean;
  disabled: boolean;
  onChange: (value: JourneyObjective[]) => void;
}) {
  const visible = personalized ? JOURNEY_OBJECTIVES : JOURNEY_OBJECTIVES.slice(0, 4);
  return (
    <fieldset className="journey-objectives" disabled={disabled}>
      <legend className="preference-heading">
        Show alternatives for
        <InlineHelp
          label="How journey objectives work"
          text="Choose the alternatives you want to compare. The same journey can win several categories and appears once. Cycling only stays available as a separate reference. Your cycling, walking and bicycle-access preferences still apply to every transit alternative."
        />
      </legend>
      <div className="objective-options">
        {visible.map((objective) => (
          <label className="check-row" key={objective}>
            <input
              type="checkbox"
              checked={value.includes(objective)}
              disabled={disabled || (value.length === 1 && value.includes(objective))}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...value, objective] : value.filter((o) => o !== objective),
                )
              }
            />
            <span>{objectiveLabels[objective]}</span>
          </label>
        ))}
      </div>
      {value.includes("fewer-boardings") && (
        <p className="preference-note">
          Avoid a boarding when the time trade-off is worthwhile.
          <InlineHelp
            label="How fewer boardings are compared"
            text={`Pilot rule: avoiding one boarding is worth up to ${BOARDING_COMPROMISE.minutesPerBoarding} minutes. Total extra time is capped at 25% of the reference journey, without a fixed 30-minute cap. Equal scores favour the faster journey. For Arrive by, compare how much earlier you must leave. Actual boarding and transfer allowances still apply.`}
          />
        </p>
      )}
      {value.includes("less-traffic") && (
        <p className="preference-note">
          Compare mapped road-traffic exposure using road types and cycling infrastructure. This is
          not live traffic, scenic routing or a safety guarantee. Incomplete paths cannot win.
        </p>
      )}
      {value.includes("fewer-reservations") && (
        <p className="preference-note">
          Compare services requiring a bicycle reservation only when all their reservation rules are
          known. Availability of spaces is not checked.
        </p>
      )}
      {value.includes("cheapest") && (
        <p className="preference-note">
          Compare complete additional costs for your selected tickets and passes. Missing passenger,
          bicycle or reservation prices cannot win. Quotes appear after the route search.
        </p>
      )}
    </fieldset>
  );
}
