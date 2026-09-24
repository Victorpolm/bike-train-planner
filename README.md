# Bike + Train Journey Planner

**Latest source update (24 September 2026):** Fixed useful train exits hidden by nearby bus stops, bounded recovery of temporary provider failures, and preservation of valid cycling-only routes. All three reported Baden cases now return useful options in live checks. [Regressions and live results](docs/EXPERIMENTS.md#2026-09-24--baden-train-exits-short-cycling-and-temporary-failures).

Bicycle permission and prerequisites remain separate for every transit leg: permission, bike ticket/pass and bike-space reservation requirement. The three independent comparisons, server-only OJP adapter and scoped TripInfo checks are implemented. [Implementation and live findings](docs/OJP_PERMISSION_2026-09-24.md).

**Access and activation:** The existing GitHub Actions key worked for all nine new train/bus/boat calls, following the earlier 16-call benchmark. The hosted Site needs the same key configured separately as its secret `OJP_API_KEY`; its runtime environment is currently empty. Until then, it uses the fallback timetable and keeps missing permission unknown. No remaining-space or booking integration is included.

Research and prototype for a bicycle + public-transport journey planner, initially focused on Switzerland.

## Open the private website

[**Open private website**](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site)

Sign in with the ChatGPT account that owns the Site. Access is restricted to that account; the link does not make the website public. You can always return here and click this link to use the planner without installing anything.

For local Git setup and the publishing workflow, see [Website access and development](docs/WEBSITE.md). GitHub changes do not automatically update the hosted website. The last verified publication is version 15 (24 September, 18:41 UTC), including the Baden fixes. See [publication status](docs/WEBSITE.md) for the deployed revision; source updates and publication are recorded separately.

**Current cycling:** [Routed cycling and profiles](docs/CYCLING_ROUTES.md) explains the road geometry, train-readiness calculations and data limits.

**Buses with bicycles:** [Bus carriage rules](docs/BUS_BICYCLES.md) documents the new bus preference, sourced operator conditions, prohibited/unverified services, practical boarding information and remaining departure-rule gaps; live bicycle-space availability is explicitly deferred.

**Next work:** [App roadmap](docs/APP_ROADMAP.md) records routing-engine evaluation, bicycle carriage, repair/parking, commuting/bikepacking/expert modes and the later community vision, with delivery order and completion criteria.

## Core question

> Given an origin, destination, departure time, bicycle and user preferences, what are the most useful practical journeys combining cycling and public transport?

The product is deliberately focused on travelling **with a bicycle through the whole multimodal journey**. It is not intended to become a generic map containing everything useful to cyclists.

## Repository as project memory

This repository is the authoritative source for both code and accumulated project knowledge. ChatGPT/Codex sessions should read the documentation before making substantial product, architecture, routing or research recommendations.

### Read in this order

1. [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — where the project stands now.
2. [`docs/PRODUCT.md`](docs/PRODUCT.md) — problem, users, MVP, validation and scope.
3. [`docs/INITIAL_MATHEMATICAL_MODEL.md`](docs/INITIAL_MATHEMATICAL_MODEL.md) — the original graph/optimization formulation, fixed-radius failure mode, adaptive-radius idea, and early Pareto concerns.
4. [`docs/ROUTING.md`](docs/ROUTING.md) — current graph formulation, station search, comfort model and multi-objective direction.
5. [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) — OSM, Swiss transport data, bicycle rules, elevation and data risks.
6. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — prototype architecture and engineering principles.
7. [`docs/FIRST_PROTOTYPE.md`](docs/FIRST_PROTOTYPE.md) — provenance, limitations and preservation of the first runnable implementation.
8. [`docs/DECISIONS.md`](docs/DECISIONS.md) — important decisions and their rationale.
9. [`docs/RESEARCH_LOG.md`](docs/RESEARCH_LOG.md) — accumulated research questions and findings.
10. [`docs/USER_RESEARCH.md`](docs/USER_RESEARCH.md) — interview and validation plan.
11. [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md) — technical/product experiments and regression journeys.
12. [`docs/BACKLOG.md`](docs/BACKLOG.md) — later ideas that are intentionally not current priorities.
13. [`CHATGPT_PROJECT_SETTING.md`](CHATGPT_PROJECT_SETTING.md) — stable instruction block to paste into a dedicated ChatGPT Project.
14. [`docs/CHATGPT_PROJECT_SETUP.md`](docs/CHATGPT_PROJECT_SETUP.md) — exact setup and working routine for that Project.
15. [`AGENTS.md`](AGENTS.md) — repository rules for coding agents.

## Runnable prototype

The runnable prototype is in [`prototype-v0/`](prototype-v0/).

```bash
cd prototype-v0
npm install
npm run dev
```

It compares Baseline (cycling before/after transit) and Extended (at most one intermediate cycling leg). Results show a clearly labelled cycling-only estimate first, followed by fastest transit, fewest boardings and least cycling-or-walking alternatives. Cards open full journey plans; the map shows explored stops and numbered boarding/alighting points with timetable details. Address suggestions and optional cycling presets simplify input. Cycling follows mapped roads, with an elevation profile linked to the map and surface/infrastructure breakdowns. Routed durations determine reachable trains. The cycling comparison and transit proposals appear progressively as their required paths are checked and survive cancellation once available. See [the result and map design](docs/RESULTS_AND_MAP.md), [the implemented mathematical model](docs/MATHEMATICAL_MODEL.md), the prototype README and `docs/EXPERIMENTS.md`. The sampled prototype is not the final routing architecture.

Departure defaults to Leave now, with an optional Swiss date/time. A 24-hour arrival window includes overnight waiting. Initial connection queries now cover feasible rail access as well as the nearest stops; the recorded Libingen–EPFL failure and its repair are in [the experiment log](docs/EXPERIMENTS.md).

Click/tap the map for **Start here**, **Finish here** or **Add intermediate stop**, then drag markers to adjust them. Up to four intermediate stops can be searched, reordered or removed; Reverse route reverses their order too. Routes visit every requested stop in order under one shared cycling/boarding/time budget. Naming keeps the exact clicked coordinates; coordinates remain usable if no nearby name is found. Stopover time is not added yet.

## Documentation semantics

Use explicit status labels:

- **Fact** — supported by a reliable source or direct observation.
- **Decision** — a deliberate current choice, with rationale.
- **Hypothesis** — plausible but not established.
- **Open question** — unresolved and potentially decision-changing.
- **Parked / rejected** — considered but intentionally not active.

Do not let repeated hypotheses silently become facts.

## Current strategic principle

The immediate objective is not to build the perfect multimodal routing engine. It is to determine whether available Swiss data and existing routing infrastructure can produce genuinely useful bicycle + public-transport journeys for real users.
