import { useState } from "react";
import {
  personalSettings,
  persistTravellers,
  samePersonalSettings,
  validPersonalSettings,
  type PersonalSettings,
  type TravellerLibrary,
  type TravellerProfile,
} from "./travellerProfiles";

export default function TravellerProfiles({
  initial,
  settings,
  disabled,
  onSelect,
  onEdit,
}: {
  initial: { library: TravellerLibrary; notice: string };
  settings: PersonalSettings;
  disabled: boolean;
  onSelect: (profile: TravellerProfile | null) => void;
  onEdit: () => void;
}) {
  const [library, setLibrary] = useState(initial.library);
  const [notice, setNotice] = useState(initial.notice);
  const [editing, setEditing] = useState<"new" | "rename" | "delete" | null>(null);
  const [name, setName] = useState("");
  const selected = library.profiles.find((p) => p.id === library.activeId);
  const changed = !!selected && !samePersonalSettings(selected, settings);
  function store(next: TravellerLibrary) {
    try {
      persistTravellers(next);
      setLibrary(next);
      setNotice("Saved on this device.");
      return true;
    } catch {
      setNotice(
        "Your browser could not save this change. Your trip settings still work; allow device storage to save profiles.",
      );
      return false;
    }
  }
  function save() {
    if (!validPersonalSettings(settings)) {
      setNotice("Enter a speed from 8 to 35 km/h and a valid optional age before saving.");
      onEdit();
      return;
    }
    const profile: TravellerProfile = {
      ...personalSettings(settings),
      id: selected && editing !== "new" ? selected.id : crypto.randomUUID(),
      name: name.trim(),
    };
    if (!profile.name) return;
    const next = {
      ...library,
      activeId: profile.id,
      profiles: [...library.profiles.filter((p) => p.id !== profile.id), profile],
    };
    if (store(next)) {
      onSelect(profile);
      setEditing(null);
    }
  }
  return (
    <section className="traveller-profiles" aria-label="Traveller profile">
      <div className="traveller-row">
        <label>
          <span>Traveller</span>
          <select
            value={library.activeId ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const activeId = e.target.value || null;
              const next = { ...library, activeId };
              setLibrary(next);
              setEditing(null);
              setNotice("");
              onSelect(next.profiles.find((p) => p.id === activeId) ?? null);
              try {
                persistTravellers(next);
              } catch {
                setNotice(
                  "Profile selected for this visit. Your browser could not remember the selection.",
                );
              }
            }}
          >
            <option value="">Guest · no profile</option>
            {library.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setEditing("new");
            setName("");
            onEdit();
          }}
        >
          Add profile
        </button>
      </div>
      <div className="profile-actions">
        <button type="button" disabled={disabled} onClick={onEdit}>
          Edit for this trip
        </button>
        {selected && (
          <>
            <button
              type="button"
              disabled={disabled || !changed}
              onClick={() => {
                if (!validPersonalSettings(settings)) {
                  onEdit();
                  setNotice("Check your speed and optional age before saving.");
                  return;
                }
                store({
                  ...library,
                  profiles: library.profiles.map((p) =>
                    p.id === selected.id ? { ...p, ...personalSettings(settings) } : p,
                  ),
                });
              }}
            >
              Save to profile
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setEditing("rename");
                setName(selected.name);
              }}
            >
              Rename
            </button>
            <button type="button" disabled={disabled} onClick={() => setEditing("delete")}>
              Delete
            </button>
          </>
        )}
      </div>
      {changed && (
        <p className="profile-hint">
          Changed for this trip. Save to profile to remember these settings.
        </p>
      )}
      {(editing === "new" || editing === "rename") && (
        <div className="profile-editor">
          <label>
            <span>{editing === "new" ? "New profile name" : "Profile name"}</span>
            <input
              value={name}
              maxLength={60}
              disabled={disabled}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="profile-hint">
            {editing === "new"
              ? "Saves the fare, age and riding settings shown below."
              : "Renames the saved profile; trip overrides stay separate."}
          </p>
          <div className="profile-actions">
            <button
              type="button"
              disabled={disabled || !name.trim()}
              onClick={() => {
                if (editing === "rename" && selected) {
                  if (
                    store({
                      ...library,
                      profiles: library.profiles.map((p) =>
                        p.id === selected.id ? { ...p, name: name.trim() } : p,
                      ),
                    })
                  )
                    setEditing(null);
                } else save();
              }}
            >
              {editing === "new" ? "Create profile" : "Save name"}
            </button>
            <button type="button" disabled={disabled} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {editing === "delete" && selected && (
        <div className="profile-editor">
          <p>Delete “{selected.name}” from this device?</p>
          <div className="profile-actions">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (
                  store({
                    ...library,
                    activeId: null,
                    profiles: library.profiles.filter((p) => p.id !== selected.id),
                  })
                ) {
                  onSelect(null);
                  setEditing(null);
                }
              }}
            >
              Delete profile
            </button>
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className="profile-hint">
        Optional · one traveller per search · saved only in this browser. Clearing browser data
        removes profiles.
      </p>
      {notice && (
        <p className="profile-hint" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
