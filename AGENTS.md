# Repository instructions for coding agents

## Read first

Before substantial work, read:

1. `README.md`
2. `docs/PROJECT_STATE.md`
3. `docs/DECISIONS.md`
4. the task-relevant documentation and code

The repository is the durable source of truth. Distinguish facts, decisions, hypotheses, open questions and parked ideas.

## Current scope

- Switzerland-first bicycle + public-transport journey planner
- Responsive web prototype and an existing owner-private Site; source and publication are separate
- Bicycle accompanies the traveller through transit
- Bounded multi-label Baseline/Extended routing with road-routed cycling; preserve raw route attributes
- Three independent permission comparisons; prohibited services appear only in the all-transit reference
- TripInfo evidence investigation is active; bicycle-space availability and booking integration are deferred
- Data quality and bicycle-carriage rules are first-class uncertainties

## Change discipline

- Do not create a branch silently. Use `main` for small, explicitly requested changes; ask before a risky redesign.
- Inspect before editing and preserve unrelated work.
- Never commit secrets, `.env` files, `node_modules`, `dist`, caches or downloaded bulk datasets.
- Keep data access, candidate generation, route metrics, feasibility constraints, ranking and presentation conceptually separate.
- Represent unknown bicycle permission as unknown, never as allowed.
- Avoid claiming objective route safety from incomplete infrastructure data.
- Update the relevant documentation whenever durable project knowledge changes.

## Verification

For changes under `prototype-v0/`, run when possible:

```bash
npm test
npm run build
```

For routing changes, also add or update a golden journey or regression case in `docs/EXPERIMENTS.md`.

## Handoff

Report the outcome, files changed, verification, remaining uncertainty and one concrete next step. Never claim a commit, push or passing test without confirmation.
