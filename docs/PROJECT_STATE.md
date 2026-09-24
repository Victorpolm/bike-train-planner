# Project state

_Last consolidated: 2026-09-24. Source implementation and publication status are distinct._

## Objective and scope

**Decision:** Validate useful bicycle + public-transport journeys in a small Swiss pilot area. The bicycle accompanies the traveller throughout. Preserve raw route attributes, represent missing carriage rules as uncertainty, and describe cycling infrastructure without claiming objective safety.

## Current implementation

**Fact:** `prototype-v0/` is the active React/TypeScript/Leaflet application. The original geometric prototype is preserved in Git history and historical fixtures; the current code has progressed beyond simple station enumeration and fastest-arrival ranking.

- **Baseline / Extended:** The same sampled timetable graph and resource limits, allowing zero versus at most one automatic intermediate cycling leg. Ordinary transit/walking changes are allowed in both.
- **One all-mode access selector:** Verified access only; also allow unverified access; also include prohibited transit. The selected scope controls feasibility before label pruning in Baseline, Extended and ordered visits. Only its category winners appear. Prohibitions remain explicit when included. The legacy independent solves remain available internally for regression comparisons.
- **Results:** Routed cycling-only comparison, then fastest with transit, fewest boardings and least cycling or walking; optional least active time at one endpoint. Raw cycling and walking remain separate. Each transit comparison has its own 60-minute alternative window.
- **Cycling:** Directed BRouter road routes and configurable Relaxed/Regular/Strong/Electric profiles determine train readiness and budgets. Editable flat speed (8–35 km/h) calibrates power; per-slope timing and electric climbing assistance replace a blanket percentage. A live slope-speed table explains the estimate. Cache entries distinguish pace and assistance. Temporary outages can use validated OSRM bicycle routes, with unavailable elevation/road details kept unknown. No geometric fallback. Profiles show elevation, surfaces, infrastructure and approximate speed bands with explicit unknowns. Endpoint gaps up to 250 m remain visible and add estimated walking time.
- **Journey input:** Address suggestions, map selection and dragging, up to four ordered visits, route reversal, Swiss departure time and a 24-hour whole-journey window. Visits share cycling/boarding/time budgets; stopover duration is zero.
- **Usability:** Progressive proposals survive cancellation; journey cards explain all legs, waiting, boarding locations and available platforms. The map shows observed stops and routes. Cycling presets include Above 150 minutes within the 24-hour horizon.
- **Data acquisition:** Local and rail candidate coverage, bounded outward exploration and an 18-request timetable cap. Two extra bounded rail-exit queries use the original ready time to uncover earlier trains omitted by onward-wait optimization. Their cycling finishes are checked promptly. Other unchecked exits are refined by arrival/boarding objectives. Routes are reused by directed station identity across small coordinate differences. Provider budgets exclude time waiting on the other provider; temporary failures have bounded recovery and rate-limit cooldowns. Ordered-stage queries preserve independently reachable permission-scope times. Sampled acquisition can still miss services and is not globally optimal.

The all-transit choice does not imply a complete national dataset. See [the mathematical model](MATHEMATICAL_MODEL.md), [permission contract](BICYCLE_PERMISSION_AND_OJP.md) and [coverage audit](TRIPINFO_AND_NETWORK_COVERAGE.md).

## Bicycle permission and OJP

**Implemented:** A server-only OJP adapter pairs unfiltered and bicycle-filtered searches. Exact dated filter matches establish permission according to OJP; applicable prohibitions override them. Reviewed service conditions identify bike reservation requirements, explicit no-reservation cases and limited carriage. Unknown notes remain unknown. General operator ticket guidance is separate from service permission.

Every transit leg now displays permission, a bike ticket/pass requirement and a separate bike-space reservation requirement, including unknowns. Opening an OJP-backed journey retrieves TripInfo matched to its dated service and boarded interval. New evidence recomputes the selected route scope. Original provider notes and official operator links remain visible.

**Live verification:** The earlier 16-call TripRequest benchmark passed. On 24 September, another nine calls succeeded using the existing GitHub Actions secret: paired TripRequests and one TripInfo each for train, bus and boat. [Live findings and activation](OJP_PERMISSION_2026-09-24.md).

**Public carriage data active:** The keyless search.ch connection feed exposes dated `VN` (prohibited), `VR` (bike reservation required), and `VB` (limited-space carriage) symbols omitted by Transport API connection objects. These are interpreted for exact segments, including timed train exits. Passenger/group reservation symbols do not count as bike reservations. Reviewed domestic SBB IR and SOB mainline rules provide narrowly applicable defaults with separate source links; explicit bans and reservation conflicts take precedence. Ordinary reviewed ZVV-operator/tpg bus and tram policies now verify conditional permission; replacements and unmatched rules remain unknown. Cards label actual permission and name unknown legs. Unknown ticket/reservation details never downgrade allowed access. General guidance is expanded and nonempty.

**OJP activation pending:** The Site still has no `OJP_API_KEY`. GitHub Actions access is verified, but its stored secret cannot be read back. The public feed now improves carriage details independently of OJP activation; no secret extraction is introduced.

**Scope:** Remaining bicycle places, occupancy, reservation availability and actual bookings remain deferred. Requirements and booking links are explanatory; permission is not a reservation or guaranteed boarding.

## Network coverage

**Fact:** We do not have a complete, verified local graph/map of all Swiss terrestrial and boat public transport, or an audited inventory of every cycle path. The app queries selected services and BRouter routes.

The national Swiss GTFS source includes land modes and boat/ferry categories, but is not imported. BRouter uses OSM; availability of a road route does not establish completeness of every path or tag. Transit map lines are schematic. The cycling profile disables ferries, which must appear as explicit transit legs. See [source coverage versus app coverage](TRIPINFO_AND_NETWORK_COVERAGE.md).

## Verification and publication

145 app tests pass; the unchanged Python evaluation suite was last verified at 13 passing tests. Current checks include TypeScript, the Vite frontend and Worker production builds. New regressions additionally cover nonlinear climbing speeds, electric support, train catchability, cycling budgets, cache isolation, backup timing, production propagation and permission independent of prerequisites. Earlier regressions cover selected permissions across train/tram/boat/bus, public bicycle symbols, exact exit evidence, scoped operator rules, Swiss dates, the omitted late train and station-coordinate cache reuse. Baden, recovery and backup-route regressions still pass. Earlier regressions cover exact TripInfo identity/segment matching, train/bus/boat conditions, reservation conflicts, secret handling and rerouting after a new prohibition. Browser visual verification was unavailable because the managed preview service was absent.

Private version 17 succeeded on 24 September at 20:43:17 UTC from Site commit `3ecbd8f`, with environment revision 0. It includes verified-access labels, reviewed bus/tram permission and configurable rider/electric timing, along with the preceding all-mode, public-data and overnight fixes. OJP runtime activation remains separate. Publication details are in [WEBSITE.md](WEBSITE.md). The existing owner-private Site is reused; GitHub pushes do not automatically publish it.

## Immediate next actions

1. Recheck the overnight Zürich–Laax example in the published app with its exact travel date; service replacements and bicycle restrictions vary by date. The 2 November controlled/live-source replay finds the 23:12 IR35 to Chur, then cycling to Laax. The earlier provider-timing result was about 03:20; new rider profiles change that estimate (see EXPERIMENTS.md).
2. Optionally configure the Site runtime OJP key to add bicycle-filter/TripInfo evidence alongside the public feed.
3. Recheck 3–6 fixed real journeys for timing, road access, missed candidates and permission completeness, including a tram example.
4. Inspect national GTFS mode/operator/calendar coverage and a dated OSM extract before claiming a complete Swiss graph.
5. Compare the sampled approach with OpenTripPlanner and complete timetable/street data; validate cycling times and station entrances against rides. No RAPTOR/ULTRA or OTP migration is implemented.
6. Continue user interviews before expanding the product scope.

## Remaining risks and parked work

Carriage-rule coverage, sampled service discovery, cycling estimates, incomplete OSM attributes and station/platform access remain the main technical uncertainties. Demand and the value of an intermediate cycling leg still need validation.

Native apps, ticket sales, real-time disruptions, nationwide product expansion, social/community features, carbon dashboards, machine-learning personalization, turn-by-turn navigation and production-scale infrastructure remain outside the immediate milestone. National data evaluation does not itself change the pilot product scope.

## Updating this file

Keep this summary short and factual. Record changes to earlier decisions as dated entries in `DECISIONS.md`; retain experiment history in `EXPERIMENTS.md`. An uploaded copy is a snapshot, not an automatically synchronized source. Repository code, tests and verified publication records determine the current state.
