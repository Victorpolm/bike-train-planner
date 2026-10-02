import { CYCLING_PRESETS, type CyclingPreset } from "./cyclingPace";
import type { PersonalSettings } from "./travellerProfiles";
export default function PersonalSettingsFields({
  value,
  disabled,
  onChange,
}: {
  value: PersonalSettings;
  disabled: boolean;
  onChange: (value: PersonalSettings) => void;
}) {
  return (
    <div className="personal-fields">
      <div className="preference-grid">
        <label>
          <span>Riding profile</span>
          <select
            disabled={disabled}
            value={value.ridingPreset}
            onChange={(e) => {
              const ridingPreset = e.target.value as CyclingPreset;
              const { flatSpeedKmh, electricAssist } = CYCLING_PRESETS[ridingPreset];
              onChange({ ...value, ridingPreset, pace: { flatSpeedKmh, electricAssist } });
            }}
          >
            <option value="custom" disabled>
              Custom pace
            </option>
            {Object.entries(CYCLING_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label} · {p.flatSpeedKmh} km/h
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Flat-ground speed · km/h</span>
          <input
            type="number"
            min="8"
            max="35"
            step="0.5"
            required
            disabled={disabled}
            value={Number.isNaN(value.pace.flatSpeedKmh) ? "" : value.pace.flatSpeedKmh}
            onChange={(e) =>
              onChange({
                ...value,
                ridingPreset: "custom",
                pace: { ...value.pace, flatSpeedKmh: e.target.valueAsNumber },
              })
            }
          />
        </label>
        <label>
          <span>Passenger travelcard</span>
          <select
            disabled={disabled}
            value={value.fare.passenger}
            onChange={(e) =>
              onChange({
                ...value,
                fare: {
                  ...value.fare,
                  passenger: e.target.value as PersonalSettings["fare"]["passenger"],
                },
              })
            }
          >
            <option value="full">Full fare · no travelcard</option>
            <option value="half-fare">Half Fare · Halbtax</option>
            <option value="ga">GA Travelcard</option>
          </select>
        </label>
        <label>
          <span>Age · optional</span>
          <input
            type="number"
            min="0"
            max="120"
            step="1"
            disabled={disabled}
            value={value.age === null || Number.isNaN(value.age) ? "" : value.age}
            onChange={(e) =>
              onChange({ ...value, age: e.target.value === "" ? null : e.target.valueAsNumber })
            }
            aria-describedby="age-fare-note"
          />
        </label>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          disabled={disabled}
          checked={value.pace.electricAssist}
          onChange={(e) =>
            onChange({
              ...value,
              ridingPreset: "custom",
              pace: { ...value.pace, electricAssist: e.target.checked },
            })
          }
        />
        Electric assistance
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          disabled={disabled}
          checked={value.fare.annualBikePass}
          onChange={(e) =>
            onChange({ ...value, fare: { ...value.fare, annualBikePass: e.target.checked } })
          }
        />
        I have an annual bicycle pass
      </label>
      <p id="age-fare-note" className="profile-hint">
        Prices currently use adult, 2nd-class fares. Age is saved for future use; it does not apply
        a child or youth discount. Passenger travelcards and bicycle passes are separate.
      </p>
    </div>
  );
}
