export default function DepartureControls({
  mode,
  value,
  disabled,
  onChange,
  onNow,
  onMode,
}: {
  mode: "now" | "scheduled" | "arrival";
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onNow: () => void;
  onMode: (mode: "scheduled" | "arrival") => void;
}) {
  return (
    <div className="departure-controls">
      <label className="departure-mode">
        <span>Plan by</span>
        <select
          disabled={disabled}
          value={mode === "arrival" ? "arrival" : "scheduled"}
          onChange={(e) => onMode(e.target.value as "scheduled" | "arrival")}
        >
          <option value="scheduled">Depart after</option>
          <option value="arrival">Arrive by</option>
        </select>
      </label>
      <div className="departure-time-field">
        <label htmlFor="journey-time">
          <span>{mode === "arrival" ? "Arrive by" : "Ready to leave"} · Swiss time</span>
        </label>
        <div className="departure-time-row">
          <input
            id="journey-time"
            type="datetime-local"
            required
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            className="leave-now"
            disabled={disabled}
            aria-pressed={mode === "now"}
            aria-label="Leave now"
            title="Leave now"
            onClick={onNow}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 6v6l4 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
