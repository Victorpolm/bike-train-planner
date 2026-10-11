import { readBicycle, type BicycleProfile } from "./travelProfile";
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
  const bike = readBicycle(value.fare.bicycle);
  const fare = (patch: Partial<PersonalSettings["fare"]>) =>
    onChange({ ...value, fare: { ...value.fare, ...patch } });
  const bicycle = (patch: Partial<BicycleProfile>) => fare({ bicycle: { ...bike, ...patch } });
  const child = value.age !== null && value.age < 16;
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
          <span>Age on travel date · optional</span>
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
        One traveller and one bicycle per profile. Without age, adult prices are assumed. Enter age
        on the journey date; a child fare is not discounted twice by a Half Fare card.
      </p>
      <details className="profile-transport" open>
        <summary>Tickets and bicycle transport</summary>
        <div className="preference-grid">
          <label>
            <span>Travel class</span>
            <select
              disabled={disabled}
              value={value.fare.travelClass ?? "second"}
              onChange={(e) => fare({ travelClass: e.target.value as "first" | "second" })}
            >
              <option value="second">2nd class</option>
              <option value="first">1st class</option>
            </select>
          </label>
          {value.fare.passenger === "ga" && (
            <label>
              <span>GA class</span>
              <select
                disabled={disabled}
                value={value.fare.gaClass ?? "second"}
                onChange={(e) => fare({ gaClass: e.target.value as "first" | "second" })}
              >
                <option value="second">2nd class</option>
                <option value="first">1st class</option>
              </select>
            </label>
          )}
          <label>
            <span>Travelcard valid from · optional</span>
            <input
              type="date"
              disabled={disabled}
              value={value.fare.passValidFrom ?? ""}
              onChange={(e) => fare({ passValidFrom: e.target.value })}
            />
          </label>
          <label>
            <span>Travelcard valid through · optional</span>
            <input
              type="date"
              disabled={disabled}
              value={value.fare.passValidThrough ?? ""}
              onChange={(e) => fare({ passValidThrough: e.target.value })}
            />
          </label>
          {child && (
            <label>
              <span>Child passenger travelcard</span>
              <select
                disabled={disabled}
                value={value.fare.childCard ?? "none"}
                onChange={(e) =>
                  fare({ childCard: e.target.value as PersonalSettings["fare"]["childCard"] })
                }
              >
                <option value="none">None</option>
                <option value="junior">Junior Travelcard</option>
                <option value="co-travel">Children’s Co-Travelcard</option>
                <option value="child-ga">Child GA / GA Familia Child</option>
              </select>
            </label>
          )}
          <label>
            <span>Bicycle type</span>
            <select
              disabled={disabled}
              value={bike.kind}
              onChange={(e) =>
                bicycle({ kind: e.target.value as BicycleProfile["kind"], carriage: "unfolded" })
              }
            >
              {Object.entries({
                ordinary: "Ordinary bicycle · up to 2 m",
                folding: "Folding bicycle",
                child: "Child’s bicycle",
                balance: "Balance bike",
                cargo: "Cargo bicycle",
                tandem: "Tandem",
                recumbent: "Recumbent",
                adaptive: "Adaptive bicycle / tricycle",
                other: "Other bicycle",
              }).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Configuration on public transport</span>
            <select
              disabled={disabled}
              value={bike.carriage}
              onChange={(e) => bicycle({ carriage: e.target.value as BicycleProfile["carriage"] })}
            >
              <option value="unfolded">Unfolded</option>
              {bike.kind === "folding" && <option value="folded">Folded before boarding</option>}
              <option value="bagged">Wheel removed, correctly packed in bicycle bag</option>
            </select>
          </label>
          <label>
            <span>Bicycle length · cm</span>
            <input
              type="number"
              min="30"
              max="600"
              disabled={disabled}
              value={bike.lengthCm ?? ""}
              placeholder={
                bike.kind === "ordinary" ? "Up to 200 cm" : "Required for nonstandard bikes"
              }
              onChange={(e) =>
                bicycle({ lengthCm: e.target.value === "" ? null : e.target.valueAsNumber })
              }
            />
          </label>
          <label>
            <span>Motor category for transport rules</span>
            <select
              disabled={disabled}
              value={bike.drive}
              onChange={(e) => bicycle({ drive: e.target.value as BicycleProfile["drive"] })}
            >
              <option value="pedal">Pedal bicycle</option>
              <option value="assist25">E-bike assistance up to 25 km/h</option>
              <option value="speed45">S-pedelec up to 45 km/h</option>
              <option value="other">Other motor · operator check</option>
            </select>
          </label>
          <label>
            <span>Trailer</span>
            <select
              disabled={disabled}
              value={bike.trailer}
              onChange={(e) => bicycle({ trailer: e.target.value as BicycleProfile["trailer"] })}
            >
              <option value="none">None</option>
              <option value="detached">Detached for boarding</option>
              <option value="attached">Attached to bicycle</option>
            </select>
          </label>
          {bike.trailer !== "none" && (
            <label>
              <span>Trailer width · cm</span>
              <input
                type="number"
                min="10"
                max="300"
                disabled={disabled}
                value={bike.trailerWidthCm ?? ""}
                onChange={(e) =>
                  bicycle({ trailerWidthCm: e.target.value === "" ? null : e.target.valueAsNumber })
                }
              />
            </label>
          )}
          <label>
            <span>Other existing bicycle entitlement</span>
            <select
              disabled={disabled || value.fare.annualBikePass}
              value={value.fare.existingBikePass ?? "none"}
              onChange={(e) =>
                fare({
                  existingBikePass: e.target.value as PersonalSettings["fare"]["existingBikePass"],
                })
              }
            >
              <option value="none">None</option>
              <option value="day">Already bought a Bike Day Pass</option>
              <option value="multi-day">Validated day on a multiple-day bike pass</option>
              <option value="mobility">Issued mobility-aid bicycle pass</option>
            </select>
          </label>
          {["day", "multi-day"].includes(value.fare.existingBikePass ?? "") && (
            <label>
              <span>Ticket / validated field date</span>
              <input
                type="date"
                disabled={disabled}
                value={value.fare.bikePassDate ?? ""}
                onChange={(e) => fare({ bikePassDate: e.target.value })}
              />
            </label>
          )}
          {(value.fare.annualBikePass || value.fare.existingBikePass === "mobility") && (
            <label>
              <span>Bicycle pass valid through · optional</span>
              <input
                type="date"
                disabled={disabled}
                value={value.fare.bikePassValidThrough ?? ""}
                onChange={(e) => fare({ bikePassValidThrough: e.target.value })}
              />
            </label>
          )}
        </div>
        {child && (
          <>
            <label className="check-row">
              <input
                type="checkbox"
                disabled={disabled}
                checked={!!value.fare.accompaniedBy16Plus}
                onChange={(e) => fare({ accompaniedBy16Plus: e.target.checked })}
              />
              Accompanied by someone aged 16 or older with a valid passenger ticket
            </label>
            {["junior", "co-travel"].includes(value.fare.childCard ?? "") && (
              <label className="check-row">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={!!value.fare.qualifyingCompanion}
                  onChange={(e) => fare({ qualifyingCompanion: e.target.checked })}
                />
                The qualifying parent / named Co-Travelcard companion is travelling in the same
                class (Co-Travelcard: at most four children)
              </label>
            )}
          </>
        )}
        <label className="check-row">
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!value.fare.organizedGroup}
            onChange={(e) => fare({ organizedGroup: e.target.checked })}
          />
          Organized group / school / club journey · separate fare conditions
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            disabled={disabled}
            checked={bike.selfLoading}
            onChange={(e) => bicycle({ selfLoading: e.target.checked })}
          />
          I can load, unload and stow this bicycle myself
        </label>
        <details>
          <summary>Regional or other passenger pass</summary>
          <p>
            Record its coverage for checking. An unverified pass never silently makes a journey
            free.
          </p>
          <div className="preference-grid">
            {(
              [
                ["name", "Product name"],
                ["operator", "Operator / network"],
                ["coverage", "Covered route or zones"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  disabled={disabled}
                  value={value.fare.otherPass?.[key] ?? ""}
                  onChange={(e) =>
                    fare({
                      otherPass: {
                        name: "",
                        operator: "",
                        coverage: "",
                        validThrough: "",
                        ...value.fare.otherPass,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
            <label>
              <span>Pass valid through</span>
              <input
                type="date"
                disabled={disabled}
                value={value.fare.otherPass?.validThrough ?? ""}
                onChange={(e) =>
                  fare({
                    otherPass: {
                      name: "",
                      operator: "",
                      coverage: "",
                      ...value.fare.otherPass,
                      validThrough: e.target.value,
                    },
                  })
                }
              />
            </label>
          </div>
        </details>
        <p className="profile-hint">
          A fare entitlement does not guarantee room or a reservation. Special bicycles, trailers
          and assisted loading have operator-specific limits. Cycling paths are not independently
          verified for cargo bikes, trailers or S-pedelecs. Leave optional expiry dates blank only
          if you have checked the pass is valid for the whole trip.
        </p>
      </details>
    </div>
  );
}
