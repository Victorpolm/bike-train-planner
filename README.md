# Bike + Train Journey Planner

Research and prototype for a bicycle + public-transport journey planner, initially focused on Switzerland.

## Core question

> Given an origin, destination, departure time, bicycle and user preferences, what are the most useful practical journeys combining cycling and public transport?

The product is deliberately focused on travelling **with a bicycle through the whole multimodal journey**. It is not intended to become a generic map containing everything useful to cyclists.

## Repository as project memory

This repository is the authoritative source for both code and accumulated project knowledge. ChatGPT/Codex sessions should read the documentation before making substantial product, architecture, routing or research recommendations.

### Read in this order

1. [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — where the project stands now.
2. [`docs/PRODUCT.md`](docs/PRODUCT.md) — problem, users, MVP, validation and scope.
3. [`docs/ROUTING.md`](docs/ROUTING.md) — graph formulation, station search, comfort model and multi-objective direction.
4. [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) — OSM, Swiss transport data, bicycle rules, elevation and data risks.
5. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — prototype architecture and engineering principles.
6. [`docs/DECISIONS.md`](docs/DECISIONS.md) — important decisions and their rationale.
7. [`docs/RESEARCH_LOG.md`](docs/RESEARCH_LOG.md) — accumulated research questions and findings.
8. [`docs/USER_RESEARCH.md`](docs/USER_RESEARCH.md) — interview and validation plan.
9. [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md) — technical/product experiments and regression journeys.
10. [`docs/BACKLOG.md`](docs/BACKLOG.md) — later ideas that are intentionally not current priorities.
11. [`CHATGPT_PROJECT_SETTING.md`](CHATGPT_PROJECT_SETTING.md) — short stable instruction block to paste into a ChatGPT Project.

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