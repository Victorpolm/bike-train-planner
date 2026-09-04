# Architecture

## Prototype philosophy

This is a research/product prototype first.

Optimize for:

- transparency
- reproducibility
- modularity
- rapid experiments
- debuggability

Do not optimize prematurely for:

- massive scale
- microservices
- separate native mobile apps
- perfect deployment infrastructure
- highly generalized routing abstractions

## Plausible initial stack

### Frontend

Responsive TypeScript web app.

**Decision:** Start web-first, not with separate iOS and Android apps.

### Map

MapLibre.

### Street / cycling data

OpenStreetMap.

### Transit data

Swiss GTFS / national open public-transport data.

### Routing

OpenTripPlanner is the first serious candidate because it already combines OSM + GTFS and supports multimodal bicycle use cases.

**Decision:** Do not write the entire routing engine from scratch unless existing engines prove structurally insufficient.

### Spatial database

PostgreSQL + PostGIS when custom storage, spatial queries, data-quality overlays or rule datasets make it useful.

### Elevation

Swiss federal/open terrain data later.

### Backend

Possible languages include TypeScript, Kotlin or Python. Choose based on integration needs rather than ideology.

### Deployment

A single European cloud region is sufficient initially.

### Analytics

Prefer privacy-respecting event analytics.

## Component boundaries

Keep these concerns conceptually separate:

### 1. Street routing

OSM → bicycle route and street attributes.

### 2. Transit routing

GTFS → time-dependent transit itinerary.

### 3. Multimodal routing

Combine cycling access/egress with transit and transfers.

### 4. Bicycle-rule subsystem

Determine bicycle carriage permission, reservations and uncertainty.

### 5. Preference / ranking layer

Compare route alternatives by time, comfort, transfers and other attributes.

### 6. Presentation layer

Explain alternatives and their trade-offs.

### 7. Data-quality layer

Represent uncertainty, missing data and known bad segments/rules.

This modularity matters because each component may evolve independently.

## OpenTripPlanner questions to answer early

Before writing custom routing code, determine:

- how OTP models bicycle-on-transit
- how it chooses bike access/egress stations
- how bicycle permissions are derived from GTFS
- how bicycle safety/comfort factors work
- how route preferences can be customized
- whether route alternatives expose enough raw attributes for custom re-ranking
- where custom rule logic can be injected
- how much station transfer information it exposes

## Engineering principles

- Keep cost parameters explicit and configurable.
- Preserve raw journey attributes even if the MVP uses a scalar score.
- Isolate bicycle-rule logic from routing logic.
- Isolate frontend/UI from routing experiments.
- Build representative regression journeys, not just unit tests.
- Document data assumptions near the code that uses them.
- Prefer a simple reversible choice over a complex supposedly future-proof design.

## Reproducibility

Maintain:

- explicit dependency versions
- setup instructions
- small scripts for downloading/preparing data
- example configuration
- representative test journeys
- deterministic tests where possible

Development instructions should distinguish Windows PowerShell, cmd, WSL and Bash when commands differ.

## UI concept

Likely core screens:

1. Journey search
2. Journey comparison
3. Journey detail with map and bicycle/train instructions

The user should see complexity only when it is useful. Prefer progressive disclosure.

## Future architecture — only if needed

Possible later components:

- realtime disruption ingestion
- user preference profiles
- crowdsourced correction pipeline
- bike parking availability
- train composition / bicycle coach location
- GPX/navigation integration
- international rule datasets

These belong in the backlog until the core planner is validated.