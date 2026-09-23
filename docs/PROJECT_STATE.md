# Project state

_Last consolidated: 2026-09-21. Source implementation and publication status are distinct._

## Objective and scope

**Decision:** Validate useful bicycle + public-transport journeys in a small Swiss pilot area. The bicycle accompanies the traveller throughout. Preserve raw route attributes, represent missing carriage rules as uncertainty, and describe cycling infrastructure without claiming objective safety.

## Current implementation

**Fact:** `prototype-v0/` is the active React/TypeScript/Leaflet application. The original geometric prototype is preserved in Git history and historical fixtures; the current code has progressed beyond simple station enumeration and fastest-arrival ranking.

- **Baseline / Extended:** The same sampled timetable graph and resource limits, allowing zero versus at most one automatic intermediate cycling leg. Ordinary transit/walking changes are allowed in both.
- **Three independent comparisons:** Confirmed bicycle permission on every transit leg; allowing uncertain permission but excluding prohibitions; all public transport with bicycle rules ignored. The third is a labelled reference and may contain services that prohibit bicycles. Avoid buses applies to all three. Deduplicate after optimization; preserve each group's categories and arrival allowance.
- **Results:** Routed cycling-only comparison, then fastest with transit, fewest boardings and least cycling or walking; optional least active time at one endpoint. Raw cycling and walking remain separate. Each transit comparison has its own 60-minute alternative window.
- **Cycling:** Directed BRouter road routes and terrain-aware time estimates determine train readiness and budgets. No geometric fallback. Profiles show elevation, surfaces, infrastructure and approximate speed bands with explicit unknowns. Endpoint gaps up to 250 m remain visible and add estimated walking time.
- **Journey input:** Address suggestions, map selection and dragging, up to four ordered visits, route reversal, Swiss departure time and a 24-hour whole-journey window. Visits share cycling/boarding/time budgets; stopover duration is zero.
- **Usability:** Progressive proposals survive cancellation; journey cards explain all legs, waiting, boarding locations and available platforms. The map shows observed stops and routes. Cycling presets include Above 150 minutes within the 24-hour horizon.
- **Data acquisition:** Local and rail candidate coverage, bounded outward exploration and an 18-request timetable cap. Ordered-stage queries preserve independently reachable permission-scope times. Sampled acquisition can still miss services and is not globally optimal.

The third comparison does not imply a complete national dataset. See [the mathematical model](MATHEMATICAL_MODEL.md), [permission contract](BICYCLE_PERMISSION_AND_OJP.md) and [coverage audit](TRIPINFO_AND_NETWORK_COVERAGE.md).

## Bicycle permission and OJP

**Fact:** The production Transport API feed does not supply the positive dated-service evidence required by the strict search. General operator policies remain uncertain. The confirmed group can truthfully be empty even when bicycles are actually permitted.

**Fact:** The first OJP TripRequest benchmark passed all 16 calls using a repository Actions secret. It found useful but incomplete bicycle notes. The website still uses its existing timetable provider. [Recorded results](OJP_BENCHMARK_2026-09-21.md).

**Implemented evaluation tooling:** A bounded TripInfo command and manual workflow request one dated service, preserve service/stop conditions, reject mismatched identities and leave permission unassessed. Official documentation has been reviewed; a live TripInfo result has not yet been captured in this change. [Research, commands and limits](TRIPINFO_AND_NETWORK_COVERAGE.md).

**Decision:** Keep the three comparisons simple. Remaining bicycle spaces, occupancy, reservation availability and booking integration are parked by explicit user instruction. Reservation requirements may remain explanatory conditions; permission is distinct from guaranteed boarding.

## Network coverage

**Fact:** We do not have a complete, verified local graph/map of all Swiss terrestrial and boat public transport, or an audited inventory of every cycle path. The app queries selected services and BRouter routes.

The national Swiss GTFS source includes land modes and boat/ferry categories, but is not imported. BRouter uses OSM; availability of a road route does not establish completeness of every path or tag. Transit map lines are schematic. The cycling profile disables ferries, which must appear as explicit transit legs. See [source coverage versus app coverage](TRIPINFO_AND_NETWORK_COVERAGE.md).

## Verification and publication

**Automated verification for this source change:** 108 app tests, 13 Python evaluation tests, TypeScript and the production build pass. New regressions distinguish prohibited/unknown/confirmed winners before dominance, preserve Avoid buses, retain boat categories, and check independently timed onward queries across a requested visit. See [EXPERIMENTS.md](EXPERIMENTS.md).

**Publication:** The last verified successful private-site publication is version 13, 21 September 2026 at 07:38 UTC, preceding this three-comparison change. This revision has not been deployed. GitHub pushes do not automatically publish the Site. [Website access and development](WEBSITE.md) explains the separate publication step.

## Immediate next actions

1. Publish the verified three-comparison source to the existing private Site and check its desktop/mobile presentation.
2. Run the bounded TripInfo inspection for dated train, bus/tram and boat services; compare notes with TripRequest on the actual boarded segments. Missing notes remain unknown.
3. Evaluate a server-side OJP adapter and evidence mapping before replacing the website's timetable source. Never expose its API key to the static frontend.
4. Recheck 3–6 fixed real journeys, recording exact public endpoints, departure, paths, time to first result, missed candidates and unresolved permission.
5. Compare the sampled approach with OpenTripPlanner and complete timetable/street data; validate cycling times and station entrances against real rides. No RAPTOR/ULTRA or OTP migration is implemented.
6. Continue user interviews before expanding the product scope.

## Remaining risks and parked work

Carriage-rule coverage, sampled service discovery, cycling estimates, incomplete OSM attributes and station/platform access remain the main technical uncertainties. Demand and the value of an intermediate cycling leg still need validation.

Native apps, ticket sales, real-time disruptions, nationwide product expansion, social/community features, carbon dashboards, machine-learning personalization, turn-by-turn navigation and production-scale infrastructure remain outside the immediate milestone. National data evaluation does not itself change the pilot product scope.

## Updating this file

Keep this summary short and factual. Record changes to earlier decisions as dated entries in `DECISIONS.md`; retain experiment history in `EXPERIMENTS.md`. An uploaded copy is a snapshot, not an automatically synchronized source. Repository code, tests and verified publication records determine the current state.
