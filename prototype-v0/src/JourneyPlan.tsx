import { arrivalTime, effectivePlatform, realtimeStale, type TransitRealtime } from "./realtime";
import type { RealtimeJourneyState } from "./useRealtimeJourney";
import { boardingCheck } from "./transferTimes";
import InfoDisclosure from "./InfoDisclosure";
import FareDetails from "./FareDetails";
import CyclingTerrainSummary from "./CyclingTerrainSummary";
import { DEFAULT_FARE_PROFILE, type FareProfile } from "./fares";
import { journeySteps } from "./itinerary";
import { formatMinutes, type Journey, type Place } from "./routing";
import { journeyStops } from "./mapData";
import BicycleCarriageDetails, { type EvidenceUpdate } from "./BicycleCarriageDetails";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
});
const day = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function PlanTime({
  date,
  start,
  scheduled,
  realtime,
}: {
  date: Date | null;
  start: Date;
  scheduled?: Date | null;
  realtime?: TransitRealtime;
}) {
  if (!date) return <span className="plan-missing">Time unavailable</span>;
  return (
    <time dateTime={date.toISOString()}>
      {clock.format(date)}
      {scheduled &&
        realtime &&
        (realtime.estimatedDeparture || realtime.estimatedArrival) &&
        +scheduled !== +date && (
          <small>
            Scheduled {clock.format(scheduled)} ·{" "}
            {Math.round((+date - +scheduled) / 60000) > 0 ? "+" : ""}
            {Math.round((+date - +scheduled) / 60000)} min
          </small>
        )}
      {day.format(date) !== day.format(start) && <small>{day.format(date)}</small>}
    </time>
  );
}

export default function JourneyPlan({
  id,
  realtime,
  journey,
  origin,
  destination,
  onEvidence,
  fareProfile = DEFAULT_FARE_PROFILE,
  boardingMinutes = 3,
  takeBikeOnTransit = true,
  cyclingPosition = "anywhere",
  walkingOnly = false,
}: {
  id: string;
  realtime?: RealtimeJourneyState;
  journey: Journey;
  origin: Place;
  destination: Place;
  fareProfile?: FareProfile;
  boardingMinutes?: number;
  takeBikeOnTransit?: boolean;
  walkingOnly?: boolean;
  cyclingPosition?: import("./model").CyclingPosition;
  onEvidence?: EvidenceUpdate;
}) {
  const stopNumbers = new Map(journeyStops(journey).map((stop) => [stop.id, stop.number]));
  return (
    <section id={id} className="journey-plan" aria-labelledby={`${id}-heading`}>
      <div className="plan-heading">
        <h3 id={`${id}-heading`}>Your travel plan</h3>
        <p>{day.format(journey.startTime)} · Swiss local time</p>
        {!takeBikeOnTransit && (
          <p>
            {walkingOnly
              ? "Your bicycle stays at its recorded location. This journey uses walking and passenger transport."
              : cyclingPosition === "start-only"
                ? `Leave your bicycle at ${journey.originStation.name}; continue by public transport and on foot.`
                : `Walk to public transport, then use the bicycle you have at ${journey.destinationStation.name}.`}{" "}
            Parking availability and the path from a rack to the platform are not verified.
          </p>
        )}
        {!!journey.waypoints?.length && (
          <p>
            Intermediate stops:{" "}
            {journey.waypoints
              .map(
                (visit, index) =>
                  `${index + 1}. ${visit.place.label} (${clock.format(visit.arrival)})`,
              )
              .join(" → ")}
          </p>
        )}
      </div>
      {journey.transitLegs.some((l) => l.mode === "transit") && (
        <section className="realtime-status" aria-label="Live public transport updates">
          <div className="realtime-heading">
            <strong>Live transport updates</strong>
            {realtime?.active && (
              <button type="button" onClick={realtime.refresh} disabled={realtime.loading}>
                {realtime.loading ? "Checking…" : "Refresh"}
              </button>
            )}
          </div>
          <p>
            {realtime?.active
              ? "Updates every 30 seconds while this journey is visible. Scheduled times are retained below."
              : "Live updates are available for today's dated services. Other services show timetable information."}
          </p>
          {realtime?.failed && (
            <p role="status">
              The latest check failed. Previous estimates may be out of date; check the operator
              before travelling.
            </p>
          )}
          {!!realtime?.issues.length && (
            <ul className="realtime-warnings" role="alert">
              {realtime.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      <ol className="plan-steps">
        {journeySteps(journey, origin, destination).map((step, index) => {
          const minutes =
            step.departure && step.arrival
              ? Math.round((step.arrival.getTime() - step.departure.getTime()) / 60_000)
              : null;
          const leg = step.leg;
          const legIndex = leg ? journey.transitLegs.indexOf(leg) : -1;
          const prefix = journey.transitLegs.slice(0, Math.max(0, legIndex));
          const readyAt = +(
            (prefix.length ? arrivalTime(prefix.at(-1)!) : null) ??
            new Date(+journey.startTime + journey.originStation.bikeMinutes * 60_000)
          );
          const transfer =
            leg?.mode === "transit"
              ? boardingCheck(
                  prefix,
                  leg,
                  readyAt,
                  boardingMinutes,
                  journey.originStation.cyclingRoute?.to ?? journey.originStation,
                )
              : null;
          const extraServiceName =
            leg?.serviceName &&
            leg.serviceName.replace(/\s/g, "") !== leg.service.replace(/\s/g, "");
          return (
            <li key={index} className={`plan-step plan-step-${step.mode}`}>
              <div className="plan-step-heading">
                <h4>{step.title}</h4>
                {minutes !== null && minutes >= 0 && (
                  <span>
                    {step.mode === "bike" ? "≈ " : ""}
                    {formatMinutes(minutes)}
                  </span>
                )}
              </div>
              {leg?.direction && <p className="plan-service">Direction {leg.direction}</p>}
              {leg?.mode === "transit" && (
                <p className="plan-realtime">
                  {leg.realtime?.cancelled
                    ? "Cancelled"
                    : leg.realtime?.departureCancelled || leg.realtime?.arrivalCancelled
                      ? "Boarding or arrival stop cancelled"
                      : leg.realtime?.estimatedDeparture || leg.realtime?.estimatedArrival
                        ? "Provider estimates shown"
                        : "No live time estimate supplied; timetable shown"}
                  {leg.realtime && (
                    <>
                      {" "}
                      · checked {clock.format(new Date(leg.realtime.checkedAt))}
                      {realtimeStale(leg.realtime, realtime?.now) ? " · out of date" : ""}
                    </>
                  )}
                </p>
              )}
              {extraServiceName && <p className="plan-service">Service {leg.serviceName}</p>}
              {leg?.operator && <p className="plan-service">Operator {leg.operator}</p>}
              <div className="plan-stop">
                <PlanTime
                  date={step.departure}
                  scheduled={leg?.departure}
                  realtime={leg?.realtime}
                  start={journey.startTime}
                />
                <div>
                  <span className="plan-stop-label">
                    From{" "}
                    {leg?.fromId &&
                      stopNumbers.has(leg.fromId) &&
                      `(map ${stopNumbers.get(leg.fromId)})`}{" "}
                  </span>
                  <strong>{step.from ?? "Departure stop unavailable"}</strong>
                  {leg && effectivePlatform(leg, "departure") && (
                    <small>
                      Platform {effectivePlatform(leg, "departure")}
                      {leg.realtime?.departurePlatform &&
                      leg.realtime.departurePlatform !== leg.departurePlatform
                        ? ` · changed from ${leg.departurePlatform ?? "unspecified"}`
                        : ""}
                    </small>
                  )}
                </div>
              </div>
              <div className="plan-stop">
                <PlanTime
                  date={step.arrival}
                  scheduled={leg?.arrival}
                  realtime={leg?.realtime}
                  start={journey.startTime}
                />
                <div>
                  <span className="plan-stop-label">
                    To{" "}
                    {leg?.toId &&
                      stopNumbers.has(leg.toId) &&
                      `(map ${stopNumbers.get(leg.toId)})`}{" "}
                  </span>
                  <strong>{step.to ?? "Arrival stop unavailable"}</strong>
                  {leg && effectivePlatform(leg, "arrival") && (
                    <small>
                      Platform {effectivePlatform(leg, "arrival")}
                      {leg.realtime?.arrivalPlatform &&
                      leg.realtime.arrivalPlatform !== leg.arrivalPlatform
                        ? ` · changed from ${leg.arrivalPlatform ?? "unspecified"}`
                        : ""}
                    </small>
                  )}
                </div>
              </div>
              {step.mode === "bike" && (
                <InfoDisclosure label="Cycling distance and time estimate">
                  <p className="plan-note">
                    {step.cyclingRoute
                      ? `${step.cyclingRoute.distanceKm.toFixed(1)} km routed · ascent ${step.cyclingRoute.ascentM === null ? "unknown" : `${step.cyclingRoute.ascentM} m`} · descent ${step.cyclingRoute.descentM === null ? "unknown" : `${step.cyclingRoute.descentM} m`}. Estimated time includes short walking access to the path.`
                      : "Cycling route details unavailable."}
                  </p>
                </InfoDisclosure>
              )}
              {leg?.walkingRoute && (
                <InfoDisclosure label="Walking path and time estimate">
                  <p className="plan-note">
                    {leg.walkingRoute.distanceKm.toFixed(2)} km on a pedestrian route. Walking uses
                    at most 4.5 km/h, or the provider's slower estimate; cycling speed does not
                    affect it. Terrain and step-free access are not verified.
                  </p>
                  {leg.walkingRoute.startGapM + leg.walkingRoute.endGapM > 10 && (
                    <p className="plan-note">
                      Includes about{" "}
                      {Math.round(leg.walkingRoute.startGapM + leg.walkingRoute.endGapM)} m of
                      estimated access between your selected points and the mapped path.
                    </p>
                  )}
                  <p className="plan-note">
                    <a
                      href="https://routing.openstreetmap.de/about.html"
                      target="_blank"
                      rel="noreferrer"
                    >
                      OSRM · FOSSGIS
                    </a>
                    {" · "}
                    <a
                      href="https://www.openstreetmap.org/copyright"
                      target="_blank"
                      rel="noreferrer"
                    >
                      © OpenStreetMap contributors
                    </a>
                    {" · "}
                    <a
                      href="https://www.openstreetmap.org/fixthemap"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Fix the map
                    </a>
                  </p>
                </InfoDisclosure>
              )}
              {transfer && (
                <InfoDisclosure label="Station transfer and boarding time">
                  <p className="plan-note">
                    {transfer.note}{" "}
                    {transfer.url && (
                      <a href={transfer.url} target="_blank" rel="noreferrer">
                        Source
                      </a>
                    )}
                    {transfer.checked && (
                      <>
                        {" "}
                        · checked{" "}
                        {new Date(transfer.checked).toLocaleDateString("en-GB", {
                          timeZone: "Europe/Zurich",
                        })}
                      </>
                    )}
                  </p>
                </InfoDisclosure>
              )}
              {step.mode === "bike" && step.cyclingRoute && (
                <CyclingTerrainSummary route={step.cyclingRoute} />
              )}
              {step.mode === "walk" && (
                <p className="plan-note">
                  {takeBikeOnTransit ? "Push your bicycle while walking. " : "Continue on foot. "}
                  {leg?.walkingRoute
                    ? "The checked pedestrian route is shown; step-free access is not verified."
                    : "The timetable allowance includes any provider buffer; the continuous path, lifts and steps are not verified."}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {takeBikeOnTransit && (
        <section className="journey-bicycle-requirements" aria-labelledby={`${id}-bicycle-heading`}>
          <h3 id={`${id}-bicycle-heading`}>Bicycle on public transport</h3>
          <p>
            Check each service below. Permission does not guarantee space or complete a reservation.
          </p>
          {journey.transitLegs
            .filter((leg) => leg.mode === "transit")
            .map((leg, index) => (
              <section className="service-requirements" key={`${journey.id}:${index}`}>
                <h4>
                  {leg.service} · {leg.from} → {leg.to}
                </h4>
                <p>
                  {leg.departure && clock.format(leg.departure)} ·{" "}
                  {leg.operator ?? "Operator not supplied"}
                </p>
                <BicycleCarriageDetails leg={leg} onEvidence={onEvidence} />
              </section>
            ))}
        </section>
      )}
      <FareDetails journey={journey} profile={fareProfile} takeBikeOnTransit={takeBikeOnTransit} />
      <InfoDisclosure label="Journey guidance">
        <p className="plan-caution">
          Bicycle guidance covers a standard, unfolded bicycle. Check uncertain departures with the
          operator. Permission does not guarantee space or make a reservation; this app does not
          book bicycle spaces. Times and platforms come from the timetable service.
        </p>
      </InfoDisclosure>
    </section>
  );
}
