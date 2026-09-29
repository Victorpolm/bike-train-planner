# Product

## Product objective

Help someone answer:

> What is the most comfortable practical way to travel from A to B with my bicycle, potentially using public transport?

The central use case is not generic cycling navigation. It is planning a multimodal journey where the bicycle remains part of the trip.

## User problem

A user may currently need to combine several tools to understand:

- how to cycle to a station
- which station to use
- which train or other transit service to take
- whether bicycles are permitted
- whether a reservation is required
- how difficult a transfer is with a bicycle
- how to cycle from the arrival station
- elevation and surface conditions
- bicycle parking, pumps or repairs
- drinking water, snacks and public toilets reachable along a longer ride

**Hypothesis:** Integrating these decisions into one planner can materially reduce friction.

## Intended early product

The first useful version should provide:

- origin and destination search
- cycling route to candidate departure station(s)
- public-transport itinerary
- cycling route from arrival station to destination
- clear bicycle-carriage and reservation information where known
- a small number of meaningful alternatives
- explanation of the trade-off between alternatives

Useful supporting layers can include:

- bicycle parking
- repair shops/stations
- pumps
- drinking water
- public toilets
- snacks, food shops and vending machines
- rentals
- e-bike charging

These are supporting features, not the center of the product.

## Next product milestones — 29 September 2026

**User's requested order:** bike parking → bike shops/repair referencing → broader interface improvements. [APP_ROADMAP.md](APP_ROADMAP.md) gives proposed scope, sequencing and completion criteria. The existing parking pins are a foundation, not yet a recommendation/entrance-routing feature; a dedicated bike-shop directory is not implemented.

**Parking proposal:** help the user find a suitable place near their destination or selected station, understand access/fees/hours and retrieve their bicycle. Keep nominal capacity distinct from availability and cover distinct from security. Begin with a small source-checked pilot and contextual list/map actions. [BIKE_PARKING.md](BIKE_PARKING.md) records the proposal and fresh data audit.

**Shop proposal:** distinguish shops, staffed repairs, self-service stands and pumps, with evidenced services, known hours/contact and explicit Add as stop. A stop changes timing; repairs do not have a known zero duration and a broken bicycle may not be rideable.

**Follow-up user need:** Long rides regularly require water fountains, snacks/vending, public toilets, suitable parking and repair help. Expand the service milestone into [useful stops along the selected cycling route](CYCLING_AMENITIES.md), with category filters, checked access/detours and opening-at-visit information. Include assisted DIY workshops as distinct from professional repair. Distinguish frame-locking support, shelter, access control and CCTV instead of treating surveillance alone as best parking. Later [road-safety research](CYCLING_SAFETY_RESEARCH.md) investigates infrastructure and junctions without presenting heuristics as proven risk.

**Interface recommendation:** include the basic usable/accessible flow in each feature, then simplify the wider search/comparison experience as the third milestone. More amenities should not create more mandatory input fields.

The current bicycle stays with the traveller on transit. A park-and-ride mode that leaves it at a station requires an explicit new choice and bicycle retrieval model; it is a future proposal, not a silent change to today's product. The wider commuting, bikepacking and community vision remains later work, evaluated against actual user demand.

## Journey planning vs navigation

**Decision:** Prioritize journey planning over native turn-by-turn navigation.

The planner should answer questions such as:

- Which station should I cycle to?
- Should I cycle farther to catch a better train?
- How much cycling is involved on each side?
- Can I take my bicycle on this train?
- Is a reservation required?
- Which option is fastest, simpler or more comfortable?

GPX export or handoff to another navigation app can come before building full navigation.

## Route alternatives

Avoid showing many near-duplicate itineraries. Aim for a small number of materially different choices, for example:

- Fastest overall
- Less cycling
- More comfortable cycling
- Simpler train journey / fewer transfers

The labels must correspond to actual trade-offs.

## Explainability

For every recommendation, try to explain why it exists. Examples:

- “Fastest overall.”
- “8 minutes longer, but 3 km less cycling.”
- “Avoids a bicycle reservation.”
- “Uses more protected/quiet cycling infrastructure.”
- “Only one train change.”
- “Cycles to a more distant station but arrives earlier.”

This is important because a multimodal route can look unintuitive compared with a standard shortest-time answer.

## Target users to investigate

Potential segments include:

- daily commuters
- recreational cyclists
- cycle tourists
- e-bike users
- weekend travellers carrying bikes on trains
- cargo-bike users
- parents with trailers
- cyclists who strongly avoid high-traffic roads

Do not assume these groups share one problem. Segment based on observed behaviour.

## Validation

Ask about actual past journeys, not hypothetical interest.

A strong interview opening is:

> Tell me about the last time you travelled somewhere by bicycle and train.

Investigate:

- which apps/sites they used
- where they hesitated
- which information was missing
- whether bicycle restrictions changed the route
- whether station access mattered
- how long planning took
- what went wrong

Heuristic validation targets discussed previously:

- 15–20 interviews
- at least ~10 recent examples of the problem
- at least ~5 people already combining several tools
- at least ~5 willing to test a prototype

These are not statistical proof; they are anti-self-deception thresholds.

## Pilot

A reasonable first closed beta is 30–50 users around Zurich.

Example tasks:

- plan a commute involving bicycle + train
- find a more comfortable route to a station
- determine whether a bicycle reservation is needed
- compare two multimodal alternatives
- report incorrect infrastructure or rule information

Important metrics:

- successful journey searches
- journeys users would actually take
- repeat usage within several weeks
- alternative route selection
- incorrect-data reports
- replacement of multi-app planning

**Decision:** Repeat journey planning is a more important signal than downloads, map views or compliments.

## Geographic expansion

Only expand after local validation.

Possible sequence:

1. Greater Zurich
2. other major Swiss urban regions
3. national coverage
4. international connections to France, Germany, Austria and Italy

## Sustainability hypothesis

Potential causal chain:

better bike + rail planning → lower planning friction → more multimodal bike/rail journeys → substitution away from some car journeys → lower emissions.

Every arrow is an empirical hypothesis. Do not claim environmental impact before measuring actual behaviour change.

## Business model

Do not force monetization early. Later possibilities include:

- consumer subscription / freemium
- tourism partnerships
- employer mobility
- public-sector contracts
- mobility-provider partnerships
- API/licensing/white-label routing
- grants or sustainability funding

The product may also become an open-source, research or partnership project rather than a standalone startup.

## What not to prioritize yet

- integrated ticket sales
- native apps
- social network/community
- gamification
- carbon dashboards
- Europe-wide coverage
- advanced personalization

The core question remains: can we make bike + public-transport planning materially better than the current workaround?
