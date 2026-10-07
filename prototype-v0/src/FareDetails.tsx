import { BIKE_DAY_SOURCE, RESERVATION_PRICE_SOURCE, fareRows, type FareProfile } from "./fares";
import type { Journey } from "./routing";
import { useOnlineFare } from "./useOnlineFare";

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
  const { fare, rows } = fareRows(journey.transitLegs, profile, online.quote, takeBikeOnTransit);
  return (
    <section className="fare-details">
      <h4>Tickets and price</h4>
      {fare.prohibited && (
        <p>
          This comparison includes a bicycle ban. The passenger price can still be checked; buying a
          ticket does not make bicycle carriage possible.
        </p>
      )}
      {!takeBikeOnTransit && (
        <p>
          Your bicycle stays off public transport. No bicycle ticket or bicycle reservation is
          included.
        </p>
      )}
      <dl>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <strong>{row.value}</strong> · {row.detail}
            </dd>
          </div>
        ))}
      </dl>
      {fare.totalChf !== null && (
        <p>
          <strong>
            {fare.online ? "Estimated additional cost" : "Additional cost"}: CHF{" "}
            {fare.totalChf.toFixed(2)}
          </strong>
          .{" "}
          {fare.online
            ? "Includes OJP test fare data; confirm the purchase price with the operator."
            : !takeBikeOnTransit
              ? "Passenger fare only."
              : fare.minimumVerified
                ? "Lowest of the reviewed standard bicycle ticket and day-pass options."
                : "Day-pass option; a bicycle route ticket may cost less."}
        </p>
      )}
      {fare.online ? (
        <p>
          <a
            href="https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/"
            target="_blank"
            rel="noreferrer"
          >
            OJP Fare beta
          </a>{" "}
          · test estimate for the matched transit itinerary, checked{" "}
          {new Date(fare.online.checked).toLocaleString("en-CH")}. Supersaver (Sparbillett) products
          have offer conditions and may be tied to a specific departure. This is not a ticket or
          reservation.{fare.online.reason && " " + fare.online.reason}
        </p>
      ) : fare.published ? (
        <p>
          Published standard fare for {fare.published.from} → {fare.published.to}, zones{" "}
          {fare.published.zones.join(", ")} ({fare.published.paidZones} paid zones), valid{" "}
          {fare.published.validMinutes} minutes.{" "}
          <a href={fare.published.source.url} target="_blank" rel="noreferrer">
            {fare.published.source.title}
          </a>{" "}
          · reviewed {fare.published.source.checked}. Valid tariff dates {fare.published.validFrom}–
          {fare.published.validTo}. Supersaver offers are not included.
        </p>
      ) : (
        <p>
          {fare.passenger} This route is outside the reviewed local fare tables; request the current
          passenger {takeBikeOnTransit ? "and reduced bicycle fare" : "fare"} from the operator.
        </p>
      )}
      {!fare.online && online.message && <p>{online.message}</p>}
      {fare.reservationChf === 2 && (
        <p>
          CHF 2 is a separate bicycle reservation, not part of the bicycle ticket. Book all
          connecting trains together. This app does not reserve a place.
        </p>
      )}
      {takeBikeOnTransit && !fare.singleDayPass && !profile.annualBikePass && (
        <p>Check pass validity if your transit continues beyond 05:00 the next day.</p>
      )}
      {takeBikeOnTransit && (
        <p>
          One adult with one standard unfolded bicycle · 2nd class. An adult GA or Halbtax does not
          replace the bicycle ticket. A Bike Day Pass is valid for its calendar day until 05:00 the
          next day.
        </p>
      )}
      {takeBikeOnTransit && (
        <p className="carriage-source">
          <a href={BIKE_DAY_SOURCE.url} target="_blank" rel="noreferrer">
            Bike ticket options
          </a>{" "}
          ·{" "}
          <a href={RESERVATION_PRICE_SOURCE.url} target="_blank" rel="noreferrer">
            Reservation instructions and prices
          </a>{" "}
          · reviewed {BIKE_DAY_SOURCE.checked}
        </p>
      )}
      <a href="https://www.sbb.ch/en" target="_blank" rel="noreferrer">
        Get the current {takeBikeOnTransit ? "passenger and bicycle" : "passenger"} ticket offer at
        SBB ↗
      </a>
    </section>
  );
}
