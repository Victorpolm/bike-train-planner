import { useMemo } from "react";
import { refillCoverage } from "./refillCoverage";
import { amenityDetourTarget, type DetourFacility, type DetourStage } from "./cyclingDetour";
import type { Amenity } from "./osmAmenities";
import "./facilityStyles.css";

export default function RefillCoverage({
  stages,
  facilities,
  radius,
  onWiden,
  onDetour,
  partial,
}: {
  stages: DetourStage[];
  facilities: Amenity[];
  radius: number;
  onWiden: () => void;
  partial: boolean;
  onDetour?: (facility: DetourFacility) => void;
}) {
  const sections = useMemo(
    () => refillCoverage(stages, facilities, radius),
    [stages, facilities, radius],
  );
  if (!sections.length) return null;
  return (
    <section className="facility-choices" aria-labelledby="refill-coverage-heading">
      <h3 id="refill-coverage-heading">Refill gaps along your cycling sections</h3>
      <p className="facility-note">
        Candidates within {radius} m of the actual cycling paths, in riding order. Gaps describe the
        loaded map data; they are not proof that water is absent. Public transport does not connect
        the cycling distances.
      </p>
      {partial && (
        <p role="status">Some sources are loading or unavailable. This coverage is incomplete.</p>
      )}
      {radius < 1000 && (
        <button type="button" onClick={onWiden}>
          Search within 1 km · widen useful-stop filters
        </button>
      )}
      {sections.map(({ stage, candidates, gap }) => (
        <details key={stage.id} open={sections.length === 1}>
          <summary>
            {stage.label} · largest mapped gap {gap.km.toFixed(1)} km
          </summary>
          <p>
            From {gap.fromKm.toFixed(1)} to {gap.toKm.toFixed(1)} km into this cycling section, no
            eligible drinking-water candidate was found in the selected corridor.
          </p>
          {!candidates.length && (
            <p>Carry enough water for this section and check local sources.</p>
          )}
          <ol className="facility-cards">
            {candidates.slice(0, 8).map((c) => (
              <li key={c.facility.id} className="facility-card">
                <h4>{c.facility.name}</h4>
                <p>
                  {c.alongKm.toFixed(1)} km into this section · {Math.round(c.gapM)} m from the
                  mapped cycling path.
                </p>
                <p className="facility-note">
                  {c.hours.message} These are proximity estimates; the access route and current
                  water flow are not verified.
                </p>
                {onDetour && (
                  <button
                    type="button"
                    onClick={() => onDetour(amenityDetourTarget(c.facility, "water"))}
                  >
                    Check detour / add refill stop
                  </button>
                )}
              </li>
            ))}
          </ol>
          {candidates.length > 8 && (
            <p>
              {candidates.length - 8} further candidates are included in the gap calculation and
              visible in the water layer.
            </p>
          )}
        </details>
      ))}
    </section>
  );
}
