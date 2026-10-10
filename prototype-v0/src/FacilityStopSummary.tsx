import type { CyclingComparison, Journey, Place } from "./routing";
import { facilityStopSteps } from "./facilityStops";
import { visitHours } from "./facilityHours";
import { safePublicLink } from "./amenityLocation";
import "./facilityStyles.css";
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
export default function FacilityStopSummary({
  journey,
  cycling,
  origin,
  destination,
  start,
  onRestore,
}: {
  journey: Journey | null;
  cycling: CyclingComparison | null;
  origin: Place;
  destination: Place;
  start: Date;
  onRestore?: () => void;
}) {
  const steps = facilityStopSteps({ journey, cycling }, { origin, destination, start });
  if (!steps.length) return null;
  return (
    <section className="facility-stops" aria-labelledby="added-facility-stops">
      <h3 id="added-facility-stops">Your added stops</h3>
      <ol>
        {steps.map((step, i) => {
          const f = step.leg!.facilityVisit!,
            url = safePublicLink(f.url);
          return (
            <li key={`${f.id}:${i}`}>
              <strong>
                {f.name} · {f.minutes} min
              </strong>
              <p>
                {clock.format(step.departure!)} → {clock.format(step.arrival!)}
              </p>
              <p className="facility-note">
                {visitHours(f.openingHours, f.seasonal, step.departure!, step.arrival!).message}{" "}
                {f.note}
              </p>
              {url && (
                <a href={url} target="_blank" rel="noreferrer">
                  Facility source / details ↗
                </a>
              )}
            </li>
          );
        })}
      </ol>
      <p className="facility-note">
        Visit time is included in the journey duration, separately from cycling and walking.
        Purchases and parking fees are extra. Stops are kept for this search; they are not saved
        across reloads.
      </p>
      {onRestore && (
        <button type="button" onClick={onRestore}>
          Restore original journey and remove edits
        </button>
      )}
    </section>
  );
}
