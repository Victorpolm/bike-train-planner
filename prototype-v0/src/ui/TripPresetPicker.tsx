import type { TripPreset } from "../tripPresets";

export default function TripPresetPicker({
  value,
  disabled,
  onChange,
}: {
  value: TripPreset;
  disabled: boolean;
  onChange: (preset: TripPreset) => void;
}) {
  return (
    <div className="trip-preset-module">
      <fieldset className="trip-presets" disabled={disabled}>
        <legend>Your trip</legend>
        <div>
          {(
            [
              ["commuter", "Commuter", "Shorter bike rides"],
              ["bikepacking", "Bikepacking", "Room to explore"],
              ["personalized", "Personalized", "Your own preferences"],
            ] as const
          ).map(([key, label, hint]) => (
            <button
              type="button"
              key={key}
              aria-pressed={value === key}
              onClick={() => onChange(key)}
            >
              <strong>{label}</strong>
              <span>{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="preset-summary">
        {value === "commuter"
          ? "Up to 45 min cycling · fewer turns · unverified bike access included"
          : value === "bikepacking"
            ? "No separate cycling cap · lower traffic stress · verified bike access only"
            : "Choose the preferences for this journey below."}
      </p>
    </div>
  );
}
