# Research log

This file tracks what we have investigated, what we think we know, and what still needs verification.

## Product positioning

**Working view:** The strongest version of the project is a focused bike + public-transport planner, not a generic cycling map.

**Why:** The difficult and differentiating problems are multimodal routing, bicycle-carriage constraints, station access and route trade-offs.

## Existing products / adjacent systems to study

- SBB
- Google Maps
- Apple Maps
- Transit
- Komoot
- Trainline
- SwitzerlandMobility
- Citymapper
- OpenTripPlanner deployments
- regional European transport planners

For each, investigate:

- bike routing
- bike + transit
- whether the bicycle stays with the traveller
- bicycle carriage rules
- reservation handling
- comfort routing
- Swiss coverage
- station-access detail
- main weakness relative to this project

## Routing research

Topics identified as potentially relevant:

- OpenTripPlanner routing modes and bicycle-on-transit behavior
- bicycle safety/comfort factors in OTP
- RAPTOR
- McRAPTOR
- Connection Scan Algorithm
- multi-objective shortest paths
- Pareto routing
- label-setting / label-correcting algorithms
- access/egress optimization
- transfer patterns
- bicycle Level of Traffic Stress
- cycling route-choice models
- generalized transport cost
- discrete-choice models

### Important open question

How much of the candidate-station and multimodal search problem is already solved well enough by OTP?

Do not implement custom theory before answering this.

## Candidate station issue

A fixed rule such as “stations within 20 cycling minutes” can fail if none has a feasible bike-compatible transit connection.

Ideas discussed:

- expand the cycling catchment if no solution exists
- order stations by cycling generalized cost and expand progressively
- use isochrones
- make station generation transit-aware
- rely on / modify OTP’s access-egress logic
- investigate RAPTOR-style multimodal access/egress

No final choice yet.

## Multi-objective direction

Potential objectives:

- total time
- cycling time
- cycling distance
- cycling comfort
- elevation
- transfers
- waiting
- transfer difficulty
- bicycle reservation complexity
- reliability

**Working hypothesis:** A small set of Pareto-efficient alternatives may eventually be more useful than a single opaque scalar optimum.

**Counterpoint:** A simple scalar model and re-ranking may be sufficient for the MVP.

## Comfort model

Initial conceptual form:

`C(e)=t(e) × road × speed × cycleway × surface × slope factors`

Need to research:

- which OSM tags are sufficiently complete in Switzerland
- Level of Traffic Stress models
- empirical bicycle route-choice studies
- how users trade time for lower-stress infrastructure
- how OTP’s existing bicycle factors can be customized

## Bicycle carriage

Potentially the hardest data problem.

Need to determine:

- which GTFS fields are actually populated in Swiss feeds
- whether bicycle permission exists at route/trip level
- where reservation requirements are published
- whether operator rules can be structured reliably
- how service-specific exceptions are represented
- how to express uncertainty to the user

A manually maintained pilot ruleset is acceptable if automation is not yet reliable.

## Station transfers

Need to investigate availability of:

- lifts
- stairs
- ramps
- platform topology
- entrances
- transfer paths

Question: can transfer cost for a cyclist be modeled from public data well enough to matter?

## User research

Central empirical questions:

- How often does this problem occur?
- Which users experience it most strongly?
- What tools do they combine today?
- Which information is actually missing?
- Do bicycle rules change trip choices?
- How much additional cycling will people accept for a better train or better roads?
- Do users prefer one recommendation or several trade-off alternatives?

## Evidence discipline

When adding findings:

- link primary sources where possible
- record date accessed
- distinguish source fact from our interpretation
- note whether evidence is Swiss-specific or from another context
- record contradictory evidence rather than smoothing it away

## Future research entry template

### YYYY-MM-DD — Topic

**Question:**

**Sources:**

**Findings:**

**Interpretation:**

**Contradictions / uncertainty:**

**Implication for project:**

**Next test:**