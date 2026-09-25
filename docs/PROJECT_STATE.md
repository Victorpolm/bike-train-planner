# Project state

_Last consolidated: 2026-09-25. Source implementation and publication status are distinct._

## 25 September card prices and named destinations

Collapsed journey cards show bicycle ticket/reservation price options immediately below boardings, using the current fare profile. GA and an annual bike pass affect additional cost; full/Half Fare passenger tickets remain separate quotes. Unsupported or prohibited journeys never receive an invented total.

Place input combines existing stations/addresses with Swiss OpenStreetMap venues through Photon, with categories and addresses. Whole-query relevance is ranked before limiting suggestions. Typing “fortyseven baden” resolves the bath rather than automatically accepting Baden town. See [place-search scope and sources](PLACE_SEARCH.md). Verified 163 application tests and production builds, a live FORTYSEVEN lookup, and collapsed-card server rendering; no new browser visual check is claimed.

## 25 September implementation update

The approved Swiss-first proposal is being implemented. [Current delivery and release gates](SWISS_IMPLEMENTATION.md) supersede older coverage statements below where explicitly noted.

- Sourced SBB domestic IC/IR/regional, BLS and ordinary domestic RhB rules expand verified permission. Date/line/season/holiday IC reservations, separate ticket requirements and dated exceptions reduce avoidable unknowns. RhB reservation details remain unknown without service evidence; premium trains are not included in its default.
- Full fare/Half Fare/GA and annual-bike-pass preferences are stored on the device. Published bicycle day-pass/reservation options appear; passenger total quotes remain pending production fare access and validation.
- The official parking layer contains 1,608 BIKE facilities in the checked download, with capacity separated from availability. It does not change routing or introduce a park-and-ride mode.
- One 60-second deadline spans each whole search, including ordered stages. Completed results survive timeout. A separate explicit Extended action gets its own deadline and retains user cancellation.
- Downloaded/indexed national GTFS and downloaded/audited the Swiss OSM extract. The local timetable service shares bicycle rules and independently searches each scope; production activation, performance, frequencies, disruptions and connected station pathways remain gates. The running website still uses the live providers.
- [GPX instructions](GPX_RECORDING.md) and a local slope-bin analysis tool are ready. No real rider recordings have been supplied or calibrated.
- Verified 157 application tests, five national timetable tests, five import/GPX tests and 13 existing OJP Python tests. Live Baden and late Zürich–Chur–Laax checks found useful routes; the late search first transit result took 25.3 seconds and the search timed out gracefully at 60 seconds. The preferred initial latency target is not yet met consistently.

Private Site version 20 was verified on 25 September at 13:36 UTC; all 97 tracked application files match implementation commit cead54c468ea570eed97ae551797915f3d3fb5e9, including card prices and named-place search. Keep the existing Site owner-only. The GitHub repository is public; this corrects earlier descriptions of it as private. No paid hosting, public access expansion or recurring refresh job has been created. Ask before incurring hosting costs. Europe, additional modes and richer profiles follow Swiss validation.

## Objective and scope

**Decision:** Validate useful bicycle + public-transport journeys in a small Swiss pilot area. The bicycle accompanies the traveller throughout. Preserve raw route attributes, represent missing carriage rules as uncertainty, and describe cycling infrastructure without claiming objective safety.

## Current implementation

**Fact:** `prototype-v0/` is the active React/TypeScript/Leaflet application. The original geometric prototype is preserved in Git history and historical fixtures; the current code has progressed beyond simple station enumeration and fastest-arrival ranking.

- **Baseline / Extended:** The same sampled timetable graph and resource limits, allowing zero versus at most one automatic intermediate cycling leg. Ordinary transit/walking changes are allowed in both.
- **One all-mode access selector:** Verified access only; also allow unverified access; also include prohibited transit. The selected scope controls feasibility before label pruning in Baseline, Extended and ordered visits. Only its category winners appear. Prohibitions remain explicit when included. The legacy independent solves remain available internally for regression comparisons.
- **Results:** Routed cycling-only comparison, then fastest with transit, fewest boardings and least cycling or walking; optional least active time at one endpoint. Raw cycling and walking remain separate. Each transit comparison has its own 60-minute alternative window.
- **Cycling:** Directed BRouter road routes and configurable City/Relaxed/Regular/Sportive/Electric profiles determine train readiness and budgets. Regular now defaults to 25 km/h on flat ground. Editable flat speed (8–35 km/h) calibrates power; per-slope timing and electric climbing assistance replace a blanket percentage. A live slope-speed table explains the estimate. Cache entries distinguish pace and assistance. Temporary outages can use validated OSRM bicycle routes, with unavailable elevation/road details kept unknown. No geometric fallback. Profiles show elevation, surfaces, infrastructure and approximate speed bands with explicit unknowns. Endpoint gaps up to 250 m remain visible and add estimated walking time.
- **Journey input:** Address suggestions, map selection and dragging, up to four ordered visits, route reversal, Swiss departure time and a 24-hour whole-journey window. Visits share cycling/boarding/time budgets; stopover duration is zero.
- **Usability:** Progressive proposals survive cancellation; journey cards explain all legs, waiting, boarding locations and available platforms. The map shows observed stops and routes. Cycling presets include Above 150 minutes within the 24-hour horizon.
- **Data acquisition:** Local and rail candidate coverage, bounded outward exploration and an 18-request timetable cap. Two extra bounded rail-exit queries use the original ready time to uncover earlier trains omitted by onward-wait optimization. Their cycling finishes are checked promptly. Other unchecked exits are refined by arrival/boarding objectives. Routes are reused by directed station identity across small coordinate differences. Provider budgets exclude time waiting on the other provider; temporary failures have bounded recovery and rate-limit cooldowns. Ordered-stage queries preserve independently reachable permission-scope times. Sampled acquisition can still miss services and is not globally optimal.

The all-transit choice does not imply complete national routing. A national dated index now exists locally; the deployed search still samples live services. See [the mathematical model](MATHEMATICAL_MODEL.md), [permission contract](BICYCLE_PERMISSION_AND_OJP.md) and [current data audit](SWISS_DATA_AUDIT_2026-09-25.json).

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

Private version 18 succeeded on 24 September at 22:06:03 UTC from Site commit `ac87a6c`, with environment revision 0. It adds five neutral pace presets with Regular at 25 km/h, and retains verified-access labels, reviewed bus/tram permission and configurable rider/electric timing, along with the preceding all-mode, public-data and overnight fixes. OJP runtime activation remains separate. Publication details are in [WEBSITE.md](WEBSITE.md). The existing owner-private Site is reused; GitHub pushes do not automatically publish it.

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
