import { CYCLING_TIME_PRESETS, type CyclingAmount } from "../cyclingDuration";

export default function CyclingAmountControl({
  value,
  disabled,
  onChange,
}: {
  value: CyclingAmount;
  disabled: boolean;
  onChange: (value: CyclingAmount) => void;
}) {
  return (
    <fieldset className="cycling-amount" disabled={disabled}>
      <legend>How much cycling?</legend>
      <label>
        <span>I would like to cycle</span>
        <select
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as CyclingAmount["mode"] })}
        >
          <option value="at-most">At most</option>
          <option value="at-least">At least</option>
          <option value="none">No preference</option>
        </select>
      </label>
      {value.mode !== "none" && (
        <>
          <div className="cycling-time-presets" aria-label="Cycling duration presets">
            {CYCLING_TIME_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={value.minutes === minutes}
                onClick={() => onChange({ ...value, minutes })}
              >
                {minutes} min
              </button>
            ))}
          </div>
          <label>
            <span>Duration in minutes · choose above or enter a number</span>
            <input
              type="number"
              min="0"
              max="1440"
              step="1"
              required
              value={Number.isFinite(value.minutes) ? value.minutes : ""}
              onChange={(e) => onChange({ ...value, minutes: e.target.valueAsNumber })}
            />
          </label>
        </>
      )}
      <p className="preference-note">
        Across the whole journey, adding all cycling sections. Walking-only sections, waiting and
        facility visits do not count. Cycling estimates include short pushing and access connectors.
        {value.mode === "at-least" &&
          " If no checked journey reaches your minimum, no matching transit alternative is shown."}
        {value.mode === "none" &&
          " Shorter and longer rides are eligible, including rides over 150 minutes, within the journey search window."}
      </p>
    </fieldset>
  );
}
