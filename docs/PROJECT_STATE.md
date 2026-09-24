# Project state

_Last consolidated: 2026-09-24. Source implementation and publication status are distinct._

## Objective and scope

**Decision:** Validate useful bicycle + public-transport journeys in a small Swiss pilot area. The bicycle accompanies the traveller throughout. Preserve raw route attributes, represent missing carriage rules as uncertainty, and describe cycling infrastructure without claiming objective safety.

## Current implementation

**Fact:** `prototype-v0/` is the active React/TypeScript/Leaflet application. The original geometric prototype is preserved in Git history and historical fixtures; the current code has progressed beyond simple station enumeration and fastest-arrival ranking.

- **Baseline / Extended:** The same sampled timetable graph and resource limits, allowing zero versus at most one automatic intermediate cycling leg. Ordinary transit/walking changes are allowed in both.
- **Three independent comparisons:** Confirmed bicycle permission on every transit leg; allowing uncertain permission but excluding prohibitions; all public transport with bicycle rules ignored. The third is a labelled reference and may contain services that prohibit bicycles. Avoid buses applies to all three. Deduplicate after optimization; preserve each group's categories and arrival allowance.
- **Results:** Routed cycling-only comparison, then fastest with transit, fewest boardings and least cycling or walking; optional least active time at one endpoint. Raw cycling and walking remain separate. Each transit comparison has its own 60-minute alternative window.
- **Cycling:** Directed BRouter road routes and terrain-aware time estimates determine train readiness and budgets. Temporary outages can use validated OSRM bicycle routes, with unavailable elevation/road details kept unknown. No geometric fallback. Profiles show elevation, surfaces, infrastructure and approximate speed bands with explicit unknowns. Endpoint gaps up to 250 m remain visible and add estimated walking time.
- **Journey input:** Address suggestions, map selection and dragging, up to four ordered visits, route reversal, Swiss departure time and a 24-hour whole-journey window. Visits share cycling/boarding/time budgets; stopover duration is zero.
- **Usability:** Progressive proposals survive cancellation; journey cards explain all legs, waiting, boarding locations and available platforms. The map shows observed stops and routes. Cycling presets include Above 150 minutes within the 24-hour horizon.
- **Data acquisition:** Local and rail candidate coverage, bounded outward exploration and an 18-request timetable cap. Observed exits prioritize fewer boardings and early arrival as well as proximity. Provider budgets exclude time waiting on the other provider; temporary failures have bounded recovery and rate-limit cooldowns. Ordered-stage queries preserve independently reachable permission-scope times. Sampled acquisition can still miss services and is not globally optimal.

The third comparison does not imply a complete national dataset. See [the mathematical model](MATHEMATICAL_MODEL.md), [permission contract](BICYCLE_PERMISSION_AND_OJP.md) and [coverage audit](TRIPINFO_AND_NETWORK_COVERAGE.md).

## Bicycle permission and OJP

**Implemented:** A server-only OJP adapter pairs unfiltered and bicycle-filtered searches. Exact dated filter matches establish permission according to OJP; applicable prohibitions override them. Reviewed service conditions identify bike reservation requirements, explicit no-reservation cases and limited carriage. Unknown notes remain unknown. General operator ticket guidance is separate from service permission.

Every transit leg now displays permission, a bike ticket/pass requirement and a separate bike-space reservation requirement, including unknowns. Opening a journey retrieves TripInfo matched to its dated service and boarded interval. New evidence recomputes all three route comparisons. Original provider notes and official operator links remain visible.

**Live verification:** The earlier 16-call TripRequest benchmark passed. On 24 September, another nine calls succeeded using the existing GitHub Actions secret: paired TripRequests and one TripInfo each for train, bus and boat. [Live findings and activation](OJP_PERMISSION_2026-09-24.md).

**Activation pending:** The hosted Site has no runtime environment entries. It needs its own secret `OJP_API_KEY`; GitHub does not expose the stored Actions secret for automatic transfer. Until configured and applied through deployment, the published app uses the fallback timetable and preserves unknown permission. The implementation and API access are verified; live website OJP activation is not yet complete.

**Scope:** Remaining bicycle places, occupancy, reservation availability and actual bookings remain deferred. Requirements and booking links are explanatory; permission is not a reservation or guaranteed boarding.

## Network coverage

**Fact:** We do not have a complete, verified local graph/map of all Swiss terrestrial and boat public transport, or an audited inventory of every cycle path. The app queries selected services and BRouter routes.

The national Swiss GTFS source includes land modes and boat/ferry categories, but is not imported. BRouter uses OSM; availability of a road route does not establish completeness of every path or tag. Transit map lines are schematic. The cycling profile disables ferries, which must appear as explicit transit legs. See [source coverage versus app coverage](TRIPINFO_AND_NETWORK_COVERAGE.md).

## Verification and publication

129 app tests pass; the unchanged Python evaluation suite was last verified at 13 passing tests. Current checks include TypeScript, the Vite frontend and Worker production builds. New regressions cover the avoidable Baden-style bus, short cycling-only survival, temporary failures, Retry-After, provider budgets and backup-route mode/data boundaries. Earlier regressions cover exact TripInfo identity/segment matching, train/bus/boat conditions, reservation conflicts, secret handling and rerouting after a new prohibition. Browser visual verification was unavailable because the managed preview service was absent.

Private version 15, including the Baden fixes, succeeded on 24 September at 18:41:38 UTC from Site commit `bc5ee85`, with environment revision 0 (OJP runtime secret still absent). Publication details are tracked in [WEBSITE.md](WEBSITE.md). The existing owner-private Site is reused. GitHub pushes do not automatically publish the Site.

## Immediate next actions

1. Configure `OJP_API_KEY` as the existing Site's runtime secret and redeploy its saved version; then check actual live website journeys.
2. Recheck 3–6 fixed real journeys for timing, road access, missed candidates and permission completeness, including a tram example.
3. Inspect national GTFS mode/operator/calendar coverage and a dated OSM extract before claiming a complete Swiss graph.
4. Compare the sampled approach with OpenTripPlanner and complete timetable/street data; validate cycling times and station entrances against rides. No RAPTOR/ULTRA or OTP migration is implemented.
5. Continue user interviews before expanding the product scope.

## Remaining risks and parked work

Carriage-rule coverage, sampled service discovery, cycling estimates, incomplete OSM attributes and station/platform access remain the main technical uncertainties. Demand and the value of an intermediate cycling leg still need validation.

Native apps, ticket sales, real-time disruptions, nationwide product expansion, social/community features, carbon dashboards, machine-learning personalization, turn-by-turn navigation and production-scale infrastructure remain outside the immediate milestone. National data evaluation does not itself change the pilot product scope.

## Updating this file

Keep this summary short and factual. Record changes to earlier decisions as dated entries in `DECISIONS.md`; retain experiment history in `EXPERIMENTS.md`. An uploaded copy is a snapshot, not an automatically synchronized source. Repository code, tests and verified publication records determine the current state.
