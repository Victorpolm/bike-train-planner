import { journeySteps } from "./itinerary";
import { formatMinutes, type Journey, type Place } from "./routing";
import { journeyStops } from "./mapData";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit",
});
const day = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich", day: "numeric", month: "short", year: "numeric",
});

function PlanTime({ date, start }: { date: Date | null; start: Date }) {
  if (!date) return <span className="plan-missing">Time unavailable</span>;
  return <time dateTime={date.toISOString()}>
    {clock.format(date)}
    {day.format(date) !== day.format(start) && <small>{day.format(date)}</small>}
  </time>;
}

export default function JourneyPlan({
  id, journey, origin, destination,
}: { id: string; journey: Journey; origin: Place; destination: Place }) {
  const stopNumbers = new Map(journeyStops(journey).map(stop => [stop.id, stop.number]));
  return (
    <section id={id} className="journey-plan" aria-labelledby={`${id}-heading`}>
      <div className="plan-heading">
        <h3 id={`${id}-heading`}>Your travel plan</h3>
        <p>{day.format(journey.startTime)} · Swiss local time</p>
      </div>
      <ol className="plan-steps">
        {journeySteps(journey, origin, destination).map((step, index) => {
          const minutes = step.departure && step.arrival
            ? Math.round((step.arrival.getTime() - step.departure.getTime()) / 60_000)
            : null;
          const leg = step.leg;
          const extraServiceName = leg?.serviceName
            && leg.serviceName.replace(/\s/g, "") !== leg.service.replace(/\s/g, "");
          return (
            <li key={index} className={`plan-step plan-step-${step.mode}`}>
              <div className="plan-step-heading">
                <h4>{step.title}</h4>
                {minutes !== null && minutes >= 0 && <span>{step.mode === "bike" ? "≈ " : ""}{formatMinutes(minutes)}</span>}
              </div>
              {leg?.direction && <p className="plan-service">Direction {leg.direction}</p>}
              {extraServiceName && <p className="plan-service">Service {leg.serviceName}</p>}
              <div className="plan-stop">
                <PlanTime date={step.departure} start={journey.startTime} />
                <div><span className="plan-stop-label">From {leg?.fromId && stopNumbers.has(leg.fromId) && `(map ${stopNumbers.get(leg.fromId)})`} </span><strong>{step.from ?? "Departure stop unavailable"}</strong>
                  {leg?.departurePlatform && <small>Platform {leg.departurePlatform}</small>}
                </div>
              </div>
              <div className="plan-stop">
                <PlanTime date={step.arrival} start={journey.startTime} />
                <div><span className="plan-stop-label">To {leg?.toId && stopNumbers.has(leg.toId) && `(map ${stopNumbers.get(leg.toId)})`} </span><strong>{step.to ?? "Arrival stop unavailable"}</strong>
                  {leg?.arrivalPlatform && <small>Platform {leg.arrivalPlatform}</small>}
                </div>
              </div>
              {step.mode === "bike" && <p className="plan-note">Estimated cycling time; no routed bike path yet.</p>}
            </li>
          );
        })}
      </ol>
      <p className="plan-caution">This experiment assumes a bicycle is available after transit; carriage and reservation rules are deferred. Times and platforms come from the timetable service.</p>
    </section>
  );
}
