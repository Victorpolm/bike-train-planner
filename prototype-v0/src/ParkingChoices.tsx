import { useEffect, useMemo, useState } from "react";
import { parkingDetails, parkingDistance, type BikeParking } from "./bikeParking";
import { parkingDetourTarget, parkingInformation, parkingShortlist } from "./parkingSuitability";
import { safePublicLink } from "./amenityLocation";
import { parseSwissDateTime, swissDateTimeInput } from "./departure";
import type { DetourFacility } from "./cyclingDetour";
import type { Place } from "./routing";
import "./facilityStyles.css";

export type ParkingTarget = { key: string; place: Place };
export default function ParkingChoices({
  facilities,
  targets,
  mapPoint,
  at,
  alongJourney,
  onLocate,
  onDetour,
}: {
  facilities: readonly BikeParking[];
  targets: ParkingTarget[];
  mapPoint: Place | null;
  at: Date;
  alongJourney: boolean;
  onLocate: (facility: BikeParking) => void;
  onDetour?: (target: DetourFacility) => void;
}) {
  const [targetKey, setTargetKey] = useState(
    targets.some((t) => t.key === "destination") ? "destination" : (targets[0]?.key ?? ""),
  );
  const [arrivalInput, setArrival] = useState(() => swissDateTimeInput(at));
  const [retrievalInput, setRetrieval] = useState(() =>
    swissDateTimeInput(new Date(+at + 2 * 3600000)),
  );
  const [radiusKm, setRadius] = useState(2),
    [limit, setLimit] = useState(3);
  const [preferFrame, setFrame] = useState(true),
    [preferCovered, setCovered] = useState(false);
  const [requireFree, setFree] = useState(false),
    [requireOpen, setOpen] = useState(false),
    [allowConditional, setConditional] = useState(false);
  useEffect(() => {
    if (mapPoint) setTargetKey("map");
  }, [mapPoint]);
  const choices = mapPoint ? [...targets, { key: "map", place: mapPoint }] : targets;
  const target = choices.find((t) => t.key === targetKey)?.place ?? choices[0]?.place ?? null;
  let arrival = new Date(NaN),
    retrieval = new Date(NaN),
    error = "";
  try {
    arrival = parseSwissDateTime(arrivalInput);
    retrieval = parseSwissDateTime(retrievalInput);
    if (+retrieval < +arrival) error = "Collection must be at or after arrival.";
  } catch {
    error = "Choose valid arrival and collection times in Switzerland.";
  }
  const shortlist = useMemo(
    () =>
      error
        ? []
        : parkingShortlist(facilities, target, {
            radiusKm,
            arrival,
            retrieval,
            preferFrame,
            preferCovered,
            requireFree,
            requireOpen,
            allowConditional,
          }),
    [
      facilities,
      target,
      radiusKm,
      +arrival,
      +retrieval,
      preferFrame,
      preferCovered,
      requireFree,
      requireOpen,
      allowConditional,
      error,
    ],
  );
  useEffect(
    () => setLimit(3),
    [
      targetKey,
      radiusKm,
      arrivalInput,
      retrievalInput,
      preferFrame,
      preferCovered,
      requireFree,
      requireOpen,
      allowConditional,
    ],
  );
  return (
    <section className="facility-choices" aria-labelledby="parking-choices-title">
      <div className="facility-section-heading">
        <h3 id="parking-choices-title">Choose bicycle parking</h3>
        <span>{shortlist.length} matches</span>
      </div>
      <div className="facility-fields">
        <label>
          Near
          <select
            value={choices.some((t) => t.key === targetKey) ? targetKey : (choices[0]?.key ?? "")}
            onChange={(e) => setTargetKey(e.target.value)}
          >
            {choices.map((t) => (
              <option key={t.key} value={t.key}>
                {t.place.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search distance
          <select value={radiusKm} onChange={(e) => setRadius(Number(e.target.value))}>
            <option value={2}>2 km</option>
            <option value={5}>5 km</option>
            <option value={10}>10 km</option>
          </select>
        </label>
        <label>
          Arrival · Swiss time
          <input
            type="datetime-local"
            value={arrivalInput}
            onChange={(e) => setArrival(e.target.value)}
          />
        </label>
        <label>
          Collect bicycle · Swiss time
          <input
            type="datetime-local"
            value={retrievalInput}
            onChange={(e) => setRetrieval(e.target.value)}
          />
        </label>
      </div>
      <div className="facility-filters">
        <label>
          <input
            type="checkbox"
            checked={preferFrame}
            onChange={(e) => setFrame(e.target.checked)}
          />
          Prefer mapped frame-support stands
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferCovered}
            onChange={(e) => setCovered(e.target.checked)}
          />
          Prefer cover
        </label>
        <label>
          <input
            type="checkbox"
            checked={requireFree}
            onChange={(e) => setFree(e.target.checked)}
          />
          Only mapped free parking
        </label>
        <label>
          <input
            type="checkbox"
            checked={requireOpen}
            onChange={(e) => setOpen(e.target.checked)}
          />
          Mapped open at arrival and collection
        </label>
        <label>
          <input
            type="checkbox"
            checked={allowConditional}
            onChange={(e) => setConditional(e.target.checked)}
          />
          Include entry conditions I can meet
        </label>
      </div>
      <p className="facility-note">
        Supported preferences come first, then distance. Unknown features receive no preference
        bonus.
        {alongJourney && " The selected journey’s distance filter also applies."} Select a station
        here, or click the map for parking near another point.
      </p>
      {error && <p role="alert">{error}</p>}
      {!target && <p>Choose a destination or point on the map first.</p>}
      {target && !error && !shortlist.length && (
        <p role="status">
          No parking matches these choices in the loaded sources. Broaden the distance or relax a
          filter; this does not mean no parking exists.
        </p>
      )}
      <ol className="facility-cards">
        {shortlist.slice(0, limit).map(({ facility: f, distanceKm, matches, assessment }) => {
          const url = safePublicLink(f.url),
            target = parkingDetourTarget(f, allowConditional);
          const sourceDates = [
            ...new Set(
              (f.sources ?? []).flatMap((s) => (s.retrievedAt ? [s.retrievedAt.slice(0, 10)] : [])),
            ),
          ];
          return (
            <li className="facility-card" key={f.id}>
              <h4>{f.name}</h4>
              <p>
                <b>{parkingDistance(distanceKm)}</b> straight-line ·{" "}
                {f.covered === true
                  ? "Covered"
                  : f.covered === false
                    ? "Uncovered"
                    : "Cover unknown"}{" "}
                ·{" "}
                {f.fee === false && !f.tags?.["fee:conditional"]
                  ? "Mapped free"
                  : f.fee === true
                    ? "Fee applies"
                    : "Price unknown"}
              </p>
              {matches.length > 0 && <p className="facility-match">{matches.join(" · ")}</p>}
              <p>
                Arrival: {assessment.arrival === "open" ? "mapped open" : "unconfirmed"} ·
                Collection: {assessment.retrieval === "open" ? "mapped open" : "unconfirmed"}.
              </p>
              {assessment.warnings.map((w) => (
                <p key={w} className="facility-note">
                  {w}
                </p>
              ))}
              <p>{parkingInformation(f)[1]}</p>
              <div className="facility-actions">
                <button type="button" onClick={() => onLocate(f)}>
                  Show on map
                </button>
                {onDetour && (
                  <button
                    type="button"
                    onClick={() => onDetour(target)}
                    disabled={!!target.unavailable}
                  >
                    Preview visit / access
                  </button>
                )}
                {url && (
                  <a href={url} target="_blank" rel="noreferrer">
                    Source / entry details ↗
                  </a>
                )}
              </div>
              <details>
                <summary>Equipment, access and sources</summary>
                {[...new Set([...parkingDetails(f), ...parkingInformation(f)])].map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                {sourceDates.length > 0 && (
                  <p>Source downloaded: {sourceDates.join(", ")}. No on-site verification.</p>
                )}
                {(f.sources ?? []).map((s) => (
                  <p key={`${s.provider}:${s.id}`}>
                    <a href={safePublicLink(s.url)} target="_blank" rel="noreferrer">
                      {s.provider === "osm"
                        ? "© OpenStreetMap contributors"
                        : "Official parking source"}
                    </a>{" "}
                    · {s.id}
                  </p>
                ))}
              </details>
            </li>
          );
        })}
      </ol>
      {limit < shortlist.length && (
        <button type="button" onClick={() => setLimit((n) => n + 3)}>
          Show more parking
        </button>
      )}
      <p className="facility-note">
        Hours reflect supported mapped weekly schedules; exceptions and actual entry are unverified.
        Nearby records without a shared source identity remain separate. A preview visits this
        location with your bicycle; it does not create a park-and-ride arrangement.
      </p>
    </section>
  );
}
