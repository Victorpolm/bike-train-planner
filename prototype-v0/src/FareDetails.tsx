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
