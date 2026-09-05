import { useEffect, useId, useRef, useState } from "react";
import { localSuggestions, suggestPlaces } from "./places";
import type { Place } from "./routing";

export type PlaceValue = { text: string; place?: Place };
export default function PlaceInput({ label, value, disabled, onChange }: {
  label: string; value: PlaceValue; disabled: boolean; onChange: (value: PlaceValue) => void;
}) {
  const id = useId(), listId = `${id}-suggestions`, statusId = `${id}-status`;
  const [focused, setFocused] = useState(false), [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]), [active, setActive] = useState(-1);
  const [status, setStatus] = useState("");
  const generation = useRef(0);
  const visible = focused && open && !disabled;
  useEffect(() => {
    const run = ++generation.current, abort = new AbortController();
    setActive(-1);
    if (!focused || !open || disabled || value.place || value.text.trim().length < 2) {
      setPlaces([]); setStatus(""); return () => abort.abort();
    }
    setPlaces(localSuggestions(value.text)); setStatus("Looking up addresses and stops…");
    const timer = setTimeout(() => {
      void suggestPlaces(value.text, abort.signal, found => {
        if (generation.current === run && !abort.signal.aborted) { setPlaces(found); setActive(-1); }
      }).then(({ unavailable }) => {
        if (generation.current === run && !abort.signal.aborted) setStatus(unavailable
          ? "Live suggestions are unavailable. You can still choose a listed station or search what you typed."
          : "Choose a suggestion, or search what you typed.");
      }).catch(() => { /* Changing text or focus cancels the previous query. */ });
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [value.text, value.place, focused, open, disabled]);
  function choose(place: Place) {
    generation.current++; setOpen(false); setPlaces([]); setActive(-1); onChange({ text: place.label, place });
  }
  return <div className="place-field">
    <label htmlFor={id}><span>{label}</span></label>
    <input id={id} value={value.text} required disabled={disabled} placeholder="Town, street or station"
      role="combobox" autoComplete="off" spellCheck={false} aria-autocomplete="list" aria-expanded={visible}
      aria-controls={listId} aria-describedby={statusId}
      aria-activedescendant={visible && active >= 0 ? `${id}-option-${active}` : undefined}
      onFocus={() => { setFocused(true); setOpen(true); }} onBlur={() => { setFocused(false); setOpen(false); }}
      onChange={e => { generation.current++; setActive(-1); setPlaces(localSuggestions(e.target.value)); setOpen(true); onChange({ text: e.target.value }); }}
      onKeyDown={e => {
        if (e.key === "Escape") { e.preventDefault(); generation.current++; setOpen(false); setActive(-1); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault(); setOpen(true);
          setActive(index => places.length ? (index + (e.key === "ArrowDown" ? 1 : places.length - 1) + places.length) % places.length : -1);
        }
        if (e.key === "Enter" && visible && active >= 0 && places[active]) { e.preventDefault(); choose(places[active]); }
      }} />
    {visible && (places.length > 0 || status) && <div className="suggestion-panel">
      <ul id={listId} role="listbox" aria-label={`${label} suggestions`}>
        {places.map((place, index) => <li id={`${id}-option-${index}`} key={`${place.stopId ?? place.label}:${place.lat}:${place.lon}`}
          role="option" aria-selected={index === active} className={index === active ? "active" : ""}
          onPointerDown={e => e.preventDefault()} onClick={() => choose(place)}>
          <strong>{place.label}</strong><small>{place.stopId ? "Public transport stop" : "Address or place"}</small>
        </li>)}
      </ul>
      <p role="status">{places.length > 0 ? `${places.length} suggestions. ` : ""}{status}</p>
    </div>}
    <span id={statusId} className="sr-only">Type at least two letters. Use arrow keys and Enter to choose a suggestion.</span>
  </div>;
}
