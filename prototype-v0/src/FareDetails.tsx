import { BIKE_DAY_SOURCE, RESERVATION_PRICE_SOURCE, fareSummary, type FareProfile } from "./fares";
import type { Journey } from "./routing";

export default function FareDetails({ journey, profile }: { journey: Journey; profile: FareProfile }) {
  const fare = fareSummary(journey.transitLegs, profile);
  if (fare.prohibited) return <section className="fare-details"><h4>Tickets and price</h4><p>This comparison includes prohibited bicycle carriage. Buying a ticket does not make that carriage possible.</p></section>;
  return <section className="fare-details"><h4>Tickets and price</h4>
    <dl><div><dt>Your travel ticket</dt><dd>{fare.passenger}</dd></div>
      <div><dt>Your bicycle</dt><dd>{fare.covered && profile.annualBikePass ? "Covered by your existing annual bike pass. Reservations remain separate."
        : fare.bikeChf !== null ? `Bike Day Pass option: CHF ${fare.bikeChf.toFixed(2)}. A route-specific bike ticket may be cheaper.`
          : "Check route-specific bicycle tickets and the validity of your bike pass with the operators."}</dd></div>
      <div><dt>Bicycle reservations</dt><dd>{fare.reservationChf === 0 ? "No reservation required on these services."
        : fare.reservationChf === 2 ? "CHF 2 for this Swiss rail connection, including connecting trains booked together."
          : fare.required ? "Required on the marked services. Obtain a quote for the complete connection."
            : "The timetable and operator rules do not establish every reservation condition."}</dd></div></dl>
    {fare.knownBikeTotal !== null && <p><strong>{profile.annualBikePass ? "Additional bicycle cost" : "Bicycle day-pass option with reservations"}: CHF {fare.knownBikeTotal.toFixed(2)}</strong>
      {profile.passenger !== "ga" && " + your passenger ticket"}. This is not a live total-fare quote.</p>}
    {!fare.singleDayPass && !profile.annualBikePass && <p>Check pass validity if your transit continues beyond 05:00 the next day.</p>}
    <p>One adult with one standard unfolded bicycle · 2nd class. An adult GA or Halbtax does not replace the bicycle ticket. No space is booked here.</p>
    <p className="carriage-source"><a href={BIKE_DAY_SOURCE.url} target="_blank" rel="noreferrer">Bike ticket options</a> · <a href={RESERVATION_PRICE_SOURCE.url} target="_blank" rel="noreferrer">Reservation instructions and prices</a> · reviewed {BIKE_DAY_SOURCE.checked}</p>
    <a href="https://www.sbb.ch/en" target="_blank" rel="noreferrer">Get the current passenger and bicycle ticket offer at SBB ↗</a>
  </section>;
}
