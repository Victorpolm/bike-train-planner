# Initial mathematical model — historical reasoning

This note preserves the **initial mathematical ideas that motivated the routing model**, before they were cleaned up into the more formal formulation in `ROUTING.md`.

It is intentionally historical: these are not all final decisions. The point is to preserve how the problem was first understood, which simplifications were proposed, and which failure modes immediately appeared.

## 1. Initial intuition: this is a graph problem

The first abstraction was that the journey-planning problem looks structurally similar to a public-transport routing problem such as the one solved by Google Maps or other multimodal planners.

The idea was:

- represent the transport network as a graph;
- label each edge by transport mode;
- in the simplest version, the important labels are `bike` and `public_transport`;
- associate a cost/weight with each edge;
- the primary weight is travel time, but the meaning and calculation of that weight depend on the edge label;
- impose constraints for bicycle compatibility and possible mode transitions;
- solve an optimization problem on that graph.

In compact form:

`G = (V, E)`

with a mode label

`m : E -> {bike, public_transport}`

and a time cost

`t : E -> R_+`.

The first mental model was therefore not “a cycling router plus a train search glued together”, but rather a **single multimodal graph / optimization problem** where cycling and public-transport edges coexist.

## 2. Edge costs depend on the mode

The initial formulation assumed that travel time is the natural first cost, but that its construction depends on the edge type.

For a cycling edge `e`:

`t_bike(e)` might depend on:

- length;
- assumed bicycle speed;
- slope;
- surface;
- later, cycling comfort or road quality.

For a public-transport edge `e`:

`t_PT(e)` is determined by timetable information and therefore depends on departure time.

So even in the first model, the cost function is mode-dependent:

`t(e) = t_{m(e)}(e)`.

This immediately suggests that the graph is ultimately **time-dependent**, because a train edge cannot be assigned a single static duration independently of when the traveller reaches the station.

## 3. Basic optimization problem

The first simplified objective was:

> Find a feasible path from origin to destination minimizing total travel time.

For a path `P`,

`T(P) = sum_{e in P} t(e)`.

Then the prototype problem is

`min_P T(P)`

subject to multimodal feasibility constraints.

Possible constraints already implicit in the idea include:

- cycling is allowed on each bicycle edge used;
- a public-transport leg accepts bicycles;
- the traveller can physically reach the departure station before departure;
- transfer times are respected;
- cycling and transit segments join at valid stations or access points;
- impossible bicycle carriage is excluded.

At this stage, the main attraction of the graph formulation was that once the modes and constraints are encoded correctly, the problem becomes recognizable as a graph-theory / constrained-optimization problem rather than a collection of ad-hoc trip-planning rules.

## 4. First prototype simplification: restrict candidate stations

A simple prototype idea was to avoid searching the entire Swiss transit network from every origin.

One natural rule is:

> only consider stations reachable within a fixed cycling-time radius, for example 20 minutes.

Let

`S_r(o) = {s : bike_time(o, s) <= r}`

be the set of candidate departure stations around origin `o`, with an analogous set around destination `d`.

The simple algorithm would then be roughly:

1. compute candidate departure stations within `r` cycling minutes of the origin;
2. compute candidate arrival stations within `r` cycling minutes of the destination;
3. search for bicycle-compatible public-transport connections between these sets;
4. add cycling access and egress times;
5. choose the minimum-total-time feasible journey.

For a candidate pair `(s_o, s_d)`, a simplified journey cost is

`J(s_o, s_d) = bike_time(o, s_o) + PT_time(s_o, s_d) + bike_time(s_d, d)`.

The prototype then seeks

`min_{s_o in S_r(o), s_d in S_r(d)} J(s_o, s_d)`

subject to bicycle carriage and timetable feasibility.

This is deliberately much simpler than a fully integrated multimodal shortest-path algorithm, but it is easy to understand and test.

## 5. Immediate failure mode of the fixed-radius model

A problem with the fixed-radius prototype appeared immediately:

> there may be no public-transport service accepting bicycles from any station within the chosen 20-minute cycling catchment.

That would cause the algorithm to return “no solution” even when a perfectly reasonable journey exists if the user cycles somewhat farther to another station.

So the fixed radius creates an artificial infeasibility caused by the algorithm rather than by the transport network.

Formally, it is possible that

`Feasible(S_r(o), S_r(d)) = empty`

while for some larger radius `r' > r`,

`Feasible(S_{r'}(o), S_{r'}(d)) != empty`.

This was identified as an important structural weakness of the first prototype.

## 6. Initial proposed fix: adaptive radius expansion

The first proposed solution was:

1. search for candidate stations in the initial catchment;
2. calculate the multimodal routes;
3. if no feasible bicycle-compatible public-transport journey exists, identify the nearest useful station / current search scale;
4. enlarge the cycling search radius;
5. recompute;
6. continue until at least one feasible route exists.

The informal proposal was to increase the radius by roughly another **20 minutes of cycling** when the first search fails.

A simple version is:

`r_{k+1} = r_k + 20 min`.

More generally:

`r_{k+1} = r_k + Δr`.

The important idea is not the exact value 20 minutes. It is:

> **the cycling catchment should expand when the initial multimodal problem is infeasible, so that the search procedure itself does not manufacture “no route” answers.**

This was an early attempt to guarantee that the prototype can usually produce at least one solution when a realistic solution exists.

## 7. Why this creates an interesting optimization question

Once the radius is allowed to expand, station selection becomes part of the optimization problem rather than a fixed preprocessing rule.

The system is balancing at least:

- more cycling to reach a better station;
- potentially shorter train travel;
- access to a train that permits bicycles;
- fewer transfers;
- better arrival station;
- total journey time.

A farther station can produce a better overall journey.

So “nearest station” is not generally equivalent to “best station”.

This is a key conceptual point that should remain visible in later algorithm design.

## 8. Initial concern about future generalization

A concern arose immediately after proposing the simple model:

> the prototype may be easy to implement as a minimum-time problem, but will that design make it difficult to evolve later into a Pareto / multi-objective model?

This is one of the most important early architectural questions.

The simple prototype wants something like:

`min T(P)`.

But the real user problem may involve several competing quantities:

- total journey time;
- cycling time;
- cycling comfort;
- number of train changes;
- waiting time;
- bicycle reservation burden;
- elevation;
- transfer difficulty.

So a path can naturally have a cost vector

`F(P) = (T(P), B(P), C(P), N(P), R(P), H(P), ...)`.

Then two routes may be incomparable:

- Route A is faster but involves unpleasant cycling and two transfers.
- Route B is slower but comfortable and direct.

This suggests a later Pareto formulation:

A journey `P1` dominates `P2` if it is no worse on every relevant objective and strictly better on at least one.

The planner could eventually return representative non-dominated journeys rather than pretending that one universal scalar optimum exists.

## 9. Early architectural conclusion

The conclusion was **not** to build the full Pareto model immediately.

Instead:

- keep the first prototype simple;
- optimize primarily for feasibility and total time;
- but store the individual journey attributes separately;
- avoid an architecture where all information is irreversibly collapsed into one scalar;
- leave room to replace ranking with multi-objective/Pareto logic later.

In other words:

> build a simple model now, but do not make the simple model a dead end.

This remains one of the central design principles of the project.

## 10. Relationship to the current formal model

The later `ROUTING.md` formulation generalizes these initial ideas into:

- a multimodal, time-dependent graph;
- explicit cycling and transit edge attributes;
- generalized cycling costs;
- bicycle-carriage constraints;
- adaptive candidate-station generation;
- possible multicriteria / Pareto routing.

The present document should therefore be read as the **origin of the mathematical model**, while `ROUTING.md` describes the current cleaned-up formulation.

## 11. Questions that were still unresolved at the initial stage

The original reasoning left several open mathematical / algorithmic questions:

1. Should cycling access/egress and public transport really be represented in one graph, or is a staged algorithm cleaner for the MVP?
2. How should candidate stations be generated without arbitrary fixed-radius failure modes?
3. Should the search radius expand only when no solution exists, or also when a farther station could improve an existing solution?
4. What stopping rule guarantees that additional stations cannot produce a materially better route?
5. Which bicycle constraints should be hard feasibility constraints and which should be costs?
6. How should timetable dependence be incorporated into the graph/state space?
7. How should transfer waiting time be represented?
8. Which quantities eventually deserve separate Pareto dimensions?
9. Can a simple scalar prototype be designed so that moving to a Pareto model later does not require rewriting the whole system?
10. Which of these questions are already solved adequately by OpenTripPlanner / RAPTOR-style routing and therefore should not be reinvented?

These are useful research questions because they connect the initial intuitive model to both the prototype and the longer-term mathematical problem.