# OJP bicycle permission and prerequisites — 24 September 2026

## Verified access and live calls

[GitHub Actions run 36034855752](https://github.com/Victorpolm/bike-train-planner/actions/runs/36034855752) succeeded using the existing repository secret `OJP_API_KEY`. Nine requests ran: bicycle filter off/on for three public journey pairs, followed by one matched TripInfo per mode. No key was read back or published. The workflow is now manual-only; regular pushes do not call OJP.

| Public journey | Departure, 25 September, Swiss time | Returned bicycle conditions |
|---|---|---|
| Rapperswil SG → Renens VD | 08:00 | IC legs include `A__VR`, a required bike-space reservation. Some regional train legs have no explicit bike note. |
| Chur, Postautostation → Laax GR, posta | 09:00 | Bus 81 includes required reservation; bus 411 explicitly permits carriage without reservation, conditional on space. |
| Lausanne-Ouchy (lac) → Evian-les-Bains (F) | 10:00 | Unfiltered results contain `A__VN` prohibitions and `A__VB` limited carriage. Filtering removes the prohibited services. |

All three TripInfo responses matched the requested service/date and repeated the relevant TripRequest notes. The train sample did not acquire an additional positive bike note. This sample does not establish exhaustive operator, tram or condition coverage. Historical public response fixtures are saved under `prototype-v0/src/fixtures/ojp-2026-09-24/`; they are used only for offline regressions.

## Interpretation

[Swiss TripRequest documentation](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/) defines `BikeTransport=true` as excluding bicycle-restricted connections; false disables this filter. `0:1` is cardinality, not a returned permission value. The provider documents a stop-restriction limitation that may omit otherwise usable services.

The app therefore records exact dated filtered segments as allowed according to OJP, while retaining original notes. Explicit applicable bans override filter matches. Missing notes on unfiltered-only legs stay unknown. The three independent optimization scopes are unchanged; prohibitions appear only in the all-transit reference.

| Evidence | App interpretation |
|---|---|
| `A__VN` | Bicycles prohibited |
| `A__VR` | Bike-space reservation required; separate from ticket |
| `A__VB` | Bicycle carriage conditional on limited space |
| Reviewed explicit no-reservation sentence | Reservation not required; stated space condition retained |
| Passenger seat/group reservation (`A___R`, `A__GR`) | No inferred bicycle reservation requirement |
| Unknown dynamic code or missing condition | Unknown; original bicycle-related text remains visible |

[TripInfo documentation](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptripinforequest-2-0/) identifies a service by JourneyRef and operating day. The app additionally matches raw boarding/alighting stop references and scheduled times, applying call notes only inside that interval. A new ban recomputes all three searches.

Bike-ticket guidance is independent: SBB services show a ticket or valid bike pass requirement with an [official SBB source](https://www.sbb.ch/en/travel-information/individual-needs/travelling-with-bikes/carriage-bikes-train.html); recognized buses use their sourced operator policy. Fare exceptions remain for the operator to confirm. Other unknown fares remain unknown. Operator links let travellers arrange tickets/reservations themselves; no purchase, reservation or remaining-space lookup is performed.

## Implementation and activation

The existing React/Leaflet app is served by a Worker with `/api/ojp/status`, `/api/ojp/connections` and `/api/ojp/tripinfo`. OJP credentials stay server-side. The proxy uses a fixed endpoint, response/body limits, timeouts, pacing, short-lived bounded caches, origin checks and generic error messages. Both paired upstream calls count against the existing 18-request search budget. Road-routed cycling still determines access, egress and feasibility; OJP default endpoint walks are not treated as bicycle routes.

**Remaining configuration:** GitHub Actions and the hosted Site have separate secret stores. GitHub's key works inside Actions but cannot be retrieved through its API. The Site currently has no runtime secret. Configure the same key as a secret named `OJP_API_KEY` on the existing Site and apply it by redeploying the saved version. Until then the app uses the fallback timetable with unknown service permission. No credential extraction or transmission through artifacts is used.

## Verification and limits

120 application tests and 13 Python tests pass. TypeScript and frontend/Worker builds pass. Built Worker smoke checks return the app, truthful unavailable status without a key and a 404 for unknown assets. Managed browser preview was unavailable, so no fresh desktop/mobile visual QA is claimed.

This is a bounded scheduled-service implementation, not complete Swiss timetable/OSM coverage, live disruptions or guaranteed bicycle carriage. Public transport and cycling maps remain as described in [the coverage audit](TRIPINFO_AND_NETWORK_COVERAGE.md).

Private publication succeeded on 24 September at 18:01:48 UTC from Site source `c0283e036da14e004e5abeddb49f62cf23e67f90`, environment revision 0. [Publication record](WEBSITE.md).
