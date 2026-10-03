export default function DepartureControls({
  mode,
  value,
  disabled,
  onChange,
  onNow,
}: {
  mode: "now" | "scheduled";
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onNow: () => void;
}) {
  return (
    <div className="departure-controls">
      <label>
        <span>Departure · Swiss time</span>
        <input
          type="datetime-local"
          required
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="leave-now"
        disabled={disabled}
        aria-pressed={mode === "now"}
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
        Leave now
      </button>
    </div>
  );
}
