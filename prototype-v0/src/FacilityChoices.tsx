import { useMemo, useState } from "react";
import {
  amenityDetails,
  amenityRestricted,
  type Amenity,
  type AmenityCategory,
} from "./osmAmenities";
import { amenityLocationLinks, amenitySourceLinks, locationSummary } from "./amenityLocation";
import { visitHours } from "./facilityHours";
import { haversineKm, type Place } from "./routing";
import { parkingDistance } from "./bikeParking";
import { parseSwissDateTime, swissDateTimeInput } from "./departure";
import { amenityDetourTarget, type DetourFacility } from "./cyclingDetour";
import "./facilityStyles.css";
import { facilityServiceKinds, serviceKindAvailable, type ServiceKind } from "./osmServices";

export default function FacilityChoices({
  records,
  category,
  kinds,
  origin,
  destination,
  at,
  onLocate,
  onDetour,
}: {
  records: readonly Amenity[];
  category: AmenityCategory;
  origin: Place | null;
  destination: Place | null;
  at: Date;
  kinds?: readonly ServiceKind[];
  onLocate: (facility: Amenity) => void;
  onDetour?: (facility: DetourFacility) => void;
}) {
  const [where, setWhere] = useState("origin"),
    [limit, setLimit] = useState(3);
  const [when, setWhen] = useState(() => swissDateTimeInput(at)),
    [publicOnly, setPublicOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  let date = new Date(NaN);
  try {
    date = parseSwissDateTime(when);
  } catch {
    /* Inline date error below. */
  }
  const target = where === "destination" ? (destination ?? origin) : (origin ?? destination);
  const shortlist = useMemo(() => {
    if (!target || !Number.isFinite(+date)) return [];
    return records
      .flatMap((f) => {
        const target = amenityDetourTarget(f, category);
        if (target.unavailable || amenityRestricted(f, category)) return [];
        if (
          (category === "repairs" || category === "food") &&
          !facilityServiceKinds(f, category).some(
            (kind) => (!kinds || kinds.includes(kind)) && serviceKindAvailable(f, kind),
          )
        )
          return [];
        const access =
          f.tags[
            category === "water"
              ? "drinking_water:access"
              : category === "toilets"
                ? "toilets:access"
                : "access"
          ] ?? f.tags.access;
        if (publicOnly && !["yes", "public", "permissive"].includes(access)) return [];
        const hours = visitHours(
          f.tags.opening_hours,
          f.tags["drinking_water:seasonal"] ?? f.tags.seasonal,
          date,
        );
        if (hours.state === "closed" || (openOnly && hours.state !== "open")) return [];
        return [
          {
            facility: f,
            hours,
            distance: haversineKm(
              where === "destination" ? (destination ?? origin!) : (origin ?? destination!),
              f,
            ),
          },
        ];
      })
      .sort((a, b) => a.distance - b.distance || a.facility.id.localeCompare(b.facility.id));
  }, [records, category, kinds, target, +date, publicOnly, openOnly, where, destination, origin]);
  return (
    <section className="facility-choices" aria-label="Useful facility choices">
      <h4>Find a useful stop</h4>
      <div className="facility-fields">
        <label>
          Nearest to
          <select
            value={where}
            onChange={(e) => {
              setWhere(e.target.value);
              setLimit(3);
            }}
          >
            <option value="origin">Start</option>
            <option value="destination">Destination</option>
          </select>
        </label>
        <label>
          Check opening at · Swiss time
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
      </div>
      <div className="facility-filters">
        <label>
          <input
            type="checkbox"
            checked={publicOnly}
            onChange={(e) => setPublicOnly(e.target.checked)}
          />
          Only mapped public access
        </label>
        <label>
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />
          Only mapped open at this time
        </label>
      </div>
      {!Number.isFinite(+date) && <p role="alert">Choose a valid Swiss date and time.</p>}
      {!target && <p>Choose a start or destination to order the facilities.</p>}
      <p className="facility-note">
        Uses your current map corridor and type filters. Distances are approximate; a detour checks
        the actual path and arrival. Unverified entrances, floors, seasonal operation and opening
        remain labelled.
      </p>
      {target && !shortlist.length && Number.isFinite(+date) && (
        <p>
          No eligible facility was found in the loaded sources with these choices. Try a wider
          corridor or relax a filter.
        </p>
      )}
      <ol className="facility-cards">
        {shortlist.slice(0, limit).map(({ facility: f, distance, hours }) => (
          <li key={f.id} className="facility-card">
            <h4>{f.name}</h4>
            <p>
              {parkingDistance(distance)} straight-line ·{" "}
              {locationSummary(f) ||
                (f.area
                  ? "Area centre · entrance unverified"
                  : "Mapped point · entrance unverified")}
            </p>
            <p>{hours.message}</p>
            {f.location?.directions && (
              <p>
                <b>Finding it:</b> {f.location.directions}
              </p>
            )}
            {category === "water" && (
              <p>
                Drinking-water use is reported by the source. Current flow and water quality are not
                checked.
              </p>
            )}
            <div className="facility-actions">
              <button type="button" onClick={() => onLocate(f)}>
                Show details on map
              </button>
              {onDetour && (
                <button type="button" onClick={() => onDetour(amenityDetourTarget(f, category))}>
                  Preview / add stop
                </button>
              )}
            </div>
            <details>
              <summary>Access, floors and evidence</summary>
              {amenityDetails(f, category).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
              {[...amenityLocationLinks(f), ...amenitySourceLinks(f)].map((l, i) => (
                <p key={i}>
                  <a href={l.href} target="_blank" rel="noreferrer">
                    {l.label} ↗
                  </a>
                </p>
              ))}
            </details>
          </li>
        ))}
      </ol>
      {limit < shortlist.length && (
        <button type="button" onClick={() => setLimit((n) => n + 3)}>
          Show more facilities
        </button>
      )}
    </section>
  );
}
