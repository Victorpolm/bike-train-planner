# Routing and optimization

## 1. Conceptual model

Treat the planner as a multimodal, time-dependent graph problem.

Let `G = (V, E)`.

Vertices may represent:

- street intersections
- station entrances
- transit stops
- platforms or transfer states
- other multimodal connection points

Edges may represent modes such as:

- cycling
- walking / transfer
- train
- tram
- bus

Each edge can carry attributes such as:

- travel time
- distance
- mode
- cycling comfort/stress proxy
- elevation / slope
- surface
- bicycle permission
- reservation requirement
- accessibility
- reliability

Transit edges are time-dependent. Cycling edges are primarily geographic but have user-dependent generalized costs.

## 2. Why a single shortest-path objective is probably not enough

A journey can be characterized by a vector such as:

`F(P) = (total_time, cycling_time, discomfort, transfers, elevation, reservation_complexity, waiting)`

There is no obviously universal optimum. A slower route may be preferred because it:

- avoids high-stress roads
- reduces difficult transfers
- avoids a bicycle reservation
- reduces cycling distance
- uses better infrastructure
- avoids stairs

**Hypothesis:** The long-term problem is multi-objective and may be better represented through a small set of Pareto-efficient alternatives.

## 3. Prototype approach

**Decision:** Do not build a full multicriteria routing framework before validating the product.

A scalar generalized cost is acceptable initially, provided the underlying journey attributes remain separately available for later ranking and Pareto analysis.

A conceptual scalarization is:

`J(P) = α·time + β·cycling_discomfort + γ·transfers + δ·reservation_burden + ...`

This is useful for prototyping but should not be mistaken for the final behavioural model.

## 4. Cycling comfort model

One candidate edge cost is:

`C(e) = t(e) × M_road × M_speed × M_cycleway × M_surface × M_slope`

Possible factors:

- protected cycleway: strong preference
- quiet 30 km/h street: preference
- painted lane with traffic: moderate penalty
- 50–80 km/h road without cycling infrastructure: strong penalty
- poor surface/cobblestones: penalty
- steep climb: user-dependent penalty
- bicycle-prohibited segment: infeasible
- stairs: infeasible or very strongly penalized depending on profile

Potential route profiles:

### Fast
Primarily minimize time.

### Balanced
Trade time against comfort.

### Comfortable
Strongly prefer protected/quiet infrastructure.

### Cargo bike (later)
Strongly avoid stairs, narrow barriers, poor surfaces and difficult station transfers.

### E-bike (later)
Reduce the cost of elevation.

## 5. Comfort is not objective safety

**Decision:** Do not promise “safe routes” from map attributes alone.

Prefer:

- comfortable
- low-stress
- infrastructure-preferred
- quieter

When possible, expose why a route scores better, e.g. percentage on protected infrastructure or main-road distance avoided.

## 6. Candidate-station problem

A naive rule such as “consider all stations within 20 cycling minutes” can produce a structural failure: no feasible bicycle-compatible transit option may exist in that catchment even though a slightly farther station yields a good journey.

**Open question:** How should candidate stations be generated and pruned?

### Adaptive catchment idea

1. Search within an initial cycling-time catchment.
2. Generate feasible transit combinations.
3. Apply bicycle constraints.
4. If no reasonable solution exists, expand the catchment.
5. Stop when suitable routes exist or a meaningful maximum is reached.

This avoids unnecessary “no route” results but is not yet a final algorithmic design.

### Other approaches to investigate

- nearest-station expansion ordered by cycling generalized cost
- cycling isochrones
- transit-aware station pruning
- bidirectional multimodal search
- RAPTOR-style access/egress search
- McRAPTOR / multicriteria transit routing
- Connection Scan Algorithm variants
- OpenTripPlanner’s existing access/egress and transit search logic

**Decision:** Research what OTP already does before implementing custom station selection.

## 7. Transfers with a bicycle

Standard pedestrian transfer time may underestimate the burden of moving a bicycle.

Potential transfer cost inputs:

- time
- stairs
- elevators
- ramps
- platform changes
- station size
- bicycle type

A future model could use:

`C_transfer = f(time, stairs, elevator, platform_change, bicycle_type)`

**Open question:** Is station infrastructure data complete enough to support this in Switzerland?

## 8. Bicycle carriage constraints

Each transit leg should eventually have an explicit state such as:

- bicycle definitely allowed
- allowed with conditions
- reservation required
- reservation recommended
- bicycle not permitted
- uncertain / unknown

Missing data must not silently become “allowed.”

## 9. Pareto direction

Potential objectives include:

- total journey time
- cycling time
- cycling distance
- discomfort / low-stress score
- elevation
- number of transfers
- waiting time
- transfer difficulty
- reservation complexity
- reliability

Important research questions:

- Which objectives actually matter to users?
- Which should be hard constraints rather than objectives?
- How should partial-path dominance be defined in a time-dependent multimodal setting?
- Can representative Pareto routes be generated efficiently enough for interactive use?
- Is simple ranking over OTP-generated alternatives sufficient for the MVP?

## 10. Algorithms worth studying

When useful, research:

- RAPTOR
- McRAPTOR
- Connection Scan Algorithm
- multi-objective shortest path
- label-setting / label-correcting algorithms
- Pareto dominance pruning
- transfer patterns
- time-dependent shortest paths
- access/egress optimization
- contraction / speed-up methods

Do not implement an algorithm merely because it is mathematically interesting. Always connect it back to a user-facing failure mode.

## 11. Algorithm discussion template

For any proposed routing method, specify:

- state space
- edges/actions
- objective(s)
- hard constraints
- dominance relation
- complexity
- required data
- approximation/simplifications
- expected failure modes
- product meaning

## 12. Golden regression journeys

Maintain representative journeys in `EXPERIMENTS.md` covering:

- simple bike + train
- multiple plausible departure stations
- fast-but-unpleasant vs slower-comfortable cycling
- bicycle reservation issue
- no feasible route in the initial catchment
- difficult transfer

These should become regression tests for routing quality, not only software correctness.