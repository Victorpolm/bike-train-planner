# Zentralbahn reservations, partial fares and cycling recovery — 2 November 2026

## Delivered

Owner-private **version 82** is published at the existing Re.route URL. Source `472cb2ca045c5ba8e21be0be96e8ef6048e7d040`, deployment `appgdep_6ae8a9f0fa1c8191969fd991f7c10fae`, environment revision **4**, published **2 November 2026 at 16:19:34 Europe/Zurich**. Runtime keys and audience are preserved.

- Zentralbahn ordinary domestic trains, including **S44 Luzern–Stans**, use the operator's explicit policy: self-loaded bicycles are accepted subject to room, a bicycle ticket/pass is required, and bicycle spaces cannot be reserved. The dated rule covers departures from 2 November through the local review boundary of 12 December 2026. Replacements, foreign legs, unrelated operators, stale scope and stronger dated bans/reservation requirements do not inherit the exemption.
- **Published rule** appears beside a no-reservation conclusion derived from an applicable operator policy. Its explanation distinguishes that policy from an explicit no-reservation statement returned for this particular departure. The existing shared T600 inference is marked **Timetable rule**. Missing data does not become an unconditional exemption.
- Zentralbahn rail is included in reviewed national bicycle-pass and GA coverage. A continuous SOB–Zentralbahn journey can show the **CHF 15 Bike Day Pass** and **CHF 0 bicycle reservation**. This is an available product, not a claim that no cheaper bicycle single ticket exists. Annual/day pass and passenger GA entitlements remain separate and dated.
- A known bike-ticket price now appears on result cards when the passenger fare is unavailable. The card identifies it as **Bike ticket**, explicitly says that the passenger needs a quote, and does not show an invented complete total. Full/half-fare passenger pricing for an arbitrary route remains incomplete; integration-system estimates remain disabled under the existing release policy.
- After a transient primary cycling failure and an unusable backup, the primary service now receives its existing one bounded retry. Previously the presence of a backup disabled that retry even when the backup failed. Request/deadline/rate-limit bounds and permanent-failure behavior remain intact. The cycling-only empty state shows its specific recorded failure, such as a timeout.

## Reproduction and evidence

The reported Herisau-area to Ennetmoos-area route has a usable road/path route. A standalone BRouter request returned 158.934 km. A subsequent check through the actual CyclingClient reproduced the missing result: the primary request hit its 25-second timeout and the OSRM backup returned HTTP 200 but was not accepted as a usable cycling route. The precise backup rejection was not retained in that diagnostic. Previously no primary retry followed. The UI incorrectly compressed this recoverable service failure into a generic unavailable result.

A later live check through the same client, with Simplest and 20 km/h flat-ground pace, successfully compared trekking and fastbike candidates and returned **119.818 km / 488 estimated minutes**. The official terrain check was partial (about 23.6 km matched); this is not complete access or safety certification. Both primary requests succeeded in that later check, so the success itself is not claimed as a live exercise of the newly added retry. A controlled regression specifically proves primary timeout → rejected backup → successful primary retry. Permanent no-route failures are not retried. Private pin coordinates and bulk route geometry are not copied into public fixtures.

The user did not supply their exact travel time or saved settings. Live timetable checks used **3 November 2026 from 08:00 Europe/Zurich**. The published OJP endpoint returned four Luzern–Stans departures (IR LEX and S4) with operator `ojp:86`, positive bicycle-filter permission, and no bicycle-reservation attributes. These are recorded in `prototype-v0/src/fixtures/zentralbahn-2026-11-02.json`; S44 is a separately labelled rule-scope regression under the same official all-lines policy. A Herisau–Stans query also returned services without provider warnings. This is not a claim to reproduce the user's exact selected itinerary.

### Counterexample to a missing-R default

The recorded OJP fixture `ojp-live-2026-10-11/trip.xml` includes **IC8 Zürich HB–Bern, Sunday 11 October 2026 at 21:44 Europe/Zurich**. Its returned attributes contain no `A__VR`, but SBB's published Friday–Sunday seasonal IC rule requires a bicycle reservation on that date. The regression resolves official stop identity and verifies the required reservation. This proves that absence in our API response is insufficient; it does **not** prove that SBB's own app omitted the R. A bicycle provision symbol in a coach composition shows equipment and cannot by itself certify complete reservation data.

## Sources

Reviewed on 2 November 2026:

- [Zentralbahn bicycle carriage](https://www.zentralbahn.ch/de/planen/im-zug/bequem-reisen-1): all lines, no bicycle-space reservations, self-loading, ticket/pass and space conditions.
- [Zentralbahn tickets and passes](https://www.zentralbahn.ch/de/planen/vor-der-reise/abos-und-billette): GA and Half Fare offerings; [Luzern–Interlaken Express](https://www.zentralbahn.ch/en/experience/leisure/luzern-interlaken-express) also explicitly confirms GA coverage on that route.
- [SBB reservation calendar](https://www.sbb.ch/fr/informations-voyages/besoins-individuels/voyager-avec-velo/transport-velo-train.html): seasonal and year-round requirements take priority over missing reservation attributes.

## Verification and remaining work

**741 JavaScript tests, 16 Python tests, 71 rendered panels, formatting, unused-code analysis, TypeScript and frontend/Worker builds pass.** New tests cover captured Zentralbahn journeys, S44/aliases, exclusions/expiry, explicit VN/VR priority, pass/partial-price behavior, the recorded IC8 counterexample and cycling retry/permanent-failure boundaries.

Interactive browser/phone verification remains outstanding. Provider outages can still prevent routing; no fabricated line or unsafe backup is used. Full passenger fares still require an authoritative production quote or a reviewed complete tariff. The next pricing step is production fare coverage; a bike symbol or a bike pass cannot supply the missing passenger fare. No scheduled alert or access setting was changed.
