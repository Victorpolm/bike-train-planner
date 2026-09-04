# Experiments and golden journeys

Use this file to track both product experiments and technical routing tests.

## Experiment template

### YYYY-MM-DD — Name

**Hypothesis:**

**Method:**

**Data / users:**

**Result:**

**Interpretation:**

**Decision / next step:**

## Golden journeys

Maintain a small set of representative real journeys that every routing iteration can be compared against.

### Journey A — Simple bike + train

Purpose: verify basic access → transit → egress works.

Record:
- origin/destination
- expected sensible route(s)
- current route output
- failure modes

### Journey B — Multiple plausible departure stations

Purpose: test station selection rather than nearest-station bias.

### Journey C — Fast vs comfortable cycling

Purpose: test whether route alternatives expose a meaningful time/comfort trade-off.

### Journey D — Bicycle reservation issue

Purpose: verify rule subsystem changes route feasibility or ranking correctly.

### Journey E — No feasible route in initial catchment

Purpose: test adaptive/transit-aware station search.

### Journey F — Difficult transfer

Purpose: expose cases where a pedestrian transfer is acceptable but moving a bicycle is materially harder.

## Data audit experiment

For each golden journey, inspect OSM and timetable data manually and classify problems as:

- product-breaking
- significant but recoverable
- cosmetic/minor

Record missing or inconsistent:

- cycleways
- access restrictions
- surfaces
- barriers/stairs
- station entrances
- carriage permissions
- reservations
- transfer information

## OTP baseline experiment

Before building custom multimodal routing:

1. Load Swiss OSM + GTFS into OpenTripPlanner.
2. Run every golden journey.
3. Save returned itineraries and relevant attributes.
4. Compare against cyclist-selected routes.
5. Identify precisely what OTP gets wrong.

Only then decide which custom routing logic is justified.

## Comfort model experiment

Compare candidate routes under several cost profiles:

- fastest
- balanced
- comfort-biased

Ask real cyclists which route they would take and why. Use this to calibrate whether the cost factors map to actual preferences.

## Product experiment priority

Prefer experiments that answer decision-changing questions over implementation milestones that produce no new information.