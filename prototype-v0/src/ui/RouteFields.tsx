import PlaceInput, { type PlaceValue } from "../PlaceInput";
import { MAX_WAYPOINTS } from "../places";

export default function RouteFields({
  from,
  to,
  vias,
  disabled,
  notice,
  onFrom,
  onTo,
  onVia,
  onReverse,
  onAdd,
  onRemove,
  onMove,
  onChooseMap,
}: {
  from: PlaceValue;
  to: PlaceValue;
  vias: { id: string; value: PlaceValue }[];
  disabled: boolean;
  notice: string;
  onFrom: (value: PlaceValue) => void;
  onTo: (value: PlaceValue) => void;
  onVia: (id: string, value: PlaceValue) => void;
  onReverse: () => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onMove: (index: number, delta: number) => void;
  onChooseMap: () => void;
}) {
  return (
    <div className="route-fields">
      <div className="place-inputs">
        <PlaceInput label="From" value={from} disabled={disabled} onChange={onFrom} />
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
          to the whole journey. No stopover time is added.
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
