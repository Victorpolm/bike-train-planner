import type { ParkedBicycle } from "../savedJourneys";
import { parkingAssessment } from "../parkingSuitability";
import { safePublicLink } from "../amenityLocation";
const date = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  dateStyle: "medium",
  timeStyle: "short",
});
export default function BicycleStatus({
  parked,
  busy,
  notice,
  walkingMinutes,
  onWalkingMinutes,
  onRecordHere,
  onReturn,
  onCollected,
}: {
  parked: ParkedBicycle | null;
  busy: boolean;
  notice: string;
  walkingMinutes: number;
  onWalkingMinutes: (minutes: number) => void;
  onRecordHere: () => void;
  onReturn: () => void;
  onCollected: () => void;
}) {
  const assessment = parked?.facility
    ? parkingAssessment(parked.facility, {
        arrival: parked.parkedAt,
        retrieval: parked.collectionAt ?? new Date(),
        radiusKm: 2,
        preferFrame: false,
        preferCovered: false,
        requireFree: false,
        requireOpen: false,
        allowConditional: true,
      })
    : null;
  return (
    <details className="bicycle-status" open={!!parked}>
      <summary>
        {parked ? `Bicycle parked · ${parked.place.label}` : "Remember where I park my bicycle"}
      </summary>
      {parked ? (
        <>
          <p>
            Recorded {date.format(parked.parkedAt)}.
            {parked.collectionAt && ` Intended collection: ${date.format(parked.collectionAt)}.`}
          </p>
          <p>
            Searches use walking and passenger public transport until you confirm collection. Your
            cycling preferences resume afterwards.
          </p>
          <label>
            Maximum walking per section{" "}
            <select
              disabled={busy}
              value={walkingMinutes}
              onChange={(e) => onWalkingMinutes(Number(e.target.value))}
            >
              {[0, 10, 20, 30, 45, 60, walkingMinutes]
                .filter((x, i, a) => a.indexOf(x) === i)
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
            </select>
          </label>
          {assessment?.reasons.map((w) => (
            <p className="notice" key={w}>
              {w}
            </p>
          ))}
          {assessment?.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          {parked.facility?.fee == null && (
            <p>Parking price unknown; check payment conditions locally.</p>
          )}
          {parked.facility?.fee === true && (
            <p>A parking fee is mapped; it is not included in transport ticket prices.</p>
          )}
          {parked.facility?.url && (
            <a href={safePublicLink(parked.facility.url)} target="_blank" rel="noreferrer">
              Parking source / entry details ↗
            </a>
          )}
          <div className="saved-journey-actions">
            <button type="button" disabled={busy} onClick={onReturn}>
              Plan return to bicycle
            </button>
            <button type="button" disabled={busy} onClick={onCollected}>
              I have collected my bicycle
            </button>
          </div>
          <p>
            The return targets your recorded point. Confirm the real entrance and collection
            conditions locally.
          </p>
        </>
      ) : (
        <>
          <p>
            At a mapped parking place, choose “I’ve parked here”. You can also record your current
            location after parking.
          </p>
          <button type="button" disabled={busy} onClick={onRecordHere}>
            I’ve parked here · use my location
          </button>
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
