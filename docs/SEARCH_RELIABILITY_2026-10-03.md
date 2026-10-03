# Search reliability, city fares and later departures

_3 October 2026 · implemented on `feature/novice-interface-profiles`; main remains unmerged._

## What changed

- The two requested explanations are persistent click/tap **?** buttons beside **Public transport with my bicycle** and **Where would you like to cycle?**. Help follows the current choice, supports keyboard activation and Escape, and does not depend on hover.
- OJP connection requests serialize only stop ID, name, latitude and longitude. Previously complete cycling geometry travelled inside enriched station objects. A live request was rejected with HTTP 400 because it exceeded the server's 8 KiB limit, then OJP was disabled for the remainder of that search. Falling back also lost retained fare evidence and made exact matching less reliable on frequent city services. The backend size/credential boundary remains intact.
- If the initial four geometric station candidates fail the actual road-time limit, discovery tries a bounded expanded pool of up to eight before reporting failure. Cycling limits are unchanged; no straight-line journey is substituted. Errors identify the affected endpoint and use the actual Preferences terminology.
- A new Extended search starts transfer discovery after its first station-pair query. It avoids redundant origin departure-board calls and does not treat the stage's final destination as a useful intermediate transfer. Ordinary alternatives no longer spend the entire initial allowance first. Both solvers still operate on the acquired graph, but independently started Baseline and Extended searches can sample different graphs.
- Explicitly switching an existing result to Extended starts a fresh bounded acquisition action, keeping its graph and checked cycling routes. Each action permits at most 18 timetable requests and the existing 90-second normal deadline, 32 cycling requests and 0/2-transfer rules. Budgets do not reset within a discovery round. Missing endpoint discovery is retried. Cancellation and partial-result retention remain available.
- **More · later departures** is now functional below each proposal. It requests later services for that card's categories, keeps earlier cards, preserves positions/waypoints/pace/cycling/access constraints, reuses verified cycling links and advances beyond the latest shown departure on repeated clicks. Each later search has its own departure, categories and bounded allowance. It is an explicit timetable request, not a cosmetic reveal or a silent route change.
- A proven zero-distance, zero-time connector at the same stop no longer incorrectly blocks fare lookup. Positive cycling gaps still cannot receive an unsupported through quote. City products remain provider-derived; no hard-coded zone price was added.
- The earlier request to allow past departure entry is restored. Availability depends on the timetable provider; OJP fares remain future-only and the UI explains this.

## Observed evidence

[Sanitized live evidence](experiments/ui-routing-city-fares-2026-10-03.json), checked 3 October for departures on 5 October 2026. The development client used the existing hosted server and existing secrets; keys were not read or changed.

| Check | Result |
|---|---|
| Previous Zürich–Laax Extended request | Enriched Zürich Landesmuseum (See) station produced an oversized OJP request and HTTP 400; public-timetable fallback followed |
| Corrected Zürich HB–Laax GR, posta, Extended, Relaxed 20 km/h / 45 min | 2 Baseline and 4 Extended feasible journeys in the acquired graph; discovery completed within 15 timetable requests; compact OJP requests succeeded |
| Zürich–Laax More | 4 later feasible journeys; first boarding advanced from 10:38 to 11:02 Europe/Zurich; 8 requests; original result retained |
| Zürich Kunsthaus–Zoo entrance, Extended | 6 Baseline / 22 Extended feasible journeys; 10 requests; no search warnings |
| City journey's three recommendation categories | Tram/bus, direct tram, and tram/tram exact itineraries all returned ZVV passenger CHF 4.70 and bicycle CHF 3.30 |
| Zürich HB–Oerlikon | ZVV full CHF 4.70 / Half Fare CHF 3.30; bicycle CHF 3.30 |
| Bern Morgartenstrasse–Bollwerk, actual selected bus segment | Libero full CHF 3.00 / Half Fare CHF 2.00; bicycle CHF 2.00 |

The Zürich–Laax cycling-only comparison failed independently at BRouter in the corrected run; transit journeys and fares remained available. The original reported empty-stop case did not include locations, so that exact journey was not reproduced. The road-pool defect is covered by a deterministic sparse-area regression; this does not prove nationwide coverage.

**327 offline tests in 11 suites pass.** New cases exercise the real OJP request boundary with large graph geometry and retained fare evidence, repeated later departures, correct cycling/walking readiness, recovery of a fifth viable stop, and stationary connector fares. The existing two-transfer acquisition regression now begins with an exhausted Baseline request budget. Existing permission, waypoint, two-transfer and positive cycling fare-gap checks remain passing.

Browser interaction/visual QA remains pending because the required managed browser capability is unavailable. The controls compile; no browser-click verification is claimed. Production build and publication evidence are recorded in [WEBSITE.md](WEBSITE.md).

## Provider facts and limits

The [official OJP Fare cookbook](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/), checked 3 October, documents future Swiss trips, Half Fare handling, integration/test prices and support for **OJP 1.0 and 2.0**. The older best-practices page's 1.0-only sentence is no longer an adequate diagnosis. [Official implementation](https://github.com/openTdataCH/ojp-nova) confirms the mapping of whole selected transit leg ranges and separate fare classes. Our exact-leg, currency, class, entitlement and incomplete-coverage validation stays in place.

These prices are dated provider test observations, not production offers or a guarantee that every city/operator/itinerary returns a quote. Keep unknown prices explicit. A paid bicycle ticket does not establish bicycle permission or reserve a space. Per-block pricing across a real cycling interruption remains future work.

## Next discussion: SBB handoff

Investigate supported SBB links with origin, destination, Swiss date/time, class and traveller fare prefilled. Verify which options survive opening the link, especially bicycle selection and reservations. Do not present a filled timetable search as a booked ticket. No new SBB booking or prefilled purchase integration is delivered here.

## Publication

Owner-private **version 47** published on **3 October 2026 at 11:52:51 UTC**, environment revision **3**, Site source `f840d619fb214c03474c679f71ceebace5c63acc`. The Site remains owner-private; runtime secrets and audience are unchanged. All **201 application files** match the GitHub feature branch; [draft PR #1](https://github.com/Victorpolm/bike-train-planner/pull/1) remains unmerged. The production build, formatting and Knip checks passed.
