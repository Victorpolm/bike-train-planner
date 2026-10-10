import type { TripPreset } from "../tripPresets";
import {
  samePersonalSettings,
  type PersonalSettings,
  type TravellerLibrary,
} from "../travellerProfiles";

export default function TripPresetPicker({
  value,
  disabled,
  onChange,
  library,
  settings,
  notice,
  onSelectProfile,
}: {
  value: TripPreset;
  disabled: boolean;
  onChange: (preset: TripPreset) => void;
  library: TravellerLibrary;
  settings: PersonalSettings;
  notice: string;
  onSelectProfile: (id: string) => void;
}) {
  return (
    <div className="trip-preset-module">
      <fieldset className="trip-presets" disabled={disabled}>
        <legend>Your trip</legend>
        <div role="group" aria-label="Trip style">
          {(
            [
              ["commuter", "Commuter", "Time, boardings & cycling"],
              ["bikepacking", "Bikepacking", "Time, boardings & traffic"],
              ["personalized", "Personalized", "Choose your objectives"],
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
        {library.profiles.length > 0 && (
          <section className="saved-trip-profiles" aria-label="Saved traveller profiles">
            <p className="trip-profile-label">Your profiles</p>
            <div className="trip-profile-cards">
              {library.profiles.map((profile) => {
                const active = profile.id === library.activeId;
                const edited = active && !samePersonalSettings(profile, settings);
                return (
                  <button
                    type="button"
                    key={profile.id}
                    aria-pressed={active}
                    onClick={() => onSelectProfile(profile.id)}
                  >
                    <strong>{profile.name}</strong>
                    <span>
                      {profile.pace.flatSpeedKmh} km/h ·{" "}
                      {profile.fare.passenger === "full"
                        ? "Full fare"
                        : profile.fare.passenger === "half-fare"
                          ? "Half Fare"
                          : "GA"}
                    </span>
                    <span className="trip-profile-state">
                      {edited
                        ? "Edited for this trip · tap to restore"
                        : active
                          ? "Selected profile"
                          : "Use profile"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="profile-hint">
              Applies your rider and ticket settings. Your trip style stays selected.
            </p>
          </section>
        )}
      </fieldset>
      {notice && (
        <p className="profile-hint" role="status">
          {notice}
        </p>
      )}
      <p className="preset-summary">
        {value === "commuter"
          ? "Up to 30 min cycling · fewer turns · unverified bike access included"
          : value === "bikepacking"
            ? "No separate cycling cap · lower traffic stress · verified bike access only"
            : "Choose the preferences for this journey below."}
      </p>
    </div>
  );
}
