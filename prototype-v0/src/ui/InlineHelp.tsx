import { useId, useState } from "react";

/** Click/tap help that stays open while the reader moves their pointer. */
export default function InlineHelp({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="inline-help"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          event.stopPropagation();
        }
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className="info-icon" aria-hidden="true">
          ?
        </span>
      </button>
      <span id={id} className="inline-help-content" hidden={!open}>
        {text}
      </span>
    </span>
  );
}
