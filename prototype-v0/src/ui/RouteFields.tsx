import PlaceInput, { type PlaceValue } from "../PlaceInput";
import { MAX_WAYPOINTS } from "../places";
import type { WaypointInput } from "../waypointInputs";

export default function RouteFields({
  from,
  to,
  vias,
  disabled,
  notice,
  onFrom,
  onTo,
  onVia,
  onBicycleAction,
  onReverse,
  onAdd,
  onRemove,
  onMove,
  onChooseMap,
  currentLocation,
}: {
  from: PlaceValue;
  to: PlaceValue;
  vias: WaypointInput[];
  disabled: boolean;
  notice: string;
  onFrom: (value: PlaceValue) => void;
  onTo: (value: PlaceValue) => void;
  onVia: (id: string, value: PlaceValue) => void;
  onBicycleAction: (id: string, action: WaypointInput["bicycleAction"]) => void;
  onReverse: () => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMove: (index: number, delta: number) => void;
  onChooseMap: () => void;
  currentLocation: { onClick: () => void; loading: boolean; notice: string };
}) {
  return (
    <div className="route-fields">
      <div className="place-inputs">
        <PlaceInput
          label="From"
          value={from}
          disabled={disabled}
          onChange={onFrom}
          locationAction={currentLocation}
        />
        <button
          type="button"
          className="reverse-route"
          aria-label="Reverse route"
          title="Reverse route"
          disabled={disabled}
          onClick={onReverse}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M7 4v16m-4-4 4 4 4-4M17 20V4m-4 4 4-4 4 4" />
          </svg>
        </button>
        {vias.map((input, index) => (
          <div className="waypoint-row" key={input.id}>
            <PlaceInput
              label={`Intermediate stop ${index + 1}`}
              value={input.value}
              disabled={disabled}
              onChange={(value) => onVia(input.id, value)}
            />
            <div className="waypoint-actions">
              <button
                type="button"
                disabled={disabled || index === 0}
                aria-label={`Move intermediate stop ${index + 1} up`}
                onClick={() => onMove(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || index === vias.length - 1}
                aria-label={`Move intermediate stop ${index + 1} down`}
                onClick={() => onMove(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove intermediate stop ${index + 1}`}
                onClick={() => onRemove(input.id)}
              >
                Remove
              </button>
            </div>
            <label className="waypoint-bicycle-action">
              <span>Bike at this stop</span>
              <select
                aria-label={`Bike action at intermediate stop ${index + 1}`}
                disabled={disabled}
                value={input.bicycleAction ?? ""}
                onChange={(event) =>
                  onBicycleAction(
                    input.id,
                    event.target.value === "park" || event.target.value === "collect"
                      ? event.target.value
                      : undefined,
                  )
                }
              >
                <option value="">Keep current status</option>
                <option value="collect">Pick up a bike</option>
                <option value="park">Leave a bike</option>
              </select>
            </label>
          </div>
        ))}
        <PlaceInput label="To" value={to} disabled={disabled} onChange={onTo} />
      </div>
      <div className="location-actions">
        <button type="button" disabled={disabled || vias.length >= MAX_WAYPOINTS} onClick={onAdd}>
          + Add intermediate stop
        </button>
        <a href="#journey-map" onClick={onChooseMap}>
          Choose on map
        </a>
      </div>
      {!!vias.length && (
        <p className="waypoint-help">
          Visit stops in this order · up to {MAX_WAYPOINTS} stops. Cycling and boarding limits apply
          to the whole journey. Bike status stays the same unless you pick up or leave a bike. No
          stopover time is added.
        </p>
      )}
      {notice && (
        <p className="point-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
