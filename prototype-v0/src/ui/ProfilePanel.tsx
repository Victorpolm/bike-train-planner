import { useEffect, useRef } from "react";
import TravellerProfiles from "../TravellerProfiles";
import PersonalSettingsFields from "../PersonalSettingsFields";
import {
  validPersonalSettings,
  type PersonalSettings,
  type TravellerLibrary,
  type TravellerProfile,
} from "../travellerProfiles";

export default function ProfilePanel({
  open,
  onOpenChange,
  initial,
  settings,
  disabled,
  onSelect,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: { library: TravellerLibrary; notice: string };
  settings: PersonalSettings;
  disabled: boolean;
  onSelect: (profile: TravellerProfile | null) => void;
  onChange: (settings: PersonalSettings) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  function focusSettings() {
    const fields = dialog.current?.querySelector(".personal-fields");
    const field =
      fields?.querySelector<HTMLInputElement>("input:invalid") ??
      fields?.querySelector<HTMLSelectElement>("select");
    field?.focus();
    field?.scrollIntoView({ block: "nearest" });
  }
  useEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (open && !panel.open) {
      panel.showModal();
      if (validPersonalSettings(settings)) heading.current?.focus();
      else focusSettings();
    } else if (!open && panel.open) panel.close();
  }, [open, settings]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="header-profile-button"
        aria-label="Profile and bike preferences"
        title="Profile and bike preferences"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="traveller-profile-panel"
        onClick={() => onOpenChange(true)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        id="traveller-profile-panel"
        className="profile-panel"
        aria-labelledby="traveller-profile-heading"
        onClose={() => {
          onOpenChange(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onOpenChange(false);
        }}
      >
        <div className="profile-panel-heading">
          <h2 id="traveller-profile-heading" ref={heading} tabIndex={-1}>
            Profile &amp; bike preferences
          </h2>
          <button
            type="button"
            className="profile-close"
            aria-label="Close profile"
            onClick={() => onOpenChange(false)}
          >
            ×
          </button>
        </div>
        <form
          className="profile-form"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
          }}
        >
          <TravellerProfiles
            initial={initial}
            settings={settings}
            disabled={disabled}
            onSelect={onSelect}
            onEdit={focusSettings}
          />
          <h3>Rider &amp; tickets</h3>
          <PersonalSettingsFields value={settings} disabled={disabled} onChange={onChange} />
          <button type="submit" className="profile-done">
            Done
          </button>
        </form>
      </dialog>
    </>
  );
}
