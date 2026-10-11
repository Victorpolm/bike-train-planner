import { isSbb } from "./operatorBicycleRules";
import { carriageForLeg } from "./bicycleCarriage";
import JourneyDataQuality from "./JourneyDataQuality";
import { fareSummary, type FareProfile } from "./fares";
import type { Journey } from "./routing";
import { useOnlineFare } from "./useOnlineFare";
import PriceValue from "./ui/PriceValue";
import TariffHealth from "./ui/TariffHealth";
export default function FareDetails({
  journey,
  profile,
  takeBikeOnTransit = true,
}: {
  journey: Journey;
  profile: FareProfile;
  takeBikeOnTransit?: boolean;
}) {
  const online = useOnlineFare(journey.transitLegs, profile, takeBikeOnTransit);
  const fare = fareSummary(journey.transitLegs, profile, online.quote, takeBikeOnTransit);
  return (
    <section className="fare-details">
      <h4>Tickets and price</h4>
      {fare.prohibited && (
        <p>
          This bicycle cannot be carried on a selected service. A ticket or reservation does not
          override the restriction.
        </p>
      )}
      {!takeBikeOnTransit && (
        <p>
          Your bicycle stays off public transport. No bicycle ticket or reservation is included.
        </p>
      )}
      {journey.transitLegs.some((l) => l.facilityVisit) && (
        <p>
          Prices describe the edited transport itinerary. Facility purchases and parking fees are
          not included.
        </p>
      )}
      <dl>
        <div>
          <dt>Passenger</dt>
          <dd>
            <PriceValue price={fare.passengerPrice} />
          </dd>
        </div>
        {takeBikeOnTransit && (
          <>
            <div>
              <dt>Bicycle ticket</dt>
              <dd>
                <PriceValue price={fare.bicyclePrice} />
              </dd>
            </div>
            <div>
              <dt>Bicycle reservation</dt>
              <dd>
                <PriceValue price={fare.reservationPrice} />
              </dd>
            </div>
          </>
        )}
        <div>
          <dt>Complete additional cost</dt>
          <dd>
            <PriceValue price={fare.totalPrice} />
          </dd>
        </div>
      </dl>
      {fare.published && (
        <p>
          Published standard fare for {fare.published.from} → {fare.published.to}, zones{" "}
          {fare.published.zones.join(", ")}, ticket valid {fare.published.validMinutes} minutes.{" "}
          <a href={fare.published.source.url} target="_blank" rel="noreferrer">
            Published tariff
          </a>
          .
        </p>
      )}
      {fare.localGuidance.length > 0 && (
        <details>
          <summary>Local operator tickets and conditions</summary>
          {fare.localGuidance.map((rule) => (
            <div key={rule.id}>
              <p>
                <strong>{rule.name}</strong> · {rule.ticket}
              </p>
              <ul>
                {rule.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
              {!rule.current && (
                <p>Outside our reviewed dates: confirm the current rules before travel.</p>
              )}
              <p>
                <a href={rule.source.url} target="_blank" rel="noreferrer">
                  Official conditions
                </a>{" "}
                · reviewed {rule.source.checked}.
              </p>
            </div>
          ))}
        </details>
      )}
      {fare.published?.source.id === "unireso" && (
        <p>
          Zone matching uses TPG stop data updated 4 October 2026 and line pages reviewed 11 October
          2026. This is an independent Re.route extraction. The 60-minute fare covers the checked
          journey; a qualifying short-hop ticket may cost less.
        </p>
      )}
      {!online.quote && online.message && <p>{online.message}</p>}
      <p>
        Permission, a valid ticket, a required reservation and remaining space are separate. This
        app sells no tickets and reserves no bicycle space. A day pass may cost more than an
        unavailable reduced route ticket.
      </p>
      {fare.required > 0 &&
        journey.transitLegs.some(
          (l) => isSbb(l) && carriageForLeg(l, profile).bikeReservation === "required",
        ) && (
          <p>
            Reserve before departure. SBB publishes a CHF 10 surcharge for missing a compulsory
            bicycle reservation; it does not guarantee transport.
          </p>
        )}
      {takeBikeOnTransit && (
        <details>
          <summary>Bicycle travel on several days</summary>
          <PriceValue price={fare.multipleDayPrice} />
        </details>
      )}
      <TariffHealth />
      <JourneyDataQuality
        journey={journey}
        profile={profile}
        quote={online.quote}
        takeBikeOnTransit={takeBikeOnTransit}
      />
    </section>
  );
}
