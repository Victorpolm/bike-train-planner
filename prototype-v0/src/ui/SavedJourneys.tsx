import { useEffect, useState } from "react";
import { MAX_SAVED_JOURNEYS, type SavedJourney } from "../savedJourneys";

const date = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  dateStyle: "medium",
  timeStyle: "short",
});
export default function SavedJourneys({
  journeys,
  selectedName,
  canSave,
  busy,
  notice,
  onSave,
  onOpen,
  onPlan,
  onRename,
  onDelete,
}: {
  journeys: SavedJourney[];
  selectedName: string;
  canSave: boolean;
  busy: boolean;
  notice: string;
  onSave: (name: string) => void;
  onOpen: (entry: SavedJourney) => void;
  onPlan: (entry: SavedJourney) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(selectedName),
    [editing, setEditing] = useState<string | null>(null),
    [renamed, setRenamed] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => setName(selectedName), [selectedName]);
  return (
    <details className="saved-journeys">
      <summary>
        Saved journeys · {journeys.length}/{MAX_SAVED_JOURNEYS}
      </summary>
      <p>
        Saved on this device and browser, including the route, routing preferences and facility
        visits. Clearing browser data removes them; they do not sync to another device.
      </p>
      {canSave && (
        <div className="saved-journey-save">
          <label>
            Journey name
            <input
              value={name}
              maxLength={100}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button type="button" disabled={busy} onClick={() => onSave(name)}>
            Save selected journey
          </button>
        </div>
      )}
      {!canSave && <p>Select a journey to save it.</p>}
      {notice && <p role="status">{notice}</p>}
      <ul className="saved-journey-list">
        {journeys.map((entry) => (
          <li key={entry.id}>
            <strong>{entry.name}</strong>
            <p>
              {entry.trip.origin.label} → {entry.trip.destination.label}
            </p>
            <small>
              Itinerary: {date.format(entry.trip.start)} · Saved: {date.format(entry.savedAt)}
              {entry.stage > 0 && ` · Resume at stage ${entry.stage + 1}`}
            </small>
            <div className="saved-journey-actions">
              <button type="button" disabled={busy} onClick={() => onOpen(entry)}>
                Open itinerary
              </button>
              <button type="button" disabled={busy} onClick={() => onPlan(entry)}>
                Plan again
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(entry.id);
                  setRenamed(entry.name);
                }}
              >
                Rename
              </button>
              <button type="button" disabled={busy} onClick={() => setRemoving(entry.id)}>
                Remove
              </button>
            </div>
            {editing === entry.id && (
              <div className="saved-journey-actions">
                <label>
                  New name
                  <input
                    value={renamed}
                    maxLength={100}
                    onChange={(e) => setRenamed(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !renamed.trim()}
                  onClick={() => {
                    onRename(entry.id, renamed);
                    setEditing(null);
                  }}
                >
                  Save name
                </button>
              </div>
            )}
            {removing === entry.id && (
              <div className="saved-journey-actions">
                <span>Remove this saved copy?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onDelete(entry.id);
                    setRemoving(null);
                  }}
                >
                  Remove saved copy
                </button>
                <button type="button" onClick={() => setRemoving(null)}>
                  Keep
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!!journeys.length && (
        <p>
          Saved timetables are snapshots. Open to inspect them, or Plan again to search with current
          data. GPS starts only when you press Start.
        </p>
      )}
    </details>
  );
}
